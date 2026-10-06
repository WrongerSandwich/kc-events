// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pngSource } from "../src/build/png-source";
import { faviconSvg } from "../src/lib/favicon";

describe("faviconSvg", () => {
  it("draws a blank calendar tile with no day", () => {
    const svg = faviconSvg();
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(svg).not.toContain("<text");
    expect(svg).not.toMatch(/>\d+</);
  });

  it("draws the day of the month in the tile, for every day 1–31", () => {
    for (let day = 1; day <= 31; day++) {
      const svg = faviconSvg(day);
      expect(svg).toContain(`>${day}</text>`);
      // The tile itself is the same with or without a number.
      expect(svg.replace(/<text.*<\/text>/, "")).toBe(faviconSvg());
    }
  });

  it("refuses a day that is not a day of the month", () => {
    expect(() => faviconSvg(0)).toThrow();
    expect(() => faviconSvg(32)).toThrow();
    expect(() => faviconSvg(1.5)).toThrow();
  });
});

describe("the committed apple-touch-icon", () => {
  it("was drawn from the current blank tile (else rerun scripts/apple-touch-icon.ts)", () => {
    const png = readFileSync(new URL("../public/apple-touch-icon.png", import.meta.url));
    expect(pngSource(png)).toBe(faviconSvg());
  });
});
