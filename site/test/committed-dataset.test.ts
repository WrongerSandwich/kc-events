// @vitest-environment node
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { loadPublished } from "../src/build/load-dataset";
import { writeGenerated } from "../src/build/write-generated";

// The one site test that reads the real clock: every other builds as of the run's day (SITE_TODAY=last-run), so a
// dataset gone stale fails here, by name, and nowhere else.
it("committed dataset is not stale", () => {
  const datasetPath = fileURLToPath(new URL("../../data/events.json", import.meta.url));
  const configPath = fileURLToPath(new URL("../../research.config.yaml", import.meta.url));
  vi.stubEnv("SITE_TODAY", undefined);
  try {
    expect(() => loadPublished({ datasetPath, configPath }), "a build today would refuse data/events.json: has the weekly run missed?").not.toThrow();
  } finally {
    vi.unstubAllEnvs();
  }
});

describe("the committed dataset through the site's loader", () => {
  const datasetPath = fileURLToPath(new URL("../../data/events.json", import.meta.url));
  const configPath = fileURLToPath(new URL("../../research.config.yaml", import.meta.url));
  // The run's own day: the loader refuses a today more than two weeks from it, and the committed run moves weekly.
  const today = (JSON.parse(readFileSync(datasetPath, "utf8")) as { lastSuccessfulRun: string }).lastSuccessfulRun.slice(0, 10);
  const p = loadPublished({ datasetPath, configPath, today });

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

  it("publishes as /events.json only the projection: active events' public fields with descriptions, no job internals", () => {
    const dir = mkdtempSync(join(tmpdir(), "kc-committed-"));
    writeGenerated({ datasetPath, configPath, outDir: join(dir, "generated"), publicDir: join(dir, "public"), today });
    const published = JSON.parse(readFileSync(join(dir, "public", "events.json"), "utf8"));

    expect(Object.keys(published).sort()).toEqual(["events", "generatedAt", "lastSuccessfulRun", "schemaVersion"]);
    expect(published.schemaVersion).toBe(2);
    expect(new Date(published.generatedAt).toISOString()).toBe(published.generatedAt);
    expect(published.lastSuccessfulRun).toBe(p.lastSuccessfulRun);
    expect(published.events.map((e: { id: string }) => e.id)).toEqual(p.events.map((e) => e.id));

    const allowed = new Set(["id", "title", "start", "end", "schedule", "venue", "room", "neighborhood", "region", "primaryUrl", "eventUrl", "kind", "recurrence", "dontMiss", "whyLine", "lastVerified", "description"]);
    for (const e of published.events) {
      for (const key of Object.keys(e)) expect(allowed.has(key), `event ${e.id} publishes "${key}"`).toBe(true);
      expect(e.description).toBe(p.descriptions[e.id]);
    }
  });
});
