export type Recurrence = "one-off" | "limited-run" | "recurring";

/** An active event as the site sees it: the job's record minus its internals, plus region. */
export type PublishedEvent = {
  id: string;
  title: string;
  /** Local ISO date (YYYY-MM-DD) or date-time with offset, as the job wrote it. Absent for recurring events, and for a limited run already underway when first read. */
  start?: string;
  end?: string;
  /** Recurring events only, e.g. "Every Tuesday, 7pm". */
  schedule?: string;
  venue: string;
  neighborhood: string;
  region: string;
  /** The page the date and venue were read from; what the verified line names. */
  primaryUrl: string;
  /** The event's own page when the job found one linked from the primary page; where "Details and tickets" goes (see detailsUrl). */
  eventUrl?: string;
  kind: string;
  recurrence: Recurrence;
  dontMiss: boolean;
  whyLine?: string;
  lastVerified: string;
};

/** The small half of the build's output, src/generated/meta.ts: what every page and island may import. */
export type PublishedMeta = {
  kinds: string[];
  /** The config's regions in order, then the catch-all. */
  regions: string[];
  lastSuccessfulRun: string;
  /** The local date the build ran on (or SITE_TODAY); islands render with it first, then the visitor's. */
  buildToday: string;
  timeZone: string;
};

/** What the page says each event is, by event id, for the events that have one; only the event page reads it. */
export type PublishedDescriptions = Record<string, string>;

/** What loadPublished returns; the generator writes `events` to src/generated/events.ts, `descriptions` to descriptions.ts, and the rest to meta.ts. */
export type Published = PublishedMeta & { events: PublishedEvent[]; descriptions: PublishedDescriptions };
