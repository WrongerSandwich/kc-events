/**
 * Records a page and its origin's robots.txt into this directory, scrubbed, through the real
 * fetcher (so robots.txt is honored and the user agent is ours). Scrubbing keeps what the run
 * reads, the markup with its text and links, and drops what it never reads and what changes on
 * every load: scripts, styles, inline images, comments, `<head>` metadata, and every attribute
 * but `href`, `datetime` and `class`. An href's tracking parameters go with them, and an email
 * address becomes someone@venue.test.
 *
 *   pnpm tsx test/fixtures/pages/record.ts <name> <url>
 *
 * writes `<name>.html` here and `../robots/<name>.txt` (empty when the site serves none); say where
 * and when in README.md.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createFetcher } from "../../../src/adapters/fetcher.js";
import { USER_AGENT } from "../../../src/adapters/identity.js";

const KEPT_ATTRIBUTES = new Set(["href", "datetime", "class"]);
const TRACKING = /^(utm_\w+|fbclid|gclid|_ga|mc_[ce]id|_branch_\w+|g_ep|\$affiliate_json|\$3p)$/;

export function scrub(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg|iframe|template)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<head\b[\s\S]*?<\/head>/i, "<head><title>recorded</title></head>")
    .replace(/<(img|source|link|meta|input)\b[^>]*>/gi, "")
    .replace(/<([a-z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/gi, (_, tag: string, attributes: string, slash: string) => {
      const kept = [...attributes.matchAll(/([^\s=>/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)]
        .filter(([, name]) => KEPT_ATTRIBUTES.has(name!.toLowerCase()))
        .map(([, name, value = '""']) => {
          const unquoted = value.replace(/^["']|["']$/g, "");
          return `${name!.toLowerCase()}="${name!.toLowerCase() === "href" ? untracked(unquoted) : unquoted}"`;
        });
      return `<${tag}${kept.map((a) => ` ${a}`).join("")}${slash}>`;
    })
    .replace(/[\w.%+-]+@[\w-]+(\.[\w-]+)+/g, "someone@venue.test")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n\s*\n(\s*\n)+/g, "\n\n");
}

function decoded(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function untracked(href: string): string {
  const [base, query] = href.split("?", 2);
  if (query === undefined) return href;
  // In markup the separator is usually written as an entity.
  const kept = query.split(/&(?:amp;|#0*38;)?/).filter((pair) => !TRACKING.test(decoded(pair.split("=")[0]!)));
  return kept.length > 0 ? `${base}?${kept.join("&amp;")}` : base!;
}

async function main() {
  const [name, url] = process.argv.slice(2);
  if (!name || !url) throw new Error("usage: record.ts <name> <url>");
  const fetcher = createFetcher();
  const page = await fetcher.fetch(url);
  if (!page.robotsAllowed || page.status !== 200) throw new Error(`${url}: status ${page.status}, robots.txt ${page.robotsAllowed ? "allows" : "disallows"}`);
  const robots = await fetch(new URL("/robots.txt", page.finalUrl), { headers: { "user-agent": USER_AGENT } });
  const dir = import.meta.dirname;
  await writeFile(join(dir, `${name}.html`), scrub(page.body));
  await writeFile(join(dir, "..", "robots", `${name}.txt`), robots.ok ? await robots.text() : "");
  console.log(`recorded ${url} (ended at ${page.finalUrl}) as ${name}`);
}

if (import.meta.filename === process.argv[1]) await main();
