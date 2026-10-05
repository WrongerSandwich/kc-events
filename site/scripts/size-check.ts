/**
 * Run as `pnpm size` after a build, in CI only (not in `pnpm build`, the deploy build): exits non-zero when a page's
 * compressed transfer (HTML + every CSS and JS file it loads, transitively) exceeds its budget (spec section 9). Font
 * files are not counted: they are the same for every page and woff2 is already compressed; the budget is about markup,
 * styles, script, and the event data the script carries.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

/** Paths relative to dist/ of the CSS and JS a page's HTML references: every /_astro/ URL (scripts, stylesheets, island URLs). */
function htmlReferences(html: string): string[] {
  return [...html.matchAll(/\/_astro\/[\w.-]+\.(?:js|css)/g)].map((m) => m[0].slice(1));
}

/**
 * Paths relative to dist/ of the chunks a script imports statically (`import … from "…"`, `import "…"`,
 * `export … from "…"`), relative or /_astro/. A dynamic `import("…")` is not followed: that chunk loads on demand,
 * not with the page.
 */
function staticImports(js: string, from: string): string[] {
  return [...js.matchAll(/\b(?:import|from)\s*["']((?:\.{1,2})?\/[\w./-]+\.(?:js|css))["']/g)].map((m) =>
    m[1]!.startsWith("/") ? m[1]!.slice(1) : posix.join(posix.dirname(from), m[1]!),
  );
}

/** The gzipped bytes of a page and everything it loads with it, and the assets counted. */
export function measure(dist: string, page: string): { bytes: number; assets: string[] } {
  const html = readFileSync(join(dist, page), "utf8");
  let bytes = gzipSync(html).length;
  const seen = new Set<string>();
  const queue = htmlReferences(html);
  while (queue.length > 0) {
    const asset = queue.pop()!;
    if (seen.has(asset) || !existsSync(join(dist, asset))) continue;
    seen.add(asset);
    const content = readFileSync(join(dist, asset), "utf8");
    bytes += gzipSync(content).length;
    if (asset.endsWith(".js")) queue.push(...staticImports(content, asset));
  }
  return { bytes, assets: [...seen] };
}

function main(): void {
  const dist = new URL(`../${process.env.SITE_OUT_DIR ?? "dist"}/`, import.meta.url).pathname;
  const budgets: Record<string, number> = { "index.html": 50_000, "explore.html": 100_000 };
  let failed = false;
  const check = (page: string, budget: number, bytes: number, assets: string[]) => {
    const ok = bytes <= budget;
    if (!ok) failed = true;
    console.log(`${ok ? "ok  " : "OVER"} ${page}: ${bytes} / ${budget} bytes gzipped (${assets.length} assets)`);
  };
  for (const [page, budget] of Object.entries(budgets)) {
    const { bytes, assets } = measure(dist, page);
    check(page, budget, bytes, assets);
  }
  // Event pages share their scripts and differ only in markup, so the largest one is the one that could go over.
  const eventDir = join(dist, "e");
  const eventPages = existsSync(eventDir) ? readdirSync(eventDir).filter((f) => f.endsWith(".html")) : [];
  const largest = eventPages
    .map((f) => ({ page: `e/${f}`, ...measure(dist, `e/${f}`) }))
    .reduce<{ page: string; bytes: number; assets: string[] } | undefined>((max, m) => (max === undefined || m.bytes > max.bytes ? m : max), undefined);
  if (largest) check(`${largest.page} (largest event page)`, 40_000, largest.bytes, largest.assets);
  if (failed) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) main();
