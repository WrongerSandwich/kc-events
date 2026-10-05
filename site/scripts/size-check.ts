/**
 * Fails the build when a page's compressed transfer (HTML + every CSS and JS file it loads, transitively) exceeds
 * its budget (spec section 9). Font files are not counted: they are the same for every page and woff2 is already
 * compressed; the budget is about markup, styles, script, and the event data the script carries.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

/** Paths relative to dist/ of the CSS and JS a file references: absolute /_astro/ URLs and ./ or ../ imports. */
function references(text: string, from: string): string[] {
  const absolute = [...text.matchAll(/\/_astro\/[\w.-]+\.(?:js|css)/g)].map((m) => m[0].slice(1));
  const relative = [...text.matchAll(/["'](\.{1,2}\/[\w./-]+\.(?:js|css))["']/g)].map((m) => posix.join(posix.dirname(from), m[1]!));
  return [...absolute, ...relative];
}

/** The gzipped bytes of a page and everything it loads, and the assets counted. */
export function measure(dist: string, page: string): { bytes: number; assets: string[] } {
  const html = readFileSync(join(dist, page), "utf8");
  let bytes = gzipSync(html).length;
  const seen = new Set<string>();
  const queue = references(html, page);
  while (queue.length > 0) {
    const asset = queue.pop()!;
    if (seen.has(asset) || !existsSync(join(dist, asset))) continue;
    seen.add(asset);
    const content = readFileSync(join(dist, asset), "utf8");
    bytes += gzipSync(content).length;
    if (asset.endsWith(".js")) queue.push(...references(content, asset));
  }
  return { bytes, assets: [...seen] };
}

function main(): void {
  const dist = new URL(`../${process.env.SITE_OUT_DIR ?? "dist"}/`, import.meta.url).pathname;
  const budgets: Record<string, number> = { "index.html": 50_000, "explore.html": 100_000 };
  const firstEvent = readdirSync(join(dist, "e")).find((f) => f.endsWith(".html"));
  if (firstEvent) budgets[`e/${firstEvent}`] = 40_000;

  let failed = false;
  for (const [page, budget] of Object.entries(budgets)) {
    const { bytes, assets } = measure(dist, page);
    const ok = bytes <= budget;
    if (!ok) failed = true;
    console.log(`${ok ? "ok  " : "OVER"} ${page}: ${bytes} / ${budget} bytes gzipped (${assets.length} assets)`);
  }
  if (failed) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) main();
