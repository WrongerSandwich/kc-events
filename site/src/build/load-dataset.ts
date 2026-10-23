/**
 * Build-time only: the one place the site reads the research job's files and types. Parses with the
 * job's own schemas, keeps active non-past events, and projects them to what the browser sees.
 */
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { PRODUCT, USER_AGENT } from "../../../src/adapters/identity.ts";
import { ELSEWHERE_IN_THE_METRO, parseConfig, type RunConfig } from "../../../src/config.ts";
import { DATASET_SCHEMA_VERSION, parseDataset, WEEKDAYS, type Event, type Weekday } from "../../../src/dataset.ts";
import { genericVenueName, venueAndRoom } from "../../../src/identity.ts";
import { regionOf } from "../../../src/taxonomy.ts";
import { toLocalDate } from "../../../src/time.ts";
import { addDays, isDateOnly, isValidDate, localDate } from "../lib/dates";
import { isPast } from "../lib/events";
import type { Published, PublishedDescriptions, PublishedEvent } from "../lib/types";
import { publishedChanges, readRunChanges } from "./changes.ts";
import { href } from "./href.ts";
import { isProductionBuild, knownOrigin } from "./origin.ts";
import { buildVenues, readVenueTable } from "./venues.ts";

/** Bumped by hand when the site is updated for a new dataset shape; a job-side bump fails the build until then. */
export const SITE_EXPECTS_SCHEMA_VERSION = 1;
/** Raw bytes of the projected events; past this the explorer's one-page design needs rethinking. */
export const MAX_PAYLOAD_BYTES = 400_000;
/**
 * Fewest published events a build will deploy (audit E14): a job bug that leaves everything unverified or expired
 * would otherwise replace a good site with an empty one. A real week publishes hundreds (455 on the 10-19 run).
 * SITE_ALLOW_SMALL=1 lifts it, for the fixture builds and the tests (vitest.config.ts sets it).
 */
export const MIN_PUBLISHED = 50;

/** How far the build's today may be from the last successful run's day, either way, before it is taken for a wrong clock or SITE_TODAY. */
export const MAX_DAYS_FROM_RUN = 14;

/** The SITE_TODAY (or today option) that means the last successful run's local day. */
export const LAST_RUN = "last-run";

/** The job's event ids; the sitemap and `view-transition-name` take them as they are. */
const EVENT_ID = /^evt_[0-9a-f]{12}$/;

/** An end that falls before its start: by instant when both carry a time, else by day (a date end on a timed start's day is not before it). */
function endsBeforeStart(start: string, end: string): boolean {
  if (!isDateOnly(start) && !isDateOnly(end)) return Date.parse(end) < Date.parse(start);
  return localDate(end) < localDate(start);
}

/**
 * Throws on an active event the pages cannot render, which the job's schema lets through: a one-off with no start
 * (the tile and the front page read it), an end before the start (an invalid calendar file, a future event dropped as
 * past), a kind with no colour, icon or filter, or an id the sitemap and view transitions cannot carry.
 */
function assertRenderable(e: Event, config: RunConfig): void {
  if (!EVENT_ID.test(e.id)) throw new Error(`event id ${JSON.stringify(e.id)} is not evt_ and twelve hex digits`);
  if (e.recurrence === "one-off" && e.start === undefined) throw new Error(`event ${e.id} is a one-off with no start`);
  if (e.start !== undefined && e.end !== undefined && endsBeforeStart(e.start, e.end)) throw new Error(`event ${e.id} has its end, ${e.end}, before its start, ${e.start}`);
  if (!config.kinds.includes(e.kind)) throw new Error(`event ${e.id} has kind "${e.kind}", which research.config.yaml does not list`);
}

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

/**
 * A run's weekdays in a few characters (#143), written here so no page carries the code: a stretch of three or more in a
 * row as a span, the rest listed, the last after "&": "Fri–Sun", "Sat & Sun", "Tue, Thu & Sat", "Mon, Wed–Fri".
 */
export function daysPhrase(days: readonly Weekday[]): string {
  const runs: Weekday[][] = [];
  for (const d of days) {
    const last = runs.at(-1);
    if (last !== undefined && WEEKDAYS.indexOf(last.at(-1)!) + 1 === WEEKDAYS.indexOf(d)) last.push(d);
    else runs.push([d]);
  }
  const parts = runs.flatMap((r) => (r.length >= 3 ? [`${r[0]}–${r.at(-1)}`] : r));
  if (parts.length === 1) return parts[0]!;
  return runs.at(-1)!.length >= 3 ? parts.join(", ") : `${parts.slice(0, -1).join(", ")} & ${parts.at(-1)}`;
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
    primaryUrl: href(e.primaryUrl, `event ${e.id}`),
    kind: e.kind,
    recurrence: e.recurrence,
    dontMiss: e.dontMiss,
    lastVerified: e.lastVerified!,
  };
  if (e.eventUrl !== undefined) out.eventUrl = href(e.eventUrl, `event ${e.id}`);
  if (e.start !== undefined) out.start = e.start;
  if (e.end !== undefined) out.end = e.end;
  if (e.schedule !== undefined) out.schedule = e.schedule;
  if (e.whyLine !== undefined) out.whyLine = e.whyLine;
  if (e.price !== undefined) out.price = e.price;
  if (e.ages !== undefined) out.ages = e.ages;
  if (e.days !== undefined) {
    out.days = e.days.map((d) => (WEEKDAYS.indexOf(d) + 1) % 7);
    out.daysLine = daysPhrase(e.days);
  }
  return out;
}

/** `venuesPath`: the venue table (#137); with none, or no file there, every venue page has its events alone. */
export function loadPublished(opts: { datasetPath: string; configPath: string; venuesPath?: string; today?: string }): Published {
  const config = parseConfig(parseYaml(readFileSync(opts.configPath, "utf8")));
  checkSchemaVersion(DATASET_SCHEMA_VERSION);
  const dataset = parseDataset(JSON.parse(readFileSync(opts.datasetPath, "utf8")), config);
  if (dataset.lastSuccessfulRun === null) throw new Error("the dataset records no successful run; nothing to publish");
  const runDay = localDate(dataset.lastSuccessfulRun);
  // `SITE_TODAY=last-run` builds as of the run's own day: what the site tests build with, so they never depend on real today.
  const asked = opts.today ?? process.env.SITE_TODAY;
  const today = asked === LAST_RUN ? runDay : (asked ?? toLocalDate(new Date(), config.timezone));
  if (!isValidDate(today)) {
    const source = opts.today !== undefined ? "the today option" : "SITE_TODAY";
    throw new Error(`the build's today must be a real YYYY-MM-DD date, got "${today}" (from ${source})`);
  }

  if (isProductionBuild() && knownOrigin() === undefined) {
    throw new Error("a production build needs its origin for canonical links and the sitemap: set SITE_ORIGIN (or build on Vercel, which sets VERCEL_PROJECT_PRODUCTION_URL)");
  }
  if (today > addDays(runDay, MAX_DAYS_FROM_RUN) || today < addDays(runDay, -MAX_DAYS_FROM_RUN)) {
    throw new Error(`the build's today, ${today}, is more than ${MAX_DAYS_FROM_RUN} days from the last successful run, ${runDay}: check SITE_TODAY or the weekly run`);
  }

  const active = dataset.events.filter((e) => e.status === "active");
  const seen = new Set<string>();
  for (const e of active) {
    if (seen.has(e.id)) throw new Error(`duplicate active event id ${e.id}`);
    seen.add(e.id);
    assertRenderable(e, config);
  }
  const published = active.map((e) => ({ e, out: project(e, config) })).filter(({ out }) => !isPast(out, today));
  if (active.length > 0 && published.length === 0) {
    throw new Error(`the dataset has ${active.length} active events but none from ${today} on: no event to publish; check SITE_TODAY or the weekly run`);
  }
  const events = published.map(({ out }) => out);
  if (events.length < MIN_PUBLISHED && process.env.SITE_ALLOW_SMALL !== "1") {
    throw new Error(`only ${events.length} events to publish from ${today} on, fewer than ${MIN_PUBLISHED}: check the weekly run, or set SITE_ALLOW_SMALL=1 to build a small dataset anyway`);
  }
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

  const changes = publishedChanges({
    events: dataset.events,
    published: events,
    changes: readRunChanges(opts.datasetPath, dataset.lastSuccessfulRun),
    runDay,
    venueAliases: config.venueAliases,
  });

  const venues = buildVenues({
    rows: readVenueTable(opts.venuesPath),
    events,
    recordVenues: dataset.events.flatMap((e) => (e.venue === undefined ? [] : [e.venue])),
    aliases: config.venueAliases,
  });

  return {
    events,
    descriptions,
    changes,
    venues,
    kinds: config.kinds,
    regions: [...Object.keys(config.neighborhoods), ELSEWHERE_IN_THE_METRO],
    lastSuccessfulRun: dataset.lastSuccessfulRun,
    buildToday: today,
    timeZone: config.timezone,
    about: { crawler: PRODUCT, userAgent: USER_AGENT, geography: config.geography, horizonWeeks: config.horizonWeeks, neighborhoods: config.neighborhoods },
  };
}
