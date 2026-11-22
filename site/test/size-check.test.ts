// @vitest-environment node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { BUDGETS, FIRST_PICK_CEILING, FIXTURE_PICKS, measure, MORE_PICK_BYTES, PICK_BYTES } from "../scripts/size-check";
import { loadPublished } from "../src/build/load-dataset";
import { FRONT_PAGE_BYTES, MAX_PICKS } from "../src/build/write-generated";
import { tempDir } from "./fixtures/temp-dir";
import { found } from "./fixtures/found";

describe("measure", () => {
  it("counts the page and every script and stylesheet it loads, following static chunk imports but not dynamic ones", () => {
    const dist = tempDir("kc-size-");
    mkdirSync(join(dist, "_astro"));
    const files: Record<string, string> = {
      "index.html": `<link rel="stylesheet" href="/_astro/index.A1.css"><astro-island component-url="/_astro/List.B2.js" renderer-url="/_astro/client.C3.js"></astro-island>`,
      "_astro/index.A1.css": "body{margin:0}",
      "_astro/List.B2.js": `import{e as x}from"./events.D4.js";import"./runtime.E5.js";export default x;`,
      "_astro/client.C3.js": `import{r}from"./runtime.E5.js";export{q}from"./shared.H8.js";export{r};`,
      "_astro/events.D4.js": `export const e=${JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ id: i })))};`,
      "_astro/runtime.E5.js": `const l=()=>import("./lazy.F6.js");export const r=1;`,
      "_astro/lazy.F6.js": "export const z=2;",
      "_astro/shared.H8.js": "export const q=4;",
      "_astro/unused.G7.js": "export const never=3;",
    };
    for (const [path, text] of Object.entries(files)) writeFileSync(join(dist, path), text);

    const { bytes, assets } = measure(dist, "index.html");
    expect(assets.sort()).toEqual(["_astro/List.B2.js", "_astro/client.C3.js", "_astro/events.D4.js", "_astro/index.A1.css", "_astro/runtime.E5.js", "_astro/shared.H8.js"]);
    const expected = Object.entries(files)
      .filter(([path]) => path !== "_astro/unused.G7.js" && path !== "_astro/lazy.F6.js")
      .reduce((n, [, text]) => n + gzipSync(text).length, 0);
    expect(bytes).toBe(expected);
  });
});

describe("budgets", () => {
  it("measures the explorer and the front page on the fixture build, so their budgets track code and not the week's data", () => {
    expect(BUDGETS.find((b) => b.page === "explore.html")?.build).toBe("fixture");
    expect(BUDGETS.find((b) => b.page === "index.html")?.build).toBe("fixture");
  });

  it("holds the How it works page on the fixture build, the page with the most markup and a stylesheet of its own", () => {
    expect(BUDGETS.find((b) => b.page === "about/how-it-works.html")?.build).toBe("fixture");
  });

  it("also holds the real explorer, the week's data and all, under a generous ceiling, so a jump in the data is noticed (audit E9)", () => {
    const real = BUDGETS.filter((b) => b.page === "explore.html" && b.build === "real");
    expect(real).toHaveLength(1);
    expect(real[0]!.budget).toBe(200_000);
  });

  // The picks to the first ceiling at the 2026-10-11 measure, those past it to the curation prompt's figure at their own
  // (#290), so raising the ceiling grew the real-data budget by the picks' cost alone and left the code no more room.
  it("leaves the front page room for a week at the pick ceiling, counting the picks the fixture build publishes", () => {
    const site = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
    const fixture = loadPublished({ datasetPath: site("e2e/fixtures/events.json"), configPath: site("../research.config.yaml"), today: "2026-10-05" });
    expect(fixture.events.filter((e) => e.dontMiss)).toHaveLength(FIXTURE_PICKS);
    expect(readFileSync(site("package.json"), "utf8")).toContain("SITE_TODAY=2026-10-05 SITE_DATASET=e2e/fixtures/events.json");
    const front = found(BUDGETS.find((b) => b.page === "index.html"), "the front page's budget").budget;
    expect(front + (FIRST_PICK_CEILING - FIXTURE_PICKS) * PICK_BYTES + (MAX_PICKS - FIRST_PICK_CEILING) * MORE_PICK_BYTES).toBe(FRONT_PAGE_BYTES);
    // Held as a number too, so a change to the pick constants cannot hand the code more room unseen: what the code may
    // weigh moves only with a measured change to the code, here and in FRONT_PAGE_BYTES together.
    expect(front).toBe(49_100);
  });
});
