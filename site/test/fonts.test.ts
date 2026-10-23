// @vitest-environment node
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { siteConfig } from "../src/site.config";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

// The committed font files are made by scripts/subset-fonts.sh (#195); these hold them to what the pages set.
describe("the site's fonts", () => {
  it("cuts the wordmark's face to the site's name as the header draws it, in capitals", () => {
    const wordmark = /^WORDMARK="(.*)"$/m.exec(read("../scripts/subset-fonts.sh"))?.[1];
    expect(wordmark).toBe(siteConfig.name.toUpperCase());
    expect(read("../src/components/Header.astro")).toMatch(/\.name \{[^}]*text-transform: uppercase/);
  });

  it("sets no weight outside Geist's cut axis, 400 to 600", () => {
    const tokens = read("../src/styles/tokens.css");
    const weights = [...tokens.matchAll(/--weight-[\w-]+: (\d+)/g)].map((m) => Number(m[1]));
    expect(weights.length).toBeGreaterThan(0);
    expect(weights.filter((w) => w < 400 || w > 600)).toEqual([]);
    expect(read("../src/styles/fonts.css")).toMatch(/font-family: "Geist Variable";[^}]*font-weight: 400 600;/);
  });

  it("keeps the wordmark's file small and gives the subset another name than the reserved one", () => {
    expect(statSync(new URL("../src/fonts/wordmark-700.woff2", import.meta.url)).size).toBeLessThan(2_000);
    expect(read("../src/styles/tokens.css")).toMatch(/--font-display: "KC Wordmark"/);
    expect(read("../src/styles/fonts.css")).not.toMatch(/font-family: "Josefin Sans"/);
  });
});
