import { describe, expect, it } from "vitest";
import { slugify, slugTable } from "../src/lib/slugs";
import { meta } from "../src/generated/meta";

describe("slugs", () => {
  it("makes URL-safe, stable slugs", () => {
    expect(slugify("Kansas City, Kansas")).toBe("kansas-city-kansas");
    expect(slugify("theater/dance")).toBe("theater-dance");
    expect(slugify("Elsewhere in the metro")).toBe("elsewhere-in-the-metro");
    expect(slugify("18th & Vine")).toBe("18th-vine");
  });

  it("round-trips through a table and rejects unknowns", () => {
    const t = slugTable(["music", "theater/dance"]);
    expect(t.toSlug("theater/dance")).toBe("theater-dance");
    expect(t.fromSlug("theater-dance")).toBe("theater/dance");
    expect(t.fromSlug("opera")).toBeUndefined();
  });

  it("gives the config's kinds and regions distinct slugs", () => {
    for (const names of [meta.kinds, meta.regions]) {
      expect(new Set(names.map(slugify)).size).toBe(names.length);
    }
  });
});
