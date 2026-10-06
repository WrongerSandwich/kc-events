// @vitest-environment node
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPublished } from "../src/build/load-dataset";

describe("the committed dataset through the site's loader", () => {
  const p = loadPublished({
    datasetPath: fileURLToPath(new URL("../../data/events.json", import.meta.url)),
    configPath: fileURLToPath(new URL("../../research.config.yaml", import.meta.url)),
    today: "2026-10-05",
  });

  it("loads, with every event placed in a region and ids unique", () => {
    expect(p.events.length).toBeGreaterThan(0);
    for (const e of p.events) expect(p.regions).toContain(e.region);
    expect(new Set(p.events.map((e) => e.id)).size).toBe(p.events.length);
  });

  it("carries only active fields", () => {
    for (const e of p.events) {
      expect(e).not.toHaveProperty("evidence");
      expect(e).not.toHaveProperty("lead");
      expect(e.venue).toBeTruthy();
      expect(e.lastVerified).toBeTruthy();
    }
  });
});
