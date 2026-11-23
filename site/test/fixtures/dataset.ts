import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tempDir } from "./temp-dir";

/** A dataset file and a config on disk, as the job writes them, for the build-time loader's tests. */
export const configYaml = `
neighborhoods:
  Central KC: [Crossroads, Downtown]
  Johnson County: [Olathe]
  Northland: [Northland]
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
  const dir = tempDir("kc-site-");
  const datasetPath = join(dir, "events.json");
  const configPath = join(dir, "research.config.yaml");
  writeFileSync(datasetPath, JSON.stringify(ds));
  writeFileSync(configPath, config);
  return { datasetPath, configPath, today: "2026-10-05" };
}

/** A record expired as `reason`, its one day `daysAgo` days before the fixture's today, 2026-10-05. */
export function expired(id: string, venue: string, daysAgo: number, reason = "past", over: Record<string, unknown> = {}) {
  const day = new Date(Date.UTC(2026, 9, 5 - daysAgo)).toISOString().slice(0, 10);
  return activeEvent({ id, venue, start: day, status: "expired", expiryReason: reason, lastChanged: `${day}T06:30:00-05:00`, ...over });
}

/** The fixture paths with an archive file beside the dataset, as the job writes data/archive/<year>.json. */
export function withArchive(live: unknown[], archived: unknown[], config = configYaml) {
  const paths = write(dataset(live), config);
  const dir = join(dirname(paths.datasetPath), "archive");
  mkdirSync(dir);
  writeFileSync(join(dir, "2026.json"), JSON.stringify({ schemaVersion: 1, events: archived }));
  return paths;
}
