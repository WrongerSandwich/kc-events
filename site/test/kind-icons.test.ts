import { describe, expect, it } from "vitest";
import { kindIcons } from "../src/lib/kind-icons";
import { meta } from "../src/generated/meta";
import { slugify } from "../src/lib/slugs";

describe("kindIcons", () => {
  it("has an icon for every kind the config defines", () => {
    // KindIcon draws #kind-icon-<slug> from the sprite with no fallback, so a new kind needs an icon here.
    for (const kind of meta.kinds) expect(Object.keys(kindIcons)).toContain(slugify(kind));
  });
});
