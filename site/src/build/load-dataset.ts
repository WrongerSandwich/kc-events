/**
 * Build-time only: the one place the site reads the research job's files and types. Parses with the
 * job's own schemas, keeps active non-past events, and projects them to what the browser sees.
 */
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { ELSEWHERE_IN_THE_METRO, parseConfig, type RunConfig } from "../../../src/config.ts";
import { DATASET_SCHEMA_VERSION, parseDataset, type Event } from "../../../src/dataset.ts";
import { genericVenueName, venueAndRoom } from "../../../src/identity.ts";
import { regionOf } from "../../../src/taxonomy.ts";
import { toLocalDate } from "../../../src/time.ts";
import { isValidDate } from "../lib/dates";
import { isPast } from "../lib/events";
import type { Published, PublishedDescriptions, PublishedEvent } from "../lib/types";

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

/**
 * A URL as an href the browser will follow: only http or https, with no control character. The job
 * schema already refuses anything else; this holds the line here if that ever loosens.
 */
function href(url: string, e: Event): string {
  if (!/^https?:[^\u0000-\u001f\u007f]*$/i.test(url)) throw new Error(`event ${e.id} has a link that is not a plain http or https URL: ${JSON.stringify(url)}`);
  return url;
}

/** A house number, then a street-type word: a heuristic for a warning, which a "1600 Genessee" slips past. */
const STREET_ADDRESS = /^\d+\s+(?:\S+\s+)*?(?:st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ct|court|ln|lane|pkwy|parkway|pl|place|ter|terrace|hwy|highway|cir|circle|way|trail)\b/i;

/** A published venue that names no one place: generic words only ("Galleries") or a street address. */
function vagueVenue(venue: string): boolean {
  return genericVenueName(venue) || STREET_ADDRESS.test(venue);
}

/** "A (2), B (1)": each value with how many times it occurs, in first-seen order. */
function tally(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].map(([v, c]) => `${v} (${c})`).join(", ");
}

/** The non-null assertions on venue and lastVerified hold because the job schema's refine (src/dataset.ts) requires both on every active event. */
export function project(e: Event, config: RunConfig): PublishedEvent {
  const { venue, room } = venueAndRoom(e.venue!, config.venueAliases);
  const out: PublishedEvent = {
    id: e.id,
    title: e.title,
    venue,
    ...(room !== undefined && { room }),
    neighborhood: e.neighborhood,
    region: regionFor(e.neighborhood, config),
    primaryUrl: href(e.primaryUrl, e),
    kind: e.kind,
    recurrence: e.recurrence,
    dontMiss: e.dontMiss,
    lastVerified: e.lastVerified!,
  };
  if (e.eventUrl !== undefined) out.eventUrl = href(e.eventUrl, e);
  if (e.start !== undefined) out.start = e.start;
  if (e.end !== undefined) out.end = e.end;
  if (e.schedule !== undefined) out.schedule = e.schedule;
  if (e.whyLine !== undefined) out.whyLine = e.whyLine;
  return out;
}

export function loadPublished(opts: { datasetPath: string; configPath: string; today?: string }): Published {
  const config = parseConfig(parseYaml(readFileSync(opts.configPath, "utf8")));
  checkSchemaVersion(DATASET_SCHEMA_VERSION);
  const dataset = parseDataset(JSON.parse(readFileSync(opts.datasetPath, "utf8")), config);
  if (dataset.lastSuccessfulRun === null) throw new Error("the dataset records no successful run; nothing to publish");
  const today = opts.today ?? process.env.SITE_TODAY ?? toLocalDate(new Date(), config.timezone);
  if (!isValidDate(today)) {
    const source = opts.today !== undefined ? "the today option" : "SITE_TODAY";
    throw new Error(`the build's today must be a real YYYY-MM-DD date, got "${today}" (from ${source})`);
  }

  const active = dataset.events.filter((e) => e.status === "active");
  const seen = new Set<string>();
  for (const e of active) {
    if (seen.has(e.id)) throw new Error(`duplicate active event id ${e.id}`);
    seen.add(e.id);
  }
  const published = active.map((e) => ({ e, out: project(e, config) })).filter(({ out }) => !isPast(out, today));
  const events = published.map(({ out }) => out);
  // Only the event page shows a description, so they stay out of the events every island carries.
  const descriptions: PublishedDescriptions = {};
  for (const { e } of published) if (e.description !== undefined) descriptions[e.id] = e.description;

  const bytes = Buffer.byteLength(JSON.stringify(events));
  if (bytes > MAX_PAYLOAD_BYTES) throw new Error(`projected payload is ${bytes} bytes, over the ${MAX_PAYLOAD_BYTES} limit`);

  const unlisted = events.filter((e) => e.region === ELSEWHERE_IN_THE_METRO && e.neighborhood !== ELSEWHERE_IN_THE_METRO);
  if (unlisted.length > 0) {
    console.warn(`site: ${unlisted.length} published events were mapped to the catch-all because no region lists their neighborhood: ${tally(unlisted.map((e) => e.neighborhood))}`);
  }

  const vague = events.filter((e) => vagueVenue(e.venue));
  if (vague.length > 0) {
    console.warn(`site: ${vague.length} published events name a room or a street address for their venue; add it to venueAliases in research.config.yaml if it is inside a known venue: ${tally(vague.map((e) => e.venue))}`);
  }

  return {
    events,
    descriptions,
    kinds: config.kinds,
    regions: [...Object.keys(config.neighborhoods), ELSEWHERE_IN_THE_METRO],
    lastSuccessfulRun: dataset.lastSuccessfulRun,
    buildToday: today,
    timeZone: config.timezone,
  };
}
