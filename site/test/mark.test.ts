// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pngSource } from "../src/build/png-source";
import { MARK_INNER, faviconSvg, markSvg } from "../src/lib/mark";

describe("markSvg", () => {
  it("is the fountain, filled in the given ink", () => {
    expect(markSvg("#abc")).toBe(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="#abc">${MARK_INNER}</svg>`);
    expect(markSvg()).toContain('fill="#171717"');
  });
});

describe("faviconSvg", () => {
  it("is the mark, in ink by default and near-white under a dark scheme", () => {
    const svg = faviconSvg();
    expect(svg).toContain(MARK_INNER);
    expect(svg).toMatch(/<style>svg\{fill:#171717\}@media \(prefers-color-scheme:dark\)\{svg\{fill:#f0f0f0\}\}<\/style>/);
  });
});

describe("the committed apple-touch-icon", () => {
  it("was drawn from the current mark (else rerun scripts/apple-touch-icon.ts)", () => {
    const png = readFileSync(new URL("../public/apple-touch-icon.png", import.meta.url));
    expect(pngSource(png)).toBe(markSvg());
  });
});
