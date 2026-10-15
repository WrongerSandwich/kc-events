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
  /** The price as the event's own page stated it ("Free", "$25–$45"), when a read of it gave one (#133). */
  price?: string;
  /** The age limit as the event's own page stated it ("21+", "All ages"), when a read of it gave one (#133). */
  ages?: string;
  /**
   * A limited run's weekdays when its own page stated them (#143), as weekday() numbers (0 is Sunday) in the job's week
   * order, Monday first; without them it is open every day of its span.
   */
  days?: number[];
  /** The days in words ("Fri–Sun"), written by the build (daysPhrase) so the pages need not; present exactly with days. */
  daysLine?: string;
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
  /** research.config.yaml's `geography`, the footer's one sentence about where the list covers. */
  geography: string;
};

/** An event that went this run: listed as text with its page, since it has no page of its own any more. */
export type GoneEvent = {
  title: string;
  /** The venue's display name, when the expired record is still in the dataset (it always is the week it goes). */
  venue?: string;
  start?: string;
  primaryUrl: string;
  /** "two-strike": twice not found on its page, which the page calls no longer listed by the venue. */
  reason: "cancelled" | "two-strike";
};

/** What the changes page lists (#135), src/generated/changes.ts. */
export type PublishedChanges = {
  /** Published events first seen in the week through the last run, by start. */
  newThisWeek: PublishedEvent[];
  /** The last run against the one before it; absent when its report records none (reports before #135). */
  comparison?: {
    /** The run compared with; null when the last run was the first. */
    comparedWith: string | null;
    newPicks: PublishedEvent[];
    /** Each with the start it had before. */
    moved: { event: PublishedEvent; from: string }[];
    gone: GoneEvent[];
  };
};

/** A venue table row's address (#137), split from its one line ("1601 Broadway Blvd, Kansas City, MO 64108"). */
export type VenueAddress = { street: string; locality: string; region: "MO" | "KS"; postalCode: string };

/**
 * A venue page, /v/<slug> (#137): every venue a published event is at, and every row of data/venues.yaml. The address,
 * position, and site come from the row; a venue with none has its events and its neighborhood alone.
 */
export type PublishedVenue = {
  /** venueSlug of the name; the events at the venue are those whose venue has this slug. */
  slug: string;
  /** The row's name, else the spelling most of its events give. */
  name: string;
  address?: VenueAddress;
  geo?: { lat: number; lng: number };
  /** The venue's own site. */
  url?: string;
  /** The neighborhood most of its published events give; absent when it has none. */
  neighborhood?: string;
  region?: string;
};

/**
 * What loadPublished returns; the generator writes `events` to src/generated/events.ts, `descriptions` to
 * descriptions.ts, `about` to about.ts, `changes` to changes.ts, `venues` to venues.ts, and the rest to meta.ts.
 */
export type Published = PublishedMeta & { events: PublishedEvent[]; descriptions: PublishedDescriptions; about: PublishedAbout; changes: PublishedChanges; venues: PublishedVenue[] };
