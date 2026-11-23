/**
 * IndexNow (#311): after a run's deploy is confirmed, `scripts/weekly-run.sh` tells search engines (Bing, Yandex,
 * Seznam, Naver) which URLs the run changed, so an event page is known the day it appears rather than when a crawler
 * next comes by, which can be after the event. The URLs are those the live sitemap gained, lost (so the page is
 * dropped), or re-dated between a copy fetched before the push and one fetched after the deploy: two live copies,
 * since the run's local build can be made as of another day than Vercel's. Nothing here can fail the run.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The site's IndexNow key, kept in one place: the name of the key file it serves from its root (`site/public/<key>.txt`,
 * holding the key alone), which proves to the search engines that whoever sends the URLs owns the host. The key is
 * public by design, so it is committed.
 */
export async function indexNowKey(publicDir: string): Promise<string> {
  const files = (await readdir(publicDir)).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  const [file] = files;
  if (file === undefined) throw new Error(`no IndexNow key file (<32 hex characters>.txt) in ${publicDir}`);
  if (files.length > 1) throw new Error(`${files.length} IndexNow key files in ${publicDir}: ${files.join(", ")}`);
  const key = file.slice(0, -".txt".length);
  if ((await readFile(join(publicDir, file), "utf8")).trim() !== key) throw new Error(`the IndexNow key file ${file} does not hold its own name`);
  return key;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** A sitemap's URLs, each with its lastmod ("" when it has none). The sitemap is the site's own, so a pattern reads it. */
function sitemapEntries(xml: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [, body = ""] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const text = (tag: string) =>
      (body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? "").trim().replace(/&(amp|lt|gt|quot|apos);/g, (entity, e: string) => ENTITIES[e] ?? entity);
    const loc = text("loc");
    if (loc !== "") entries.set(loc, text("lastmod"));
  }
  return entries;
}

/** The URLs added to, removed from, or re-dated in the sitemap between two copies of it, sorted. */
export function changedUrls(beforeXml: string, afterXml: string): string[] {
  const before = sitemapEntries(beforeXml);
  const after = sitemapEntries(afterXml);
  const changed = new Set<string>();
  for (const [loc, lastmod] of after) if (before.get(loc) !== lastmod) changed.add(loc);
  for (const loc of before.keys()) if (!after.has(loc)) changed.add(loc);
  return [...changed].sort();
}

/** One request to https://api.indexnow.org/indexnow, as the protocol has it. */
export type IndexNowBody = { host: string; key: string; keyLocation: string; urlList: string[] };

/** The protocol's limit on one request's URLs. */
const MAX_URLS = 10_000;

/**
 * Sends IndexNow the URLs changed between the sitemap before the push and after the deploy, `undefined` for a copy that
 * could not be fetched, through `post` (the request's status, or a throw for one that got no answer), and returns the
 * health comment's one line about it. It never throws: whatever goes wrong is in the line.
 */
export async function indexNowNotice(opts: {
  before: string | undefined;
  after: string | undefined;
  origin: string;
  key: string;
  post: (body: IndexNowBody) => Promise<number>;
}): Promise<string> {
  const copies = { "before the push": opts.before, "after the deploy": opts.after };
  for (const [when, xml] of Object.entries(copies)) {
    if (xml === undefined) return `IndexNow: not sent (the live sitemap could not be fetched ${when})`;
    // An error page served with a 2xx, say: diffing it would send every URL the site has.
    if (sitemapEntries(xml).size === 0) return `IndexNow: not sent (the live sitemap fetched ${when} lists no URL)`;
  }
  const urls = changedUrls(opts.before!, opts.after!);
  if (urls.length === 0) return "IndexNow: nothing changed";

  const { host } = new URL(opts.origin);
  const keyLocation = new URL(`/${opts.key}.txt`, opts.origin).href;
  let sent = 0;
  const answers: string[] = [];
  for (let i = 0; i < urls.length; i += MAX_URLS) {
    const urlList = urls.slice(i, i + MAX_URLS);
    try {
      const status = await opts.post({ host, key: opts.key, keyLocation, urlList });
      answers.push(String(status));
      if (status === 200 || status === 202) sent += urlList.length;
    } catch (e) {
      answers.push(`no answer: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (sent === 0) return `IndexNow: not sent (${answers.map((a) => (/^\d+$/.test(a) ? `answered ${a}` : a)).join(", ")})`;
  return `IndexNow: ${sent === urls.length ? sent : `${sent} of ${urls.length}`} URL(s) sent (${answers.join(", ")})`;
}
