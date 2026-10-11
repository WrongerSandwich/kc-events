/**
 * The archive (#82): expired records long enough gone that nothing will revive them move out of the
 * live dataset into `data/archive/<year>.json`, so the file each run loads, and each weekly commit
 * rewrites, holds what may still matter. Folding and matching read the live file alone; a page that
 * lists an archived event again starts a new record.
 */
import type { Archive, Event } from "./dataset.js";
import { calendarDate } from "./identity.js";
import { shiftDate } from "./time.js";

/** Weeks after both its last day and its last change that an expired record moves to the archive. */
export const ARCHIVE_AFTER_WEEKS = 8;

/**
 * The date an expired record is archived by: the later of its last day (its end, else its start) and
 * the day of its last change (else its first sighting), which for an expired record is when it expired
 * or later. A cancelled show months out stays live until its date has passed too, so a page that
 * lists it again revives it.
 */
export function archiveDate(event: Event): string {
  const lastDay = calendarDate(event.end ?? event.start);
  const changed = calendarDate(event.lastChanged ?? event.firstSeen)!;
  return lastDay !== undefined && lastDay > changed ? lastDay : changed;
}

/** The live records and those to archive: every expired record whose archive date is more than eight weeks before today. */
export function splitArchived(events: Event[], today: string): { live: Event[]; archived: Event[] } {
  const cutoff = shiftDate(today, -7 * ARCHIVE_AFTER_WEEKS);
  const due = (e: Event) => e.status === "expired" && archiveDate(e) < cutoff;
  return { live: events.filter((e) => !due(e)), archived: events.filter(due) };
}

/** The archived records by the year of their archive date, the year file each goes to. */
export function byArchiveYear(events: Event[]): Map<string, Event[]> {
  const years = new Map<string, Event[]>();
  for (const event of events) {
    const year = archiveDate(event).slice(0, 4);
    years.set(year, [...(years.get(year) ?? []), event]);
  }
  return years;
}

/** A year's archive with these records added; one already there under the same id is replaced where it stood. */
export function addToArchive(archive: Archive, events: Event[]): Archive {
  const incoming = new Map(events.map((e) => [e.id, e]));
  const kept = archive.events.map((e) => incoming.get(e.id) ?? e);
  const known = new Set(archive.events.map((e) => e.id));
  return { ...archive, events: [...kept, ...events.filter((e) => !known.has(e.id))] };
}
