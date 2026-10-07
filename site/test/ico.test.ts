// @vitest-environment node
import { describe, expect, it } from "vitest";
import { icoImage, pngToIco } from "../src/build/ico";

describe("pngToIco", () => {
  const png = Buffer.from("not really a png, but any bytes will do");

  it("wraps the bytes in a one-image ICO directory that points at them", () => {
    const ico = pngToIco(png, 32);
    expect(ico.length).toBe(22 + png.length);
    expect([...ico.subarray(0, 6)]).toEqual([0, 0, 1, 0, 1, 0]);
    expect(ico.readUInt8(6)).toBe(32);
    expect(ico.readUInt8(7)).toBe(32);
    expect(ico.readUInt32LE(14)).toBe(png.length);
    expect(ico.readUInt32LE(18)).toBe(22);
    expect(icoImage(ico)).toEqual(png);
  });

  it("writes 256 as 0, as the format requires", () => {
    expect(pngToIco(png, 256).readUInt8(6)).toBe(0);
  });

  it("refuses a size the format cannot hold", () => {
    expect(() => pngToIco(png, 0)).toThrow();
    expect(() => pngToIco(png, 257)).toThrow();
    expect(() => pngToIco(png, 31.5)).toThrow();
  });
});
