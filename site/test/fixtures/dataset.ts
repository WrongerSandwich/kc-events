import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A dataset file and a config on disk, as the job writes them, for the build-time loader's tests. */
export const configYaml = `
neighborhoods:
  Central KC: [Crossroads, Downtown]
  Johnson County: [Olathe]
  Lawrence: [Lawrence]
`;

export function activeEvent(over: Record<string, unknown> = {}) {
  return {
    id: "evt_000000000001",
    title: "A show",
    start: "2026-10-09T19:00:00-05:00",
    venue: "recordBar",
    neighborhood: "Crossroads",
    primaryUrl: "https://www.therecordbar.com/shows",
    kind: "music",
    recurrence: "one-off",
    dontMiss: false,
    firstSeen: "2026-10-03T16:05:31-05:00",
    lastVerified: "2026-10-03T21:47:36-05:00",
    status: "active",
    verificationFailures: 0,
    lead: { lane: "registry", source: "recordBar" },
    evidence: { date: "Oct 09 7:00 pm", venue: "recordBar presents" },
    ...over,
  };
}

export function dataset(events: unknown[], over: Record<string, unknown> = {}) {
  return { schemaVersion: 1, generatedAt: "2026-10-05T06:30:00-05:00", lastSuccessfulRun: "2026-10-05T06:30:00-05:00", events, sourceState: {}, discoveryState: {}, ...over };
}

export function write(ds: unknown, config = configYaml) {
  const dir = mkdtempSync(join(tmpdir(), "kc-site-"));
  const datasetPath = join(dir, "events.json");
  const configPath = join(dir, "research.config.yaml");
  writeFileSync(datasetPath, JSON.stringify(ds));
  writeFileSync(configPath, config);
  return { datasetPath, configPath, today: "2026-10-05" };
}
