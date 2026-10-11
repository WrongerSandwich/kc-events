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
  /** The venue's display name: the page's name, or the venue research.config.yaml's venueAliases file it under. */
  venue: string;
  /** The page's name when it was a room inside the venue ("Helzberg Hall"); see venueLine. */
  room?: string;
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

/** The public /events.json: the published events, each with its description when it has one. */
export type PublishedDataset = {
  schemaVersion: number;
  /** When the build wrote the file, as an ISO instant. */
  generatedAt: string;
  lastSuccessfulRun: string;
  events: (PublishedEvent & { description?: string })[];
};

/** What the site says about the job, taken from the job so the words cannot drift from it; only Astro pages read it. */
export type PublishedAbout = {
  /** The product token in the user agent, which a robots.txt group names. */
  crawler: string;
  /** The job's user agent, verbatim. */
  userAgent: string;
  /** research.config.yaml's geography: "Kansas City metro on both sides of the state line, plus Lawrence". */
  geography: string;
};

/**
 * What loadPublished returns; the generator writes `events` to src/generated/events.ts, `descriptions` to
 * descriptions.ts, `about` to about.ts, and the rest to meta.ts.
 */
export type Published = PublishedMeta & { events: PublishedEvent[]; descriptions: PublishedDescriptions; about: PublishedAbout };
