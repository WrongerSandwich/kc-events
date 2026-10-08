// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { BUDGETS, measure } from "../scripts/size-check";

describe("measure", () => {
  it("counts the page and every script and stylesheet it loads, following static chunk imports but not dynamic ones", () => {
    const dist = mkdtempSync(join(tmpdir(), "kc-size-"));
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
  it("measures the explorer on the fixture build, so its budget tracks code and not the week's event count", () => {
    expect(BUDGETS.find((b) => b.page === "explore.html")?.build).toBe("fixture");
    expect(BUDGETS.find((b) => b.page === "index.html")?.build).toBe("real");
  });
});
