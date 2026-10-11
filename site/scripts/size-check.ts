/**
 * Run as `pnpm size` after both builds (`pnpm build` and `pnpm build:e2e`), in CI only (not in `pnpm build`, the
 * deploy build): exits non-zero when a page's compressed transfer (HTML + every CSS and JS file it loads, transitively)
 * exceeds its budget (spec section 9). Font files are not counted: they are the same for every page and woff2 is
 * already compressed; the budget is about markup, styles, and script.
 *
 * The explorer carries every published event, in its rows and in its script, and the front page every don't-miss
 * pick, so on the real build their sizes track the week's data and not the code (and the weekly data commit runs no
 * CI, so a breach would show on the next unrelated pull request). Both are measured on the end-to-end build instead,
 * whose fixture dataset and date never change, so their budgets are budgets for code. The data is bounded at build:
 * the explorer's by the 400 KB raw-payload guard (MAX_PAYLOAD_BYTES in src/build/load-dataset.ts), the front page's by
 * a warning past MAX_PICKS (src/build/write-generated.ts). Event pages carry one event each and stay on the real build.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { FRONT_PAGE_BYTES, MAX_PICKS } from "../src/build/write-generated.ts";

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

/** About what one more don't-miss pick adds to the front page, gzipped (measured 2026-10-11: 16 real picks against the fixture's 4). */
export const PICK_BYTES = 375;
/** The don't-miss picks the fixture build publishes (e2e/fixtures/events.json on its SITE_TODAY; a test holds it). */
export const FIXTURE_PICKS = 4;

/** Each page's budget in gzipped bytes and the build it is measured on: "real" is dist/, "fixture" is the end-to-end build. */
export const BUDGETS: { page: string; budget: number; build: "real" | "fixture" }[] = [
  // The front page's code budget: what is left of its real-data budget once a week at the pick ceiling is paid for.
  { page: "index.html", budget: FRONT_PAGE_BYTES - (MAX_PICKS - FIXTURE_PICKS) * PICK_BYTES, build: "fixture" },
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
