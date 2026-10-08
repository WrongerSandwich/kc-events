/**
 * Run as `pnpm size` after both builds (`pnpm build` and `pnpm build:e2e`), in CI only (not in `pnpm build`, the
 * deploy build): exits non-zero when a page's compressed transfer (HTML + every CSS and JS file it loads, transitively)
 * exceeds its budget (spec section 9). Font files are not counted: they are the same for every page and woff2 is
 * already compressed; the budget is about markup, styles, and script.
 *
 * The explorer carries every published event, in its rows and in its script, so on the real build its size tracks the
 * dataset and not the code. It is measured on the end-to-end build instead, whose fixture dataset and date never
 * change, so its budget is a budget for code; the build's 400 KB raw-payload guard (MAX_PAYLOAD_BYTES in
 * src/build/load-dataset.ts) is what bounds the data. The front page and event pages carry little data each and stay
 * on the real build.
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

/** Each page's budget in gzipped bytes and the build it is measured on: "real" is dist/, "fixture" is the end-to-end build. */
export const BUDGETS: { page: string; budget: number; build: "real" | "fixture" }[] = [
  { page: "index.html", budget: 50_000, build: "real" },
  { page: "explore.html", budget: 50_000, build: "fixture" },
];

function main(): void {
  const dirs = {
    real: new URL("../dist/", import.meta.url).pathname,
    fixture: new URL("../dist-e2e/", import.meta.url).pathname,
  };
  for (const [build, dir] of Object.entries(dirs)) {
    if (!existsSync(dir)) {
      console.error(`no ${dir}: run \`pnpm ${build === "real" ? "build" : "build:e2e"}\` first`);
      process.exit(1);
    }
  }
  const dist = dirs.real;
  let failed = false;
  const check = (page: string, budget: number, bytes: number, assets: string[]) => {
    const ok = bytes <= budget;
    if (!ok) failed = true;
    console.log(`${ok ? "ok  " : "OVER"} ${page}: ${bytes} / ${budget} bytes gzipped (${assets.length} assets)`);
  };
  for (const { page, budget, build } of BUDGETS) {
    const { bytes, assets } = measure(dirs[build], page);
    check(build === "fixture" ? `${page} (fixture data)` : page, budget, bytes, assets);
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
