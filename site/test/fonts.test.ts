// @vitest-environment node
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { siteConfig } from "../src/site.config";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

// The committed font files are made by scripts/subset-fonts.sh (#195); these hold them to what the pages set.
describe("the site's fonts", () => {
  // The display face carries no lower case (#293), so what it sets must be drawn in capitals and be in its cut.
  it("cuts the display face to capitals, figures and punctuation, the site's name among them", () => {
    const display = /^DISPLAY="(.*)"$/m.exec(read("../scripts/subset-fonts.sh"))?.[1] ?? "";
    const missing = (text: string) => [...new Set(text)].filter((c) => !display.includes(c));
    expect(missing(siteConfig.name.toUpperCase())).toEqual([]);
    expect(missing("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")).toEqual([]);
    expect(display).not.toMatch(/[a-z]/);
    expect(read("../src/components/Header.astro")).toMatch(/\.name \{[^}]*text-transform: uppercase/);
  });

  it("sets the display face in capitals wherever a stylesheet asks for it", () => {
    for (const file of ["../src/styles/base.css", "../src/components/Header.astro", "../src/components/DateTile.svelte", "../src/components/WeekStrip.svelte", "../src/components/DontMissList.svelte", "../src/components/FilterRail.svelte", "../src/styles/how-it-works.css"]) {
      const rules = [...read(file).matchAll(/\{[^{}]*font-family: var\(--font-display\)[^{}]*\}/g)].map((m) => m[0]);
      expect(rules.length, file).toBeGreaterThan(0);
      expect(rules.filter((rule) => !rule.includes("text-transform: uppercase")), file).toEqual([]);
    }
  });

  it("sets no weight outside Geist's cut axis, 400 to 600", () => {
    const tokens = read("../src/styles/tokens.css");
    const weights = [...tokens.matchAll(/--weight-[\w-]+: (\d+)/g)].map((m) => Number(m[1]));
    expect(weights.length).toBeGreaterThan(0);
    expect(weights.filter((w) => w < 400 || w > 600)).toEqual([]);
    expect(read("../src/styles/fonts.css")).toMatch(/font-family: "Geist Variable";[^}]*font-weight: 400 600;/);
  });

  it("keeps the display face's file small and gives the subset another name than the reserved one", () => {
    expect(statSync(new URL("../src/fonts/display-700.woff2", import.meta.url)).size).toBeLessThan(5_500);
    expect(read("../src/styles/tokens.css")).toMatch(/--font-display: "KC Display"/);
    expect(read("../src/styles/fonts.css")).not.toMatch(/font-family: "Josefin Sans"/);
  });
});
