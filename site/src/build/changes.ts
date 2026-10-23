/**
 * Build-time only: what the changes page lists (#135), from the dataset and the changes section of the report the last
 * run wrote (runChanges in the job), which compares that run's dataset with the one it started from.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Event } from "../../../src/dataset.ts";
import { venueAndRoom, type VenueAliases } from "../../../src/identity.ts";
import { parseRunReport, type RunChanges } from "../../../src/report.ts";
import { addDays, localDate } from "../lib/dates";
import type { GoneEvent, PublishedChanges, PublishedEvent } from "../lib/types";
import { href } from "./href.ts";

/** New this week: first seen in the days through the last run's, this many of them. */
export const NEW_WITHIN_DAYS = 7;

/**
 * The changes section of the report the run that finished at `lastSuccessfulRun` wrote, from the `runs` directory
 * beside the dataset: the report is named for the day the run started, which is the day it finished or the one before.
 * Nothing when there is no such report or it predates the section.
 */
export function readRunChanges(datasetPath: string, lastSuccessfulRun: string): RunChanges | undefined {
  const runDay = localDate(lastSuccessfulRun);
  for (const day of [runDay, addDays(runDay, -1)]) {
    const path = join(dirname(datasetPath), "runs", `${day}.json`);
    if (!existsSync(path)) continue;
    const report = parseRunReport(JSON.parse(readFileSync(path, "utf8")));
    if (report.finishedAt === lastSuccessfulRun) return report.changes;
  }
  return undefined;
}

/** By start, a start-less run first, then by title. */
const byStart = (a: PublishedEvent, b: PublishedEvent) => (a.start ?? "").localeCompare(b.start ?? "") || a.title.localeCompare(b.title);

/**
 * The page's groups. New this week is every published event first seen in the NEW_WITHIN_DAYS days through the run's
 * day. The run's own groups, when its report records them, keep the new picks and moves that are still published (an
 * event past by the build's day is not), and every event gone, with the venue and date its expired record keeps.
 */
export function publishedChanges(opts: { events: Event[]; published: PublishedEvent[]; changes: RunChanges | undefined; runDay: string; venueAliases?: VenueAliases }): PublishedChanges {
  const { events, published, changes, runDay } = opts;
  const byId = new Map(published.map((e) => [e.id, e]));
  const firstSeen = new Map(events.map((e) => [e.id, localDate(e.firstSeen)]));
  const since = addDays(runDay, -NEW_WITHIN_DAYS);
  const newThisWeek = published.filter((e) => {
    const day = firstSeen.get(e.id);
    return day !== undefined && day > since && day <= runDay;
  });
  if (changes === undefined) return { newThisWeek: newThisWeek.sort(byStart) };

  const records = new Map(events.map((e) => [e.id, e]));
  const gone = changes.gone.map(({ id, title, primaryUrl, reason }): GoneEvent => {
    const record = records.get(id);
    const venue = record?.venue === undefined ? undefined : venueAndRoom(record.venue, opts.venueAliases ?? {}).venue;
    return { title, ...(venue !== undefined && { venue }), ...(record?.start !== undefined && { start: record.start }), primaryUrl: href(primaryUrl, `gone event ${id} in the run report`), reason };
  });
  return {
    newThisWeek: newThisWeek.sort(byStart),
    comparison: {
      comparedWith: changes.comparedWith,
      newPicks: changes.newPicks.flatMap((r) => byId.get(r.id) ?? []).sort(byStart),
      moved: changes.moved.flatMap((r) => (byId.has(r.id) ? [{ event: byId.get(r.id)!, from: r.from }] : [])),
      gone,
    },
  };
}
