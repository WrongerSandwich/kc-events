// @vitest-environment node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { BUDGETS, FIXTURE_PICKS, measure, PICK_BYTES } from "../scripts/size-check";
import { loadPublished } from "../src/build/load-dataset";
import { FRONT_PAGE_BYTES, MAX_PICKS } from "../src/build/write-generated";
import { tempDir } from "./fixtures/temp-dir";

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

  it("also holds the real explorer, the week's data and all, under a generous ceiling, so a jump in the data is noticed (audit E9)", () => {
    const real = BUDGETS.filter((b) => b.page === "explore.html" && b.build === "real");
    expect(real).toHaveLength(1);
    expect(real[0]!.budget).toBe(200_000);
  });

  it("leaves the front page room for a week at the pick ceiling, counting the picks the fixture build publishes", () => {
    const site = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
    const fixture = loadPublished({ datasetPath: site("e2e/fixtures/events.json"), configPath: site("../research.config.yaml"), today: "2026-10-05" });
    expect(fixture.events.filter((e) => e.dontMiss)).toHaveLength(FIXTURE_PICKS);
    expect(readFileSync(site("package.json"), "utf8")).toContain("SITE_TODAY=2026-10-05 SITE_DATASET=e2e/fixtures/events.json");
    const front = BUDGETS.find((b) => b.page === "index.html")!.budget;
    expect(front + (MAX_PICKS - FIXTURE_PICKS) * PICK_BYTES).toBe(FRONT_PAGE_BYTES);
  });
});
