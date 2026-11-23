import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { changedUrls, type IndexNowBody, indexNowKey, indexNowNotice } from "../src/indexnow.js";

// IndexNow (#311): after a run's deploy is confirmed, the run tells search engines which URLs the live sitemap gained,
// lost, or re-dated, from two copies of it fetched before the push and after the deploy.

const sitemap = (entries: [string, string][]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map(([loc, lastmod]) => `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>`)
    .join("\n")}\n</urlset>\n`;

const W = "https://www.kcthisweek.com";

describe("changedUrls", () => {
  it("returns the URLs added, removed, or with a changed lastmod, sorted", () => {
    const before = sitemap([
      [`${W}/`, "2026-11-16T06:40:00-06:00"],
      [`${W}/e/gone`, "2026-11-10T06:40:00-06:00"],
      [`${W}/e/kept`, "2026-11-09T06:40:00-06:00"],
      [`${W}/v/the-midland`, "2026-11-16T06:40:00-06:00"],
    ]);
    const after = sitemap([
      [`${W}/`, "2026-11-16T06:40:00-06:00"],
      [`${W}/e/kept`, "2026-11-09T06:40:00-06:00"],
      [`${W}/v/the-midland`, "2026-11-23T06:40:00-06:00"],
      [`${W}/e/added`, "2026-11-23T06:40:00-06:00"],
    ]);
    expect(changedUrls(before, after)).toEqual([`${W}/e/added`, `${W}/e/gone`, `${W}/v/the-midland`]);
  });

  it("returns nothing for identical sitemaps", () => {
    const one = sitemap([
      [`${W}/`, "2026-11-16T06:40:00-06:00"],
      [`${W}/e/kept`, "2026-11-09T06:40:00-06:00"],
    ]);
    expect(changedUrls(one, one)).toEqual([]);
  });

  it("reads a loc's XML entities, and a url without a lastmod", () => {
    const before = `<urlset><url><loc>${W}/explore?when=all&amp;kind=music</loc></url></urlset>`;
    const after = `<urlset>\n<url>\n<loc> ${W}/explore?when=all&amp;kind=music </loc>\n</url>\n<url><loc>${W}/e/a</loc></url></urlset>`;
    expect(changedUrls(before, after)).toEqual([`${W}/e/a`]);
  });
});

describe("indexNowKey", () => {
  it("is the one key file the site serves from its root, which holds the key alone", async () => {
    const key = await indexNowKey(new URL("../site/public", import.meta.url).pathname);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it("refuses a public directory with no key file, two, or one whose content is not its name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kc-indexnow-"));
    try {
      await expect(indexNowKey(dir)).rejects.toThrow(/no IndexNow key file/);
      await writeFile(join(dir, "0123456789abcdef0123456789abcdef.txt"), "fedcba9876543210fedcba9876543210\n");
      await expect(indexNowKey(dir)).rejects.toThrow(/does not hold its own name/);
      await writeFile(join(dir, "0123456789abcdef0123456789abcdef.txt"), "0123456789abcdef0123456789abcdef");
      expect(await indexNowKey(dir)).toBe("0123456789abcdef0123456789abcdef");
      await writeFile(join(dir, "fedcba9876543210fedcba9876543210.txt"), "fedcba9876543210fedcba9876543210");
      await expect(indexNowKey(dir)).rejects.toThrow(/2 IndexNow key files/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("indexNowNotice", () => {
  const KEY = "0123456789abcdef0123456789abcdef";
  const before = sitemap([
    [`${W}/`, "2026-11-16T06:40:00-06:00"],
    [`${W}/e/gone`, "2026-11-10T06:40:00-06:00"],
  ]);
  const after = sitemap([
    [`${W}/`, "2026-11-23T06:40:00-06:00"],
    [`${W}/e/added`, "2026-11-23T06:40:00-06:00"],
  ]);

  /** A post that records each body and answers from a list of statuses, an Error being a request that got no answer. */
  function fakePost(answers: (number | Error)[]) {
    const bodies: IndexNowBody[] = [];
    const post = async (body: IndexNowBody) => {
      bodies.push(body);
      const answer = answers[Math.min(bodies.length - 1, answers.length - 1)]!;
      if (answer instanceof Error) throw answer;
      return answer;
    };
    return { bodies, post };
  }

  it("sends the changed URLs in one request naming the host, the key and its file, and says how many and the answer", async () => {
    const { bodies, post } = fakePost([202]);
    expect(await indexNowNotice({ before, after, origin: W, key: KEY, post })).toBe("IndexNow: 3 URL(s) sent (202)");
    expect(bodies).toEqual([
      { host: "www.kcthisweek.com", key: KEY, keyLocation: `${W}/${KEY}.txt`, urlList: [`${W}/`, `${W}/e/added`, `${W}/e/gone`] },
    ]);
  });

  it("sends nothing when nothing changed", async () => {
    const { bodies, post } = fakePost([200]);
    expect(await indexNowNotice({ before, after: before, origin: W, key: KEY, post })).toBe("IndexNow: nothing changed");
    expect(bodies).toEqual([]);
  });

  it("sends nothing when either copy of the sitemap could not be fetched or lists no URL", async () => {
    const { bodies, post } = fakePost([200]);
    expect(await indexNowNotice({ before: undefined, after, origin: W, key: KEY, post })).toBe("IndexNow: not sent (the live sitemap could not be fetched before the push)");
    expect(await indexNowNotice({ before, after: undefined, origin: W, key: KEY, post })).toBe("IndexNow: not sent (the live sitemap could not be fetched after the deploy)");
    expect(await indexNowNotice({ before: "<html>Not found</html>", after, origin: W, key: KEY, post })).toBe(
      "IndexNow: not sent (the live sitemap fetched before the push lists no URL)",
    );
    expect(bodies).toEqual([]);
  });

  it("reports a refusal or a request that got no answer, without throwing", async () => {
    expect(await indexNowNotice({ before, after, origin: W, key: KEY, post: fakePost([403]).post })).toBe("IndexNow: not sent (answered 403)");
    expect(await indexNowNotice({ before, after, origin: W, key: KEY, post: fakePost([new Error("fetch failed")]).post })).toBe(
      "IndexNow: not sent (no answer: fetch failed)",
    );
  });

  it("splits more than 10,000 URLs into requests of 10,000 at most, counting what each accepted", async () => {
    const many = sitemap(Array.from({ length: 10_001 }, (_, i): [string, string] => [`${W}/e/${String(i).padStart(5, "0")}`, "2026-11-23T06:40:00-06:00"]));
    const ok = fakePost([200, 202]);
    expect(await indexNowNotice({ before, after: many, origin: W, key: KEY, post: ok.post })).toBe("IndexNow: 10003 URL(s) sent (200, 202)");
    expect(ok.bodies.map((b) => b.urlList.length)).toEqual([10_000, 3]);
    const half = fakePost([200, 429]);
    expect(await indexNowNotice({ before, after: many, origin: W, key: KEY, post: half.post })).toBe("IndexNow: 10000 of 10003 URL(s) sent (200, 429)");
  });
});
