// @vitest-environment node
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
import { loadPublished } from "../src/build/load-dataset";

// The one site test that reads the real clock: every other builds as of the run's day (SITE_TODAY=last-run), so a
// dataset gone stale fails here, by name, and nowhere else. The checks of what the build makes of the committed data are
// in committed-dataset.data.test.ts, run by the weekly run before it commits (#191).
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
