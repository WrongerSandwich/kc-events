// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { icoImage } from "../src/build/ico";
import { pngSource } from "../src/build/png-source";
import { MARK_INNER, faviconSvg, markSvg } from "../src/lib/mark";

describe("markSvg", () => {
  it("is the fountain, filled in the given ink", () => {
    expect(markSvg("#abc")).toBe(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="#abc">${MARK_INNER}</svg>`);
    expect(markSvg()).toContain('fill="#171717"');
  });

  it("classes its five drops left to right, for a surface that colours them", () => {
    const drops = [...MARK_INNER.matchAll(/<circle class="drop drop-(\d)" cx="([\d.]+)"/g)].map((m) => ({ n: Number(m[1]), cx: Number(m[2]) }));
    expect(drops.map((d) => d.n)).toEqual([1, 2, 3, 4, 5]);
    expect(drops.map((d) => d.cx)).toEqual([7.5, 11, 16, 21, 24.5]);
  });
});

describe("faviconSvg", () => {
  it("is the mark, in ink by default and near-white under a dark scheme", () => {
    const svg = faviconSvg();
    expect(svg).toContain(MARK_INNER);
    expect(svg).toMatch(/<style>svg\{fill:#171717\}@media \(prefers-color-scheme:dark\)\{svg\{fill:#f0f0f0\}\}<\/style>/);
  });
});

describe("the committed raster icons (else rerun scripts/icons.ts)", () => {
  it("apple-touch-icon.png was drawn from the current mark", () => {
    const png = readFileSync(new URL("../public/apple-touch-icon.png", import.meta.url));
    expect(pngSource(png)).toBe(markSvg());
  });

  it("favicon.ico holds a 32 px PNG drawn from the current mark", () => {
    const ico = readFileSync(new URL("../public/favicon.ico", import.meta.url));
    expect(ico.readUInt8(6)).toBe(32);
    const png = icoImage(ico);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(pngSource(png)).toBe(markSvg());
  });
});
