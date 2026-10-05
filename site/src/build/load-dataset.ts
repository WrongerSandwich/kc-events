/**
 * Build-time only: the one place the site reads the research job's files and types. Parses with the
 * job's own schemas, keeps active non-past events, and projects them to what the browser sees.
 */
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { ELSEWHERE_IN_THE_METRO, parseConfig, type RunConfig } from "../../../src/config.ts";
import { DATASET_SCHEMA_VERSION, parseDataset, type Event } from "../../../src/dataset.ts";
import { regionOf } from "../../../src/taxonomy.ts";
import { toLocalDate } from "../../../src/time.ts";
import { isPast } from "../lib/events";
import type { Published, PublishedEvent } from "../lib/types";

/** Bumped by hand when the site is updated for a new dataset shape; a job-side bump fails the build until then. */
export const SITE_EXPECTS_SCHEMA_VERSION = 1;
/** Raw bytes of the projected events; past this the explorer's one-page design needs rethinking. */
export const MAX_PAYLOAD_BYTES = 400_000;

/** Throws when the job's dataset schema version is not the one this site was written against. */
export function checkSchemaVersion(jobVersion: number, siteVersion: number = SITE_EXPECTS_SCHEMA_VERSION): void {
  if (jobVersion !== siteVersion) {
    throw new Error(`dataset schema version ${jobVersion} but the site expects ${siteVersion}; update site/src/build and bump SITE_EXPECTS_SCHEMA_VERSION`);
  }
}

/** A listed neighborhood's region; a neighborhood that names a region is that region; anything else is the catch-all. */
export function regionFor(neighborhood: string, config: RunConfig): string {
  const listed = regionOf(neighborhood, config);
  if (listed !== undefined) return listed;
  const named = Object.keys(config.neighborhoods).find((r) => r.toLowerCase() === neighborhood.trim().toLowerCase());
  return named ?? ELSEWHERE_IN_THE_METRO;
}

function project(e: Event, config: RunConfig): PublishedEvent {
  const out: PublishedEvent = {
    id: e.id,
    title: e.title,
    venue: e.venue!,
    neighborhood: e.neighborhood,
    region: regionFor(e.neighborhood, config),
    primaryUrl: e.primaryUrl,
    kind: e.kind,
    recurrence: e.recurrence,
    dontMiss: e.dontMiss,
    lastVerified: e.lastVerified!,
  };
  if (e.start !== undefined) out.start = e.start;
  if (e.end !== undefined) out.end = e.end;
  if (e.schedule !== undefined) out.schedule = e.schedule;
  if (e.whyLine !== undefined) out.whyLine = e.whyLine;
  return out;
}

export function loadPublished(opts: { datasetPath: string; configPath: string; today?: string }): Published {
  const config = parseConfig(parseYaml(readFileSync(opts.configPath, "utf8")));
  checkSchemaVersion(DATASET_SCHEMA_VERSION);
  const dataset = parseDataset(JSON.parse(readFileSync(opts.datasetPath, "utf8")));
  if (dataset.lastSuccessfulRun === null) throw new Error("the dataset records no successful run; nothing to publish");
  const today = opts.today ?? process.env.SITE_TODAY ?? toLocalDate(new Date(), config.timezone);

  const active = dataset.events.filter((e) => e.status === "active");
  const events = active.map((e) => project(e, config)).filter((e) => !isPast(e, today));

  const seen = new Set<string>();
  for (const e of events) {
    if (seen.has(e.id)) throw new Error(`duplicate active event id ${e.id}`);
    seen.add(e.id);
  }
  const bytes = Buffer.byteLength(JSON.stringify(events));
  if (bytes > MAX_PAYLOAD_BYTES) throw new Error(`projected payload is ${bytes} bytes, over the ${MAX_PAYLOAD_BYTES} limit`);

  const unlisted = active.filter((e) => regionOf(e.neighborhood, config) === undefined && e.neighborhood !== ELSEWHERE_IN_THE_METRO);
  if (unlisted.length > 0) {
    const counts = new Map<string, number>();
    for (const e of unlisted) counts.set(e.neighborhood, (counts.get(e.neighborhood) ?? 0) + 1);
    console.warn(`site: ${unlisted.length} active events have a neighborhood no region lists: ${[...counts].map(([n, c]) => `${n} (${c})`).join(", ")}`);
  }

  return {
    events,
    kinds: config.kinds,
    regions: [...Object.keys(config.neighborhoods), ELSEWHERE_IN_THE_METRO],
    lastSuccessfulRun: dataset.lastSuccessfulRun,
    buildToday: today,
    timeZone: config.timezone,
  };
}
