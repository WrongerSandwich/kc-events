import { z } from "zod";
import { DEFAULT_PLATFORM_HOSTS, ELSEWHERE_IN_THE_METRO, type RunConfig } from "./config.js";
import { onHost, samePage, sameSite } from "./hosts.js";
import { hasTime } from "./time.js";

/** Bump when the published dataset's shape changes; downstream readers key on it. */
export const DATASET_SCHEMA_VERSION = 1;

/** ISO 8601 date (YYYY-MM-DD) or date-time with offset, as read in local time. */
const isoDateOrDateTime = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
const isoDateTime = z.iso.datetime({ offset: true });
/**
 * A link the site can put in an href: http or https only, with no control character. Checked
 * before `z.url()`, which strips a newline from the value rather than rejecting it.
 */
const httpUrl = z
  .string()
  .regex(/^https?:[^\u0000-\u001f\u007f]*$/i, { message: "must be an http or https URL with no control characters" })
  .pipe(z.url());

export const RECURRENCE_CLASSES = ["one-off", "limited-run", "recurring"] as const;
export const EVENT_STATUSES = ["active", "unverified", "expired"] as const;
export const EXPIRY_REASONS = ["past", "two-strike", "cancelled", "index-page", "duplicate", "promotion", "not-public", "stale"] as const;

export type RecurrenceClass = (typeof RECURRENCE_CLASSES)[number];
export type EventStatus = (typeof EVENT_STATUSES)[number];
export type ExpiryReason = (typeof EXPIRY_REASONS)[number];

export const leadSchema = z.discriminatedUnion("lane", [
  z.strictObject({ lane: z.literal("registry"), source: z.string().min(1) }),
  z.strictObject({ lane: z.literal("discovery"), query: z.string().min(1) }),
]);

/** The longest price an event carries, as its own page states it (#133). */
export const MAX_PRICE = 80;
/** The longest age limit an event carries, as its own page states it (#133). */
export const MAX_AGES = 40;

/** The days of the week, in week order, as a limited run's `days` names them (#143). */
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** A value read from an event's own page: the page and the words on it that give the value. */
const ownPageQuote = z.strictObject({ page: httpUrl, quote: z.string().min(1) });

const eventFields = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  /** What the page says the event is, in a sentence or two, written by extraction; absent when no reading has said more than the listing line. */
  description: z.string().min(1).optional(),
  /** Absent for recurring events. */
  start: isoDateOrDateTime.optional(),
  /** Optional for one-offs on a single date; absent for recurring events. */
  end: isoDateOrDateTime.optional(),
  /** Recurring events only, e.g. "every Tuesday at 7pm". */
  schedule: z.string().min(1).optional(),
  /** Absent only while unverified: the page named no venue that could be cited. */
  venue: z.string().min(1).optional(),
  neighborhood: z.string().min(1),
  /**
   * Present on an event in the elsewhere-in-the-metro catch-all (#104), with the neighborhood or city the extractor
   * proposed instead when the reading that put it there proposed one; absent elsewhere, and on a record in the
   * catch-all no run has written since #104. The run report lists a record in the catch-all only when it began the
   * run without this, or with another proposal.
   */
  unplaced: z.strictObject({ proposed: z.string().min(1).optional() }).optional(),
  primaryUrl: httpUrl,
  /** The event's own page, linked from the primary page: where the site sends the reader. Never fetched; absent when the primary page links to none. */
  eventUrl: httpUrl.optional(),
  /** The price as the event's own page states it ("Free", "$25–$45"), with its quote under evidence (#133); absent when no own page read gave one. */
  price: z.string().min(1).max(MAX_PRICE).optional(),
  /** The age limit as the event's own page states it ("21+", "All ages"), with its quote under evidence (#133); absent when no own page read gave one. */
  ages: z.string().min(1).max(MAX_AGES).optional(),
  /**
   * The weekdays a limited run plays (#143), in week order, each once, as its own page states them or as the page of
   * performances it links lists them, with the quote under evidence; absent when no own page read gave them, which the
   * site takes as every day of its span. Never all seven: that is every day.
   */
  days: z
    .array(z.enum(WEEKDAYS))
    .min(1)
    .max(WEEKDAYS.length - 1)
    .refine((days) => days.every((d, i) => i === 0 || WEEKDAYS.indexOf(days[i - 1]!) < WEEKDAYS.indexOf(d)), { message: "days are in week order, each once" })
    .optional(),
  /**
   * The event's own page and the run that read it (#133): present from a read on the list's date until the list
   * gives another date or another own page, so a pick's page is read again only when one of them changes.
   */
  ownPageRead: z.strictObject({ page: httpUrl, on: z.iso.date() }).optional(),
  kind: z.string().min(1),
  recurrence: z.enum(RECURRENCE_CLASSES),
  dontMiss: z.boolean(),
  whyLine: z.string().min(1).optional(),
  firstSeen: isoDateTime,
  lastVerified: isoDateTime.optional(),
  /** The run that first saw the event or last changed its title, date, venue, or status (markChanged in curation); curation re-judges on it. */
  lastChanged: isoDateTime.optional(),
  /** The run that last judged the event for don't-miss; absent until curation has seen it. */
  lastJudged: isoDateTime.optional(),
  status: z.enum(EVENT_STATUSES),
  /** Present exactly when the event is expired. */
  expiryReason: z.enum(EXPIRY_REASONS).optional(),
  /** For an event expired as duplicate: the id of the record it was folded into, which its sightings count for (#77). Absent on a duplicate folded before the pointer was kept. */
  duplicateOf: z.string().min(1).optional(),
  /**
   * Present exactly while the event is held for promotion (ADR 0012): the discovery lane found it on a host
   * no active registry source is on and no ticketing platform, so it is stored unverified, never rendered,
   * and not re-read, until a person promotes the host into the registry.
   */
  heldForPromotion: z.literal(true).optional(),
  verificationFailures: z.number().int().nonnegative(),
  /**
   * Consecutive runs that could have sighted a record no reading ever verified and did not (#82); absent
   * at zero. The fourth expires it as stale (ageUnsighted in expiry).
   */
  runsUnsighted: z.number().int().positive().optional(),
  /** Consecutive runs in which the event's primary page could not be loaded; absent in datasets older than the field. */
  consecutiveOutages: z.number().int().nonnegative().default(0),
  lead: leadSchema,
  evidence: z.strictObject({
    date: z.string().min(1).optional(),
    venue: z.string().min(1).optional(),
    /**
     * Where the start's time was read when the primary page gave the date only (#123): the event's own page and the
     * words on it that give the time. Present only on a start that carries a time, from the event's own page.
     */
    time: ownPageQuote.optional(),
    /** Where the price was read (#133): the event's own page and the words on it that state it. Present exactly when the price is. */
    price: ownPageQuote.optional(),
    /** Where the age limit was read (#133): the event's own page and the words on it that state it. Present exactly when the age limit is. */
    ages: ownPageQuote.optional(),
    /**
     * Where a limited run's days were read (#143): its own page, or the page of performances the own page links, on the
     * venue's site or a ticketing platform. Present exactly when the days are.
     */
    days: ownPageQuote.optional(),
  }),
});

/**
 * What an event's date was read as: a recurring event's schedule phrase; otherwise its start, or
 * for a run already underway whose page gives only a closing date, its end.
 */
export function citedDate(e: { recurrence: RecurrenceClass; start?: string; end?: string; schedule?: string }): string | undefined {
  return e.recurrence === "recurring" ? e.schedule : (e.start ?? e.end);
}

/** Whether a quote read from an own page, when there is one, is from the event's own page. */
function fromOwnPage(quote: { page: string } | undefined, eventUrl: string | undefined): boolean {
  return quote === undefined || (eventUrl !== undefined && samePage(quote.page, eventUrl));
}

/**
 * Where an event's own page may be (ADR 0009, amended #75): on its primary page's site, meaning the
 * same registrable domain, or on one of the ticketing platforms the config lists. The page the
 * reader is sent to is then one the venue chose or one everyone sells through, never one a page
 * the job found chose.
 */
export function ownPageAllowed(eventUrl: string, primaryUrl: string, platformHosts: readonly string[]): boolean {
  return sameSite(eventUrl, primaryUrl) || onHost(eventUrl, platformHosts);
}

/**
 * Cite-or-drop as a schema invariant: an active event has a cited date and venue and a
 * last-verified stamp. A recurring event carries its schedule instead of a start and end;
 * nothing else carries a schedule. An own page is on the primary page's site or a ticketing
 * platform, which is why the schema takes the config's platform list.
 */
export const eventSchemaFor = (platformHosts: readonly string[]) =>
  eventFields
    .refine((e) => (e.recurrence === "recurring" ? e.start === undefined && e.end === undefined : e.schedule === undefined), {
      message: "a recurring event has a schedule instead of a start and end; other events have no schedule",
    })
    .refine(
      (e) =>
        e.status !== "active" ||
        (citedDate(e) !== undefined &&
          e.venue !== undefined &&
          e.lastVerified !== undefined &&
          e.evidence.date !== undefined &&
          e.evidence.venue !== undefined),
      { message: "an active event needs a cited date (a schedule when recurring), venue, lastVerified, and evidence for both date and venue" },
    )
    .refine((e) => !e.dontMiss || (e.recurrence !== "recurring" && e.whyLine !== undefined), {
      message: "a don't-miss flag needs a why-line and is never on a recurring event",
    })
    .refine((e) => (e.status === "expired") === (e.expiryReason !== undefined), {
      message: "an expired event has an expiryReason; no other event has one",
    })
    .refine((e) => e.duplicateOf === undefined || e.expiryReason === "duplicate", {
      message: "only an event expired as duplicate names the record it was folded into",
    })
    .refine((e) => e.heldForPromotion === undefined || (e.status === "unverified" && e.lead.lane === "discovery"), {
      message: "an event held for promotion is unverified and was found by the discovery lane",
    })
    .refine((e) => e.runsUnsighted === undefined || (e.status !== "expired" && e.lastVerified === undefined), {
      message: "only a record never verified and not expired counts runs unsighted",
    })
    .refine((e) => e.eventUrl === undefined || ownPageAllowed(e.eventUrl, e.primaryUrl, platformHosts), {
      message: "an event's own page is on its primary page's site or a ticketing platform",
    })
    .refine((e) => e.evidence.time === undefined || (hasTime(e.start) && e.eventUrl !== undefined && samePage(e.evidence.time.page, e.eventUrl)), {
      message: "a time quoted from an own page is on a start that carries a time, and from the event's own page",
    })
    .refine((e) => (e.price === undefined) === (e.evidence.price === undefined) && fromOwnPage(e.evidence.price, e.eventUrl), {
      message: "a price carries its quote, from the event's own page, and a price quote its price",
    })
    .refine((e) => (e.ages === undefined) === (e.evidence.ages === undefined) && fromOwnPage(e.evidence.ages, e.eventUrl), {
      message: "an age limit (ages) carries its quote, from the event's own page, and an ages quote its age limit",
    })
    .refine((e) => e.days === undefined || e.recurrence === "limited-run", {
      message: "only a limited run carries days",
    })
    .refine(
      (e) =>
        (e.days === undefined) === (e.evidence.days === undefined) &&
        (e.evidence.days === undefined || (e.eventUrl !== undefined && (samePage(e.evidence.days.page, e.eventUrl) || ownPageAllowed(e.evidence.days.page, e.primaryUrl, platformHosts)))),
      { message: "a run's days carry their quote, from its own page or a page of performances on its site or a ticketing platform, and a days quote its days" },
    )
    .refine((e) => e.unplaced === undefined || e.neighborhood === ELSEWHERE_IN_THE_METRO, {
      message: "only an event in the elsewhere-in-the-metro catch-all is marked unplaced",
    });

const eventSchema = eventSchemaFor(DEFAULT_PLATFORM_HOSTS);

export const sourceStateSchema = z.strictObject({
  consecutiveFailures: z.number().int().nonnegative(),
});

/** What the run remembers about a host the discovery lane found events on, for promotion suggestions. */
export const discoveryHostStateSchema = z.strictObject({
  /** How many runs have found an active event on this host. */
  runsSeen: z.number().int().positive(),
  /** The start of the last run that did. */
  lastSeen: isoDateTime,
  /** Consecutive runs with discovery on that have not found one since (#82); absent at zero. The eighth forgets the host. */
  runsUnseen: z.number().int().positive().optional(),
});

/** Events with ids unique among them. */
const uniqueEvents = (platformHosts: readonly string[]) =>
  z.array(eventSchemaFor(platformHosts)).superRefine((events, ctx) => {
    const seen = new Set<string>();
    for (const { id } of events) {
      if (seen.has(id)) ctx.addIssue({ code: "custom", message: `event ids must be unique; ${id} appears more than once` });
      seen.add(id);
    }
  });

export const datasetSchemaFor = (platformHosts: readonly string[]) =>
  z.strictObject({
    schemaVersion: z.literal(DATASET_SCHEMA_VERSION),
    /** When this file was written; null only before the first run. */
    generatedAt: isoDateTime.nullable(),
    /** When the last run completed; null only before the first run. */
    lastSuccessfulRun: isoDateTime.nullable(),
    events: uniqueEvents(platformHosts),
    /** Keyed by registry source name. */
    sourceState: z.record(z.string(), sourceStateSchema),
    /** Keyed by host, without "www.". */
    discoveryState: z.record(z.string(), discoveryHostStateSchema).default({}),
  });

const datasetSchema = datasetSchemaFor(DEFAULT_PLATFORM_HOSTS);

export type Event = z.infer<typeof eventSchema>;
export type SourceState = z.infer<typeof sourceStateSchema>;
export type Dataset = z.infer<typeof datasetSchema>;

/**
 * Parses a dataset under the run config, which names the ticketing platforms an event's own page
 * may be on; without a config, the default platform list stands in.
 */
export function parseDataset(raw: unknown, config?: Pick<RunConfig, "discovery">): Dataset {
  return datasetSchemaFor(config?.discovery.platformHosts ?? DEFAULT_PLATFORM_HOSTS).parse(raw);
}

/**
 * One year's archive (#82): `data/archive/<year>.json`, the expired records a run moved out of the live
 * file, as they were when it did. Nothing reads it to run; it is kept so the record is not lost.
 */
export const archiveSchemaFor = (platformHosts: readonly string[]) =>
  z.strictObject({
    schemaVersion: z.literal(DATASET_SCHEMA_VERSION),
    events: uniqueEvents(platformHosts),
  });

export type Archive = z.infer<ReturnType<typeof archiveSchemaFor>>;

/** Parses an archive file under the run config, as parseDataset does the live file. */
export function parseArchive(raw: unknown, config?: Pick<RunConfig, "discovery">): Archive {
  return archiveSchemaFor(config?.discovery.platformHosts ?? DEFAULT_PLATFORM_HOSTS).parse(raw);
}

/** The dataset before any run has happened. */
export function emptyDataset(): Dataset {
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    generatedAt: null,
    lastSuccessfulRun: null,
    events: [],
    sourceState: {},
    discoveryState: {},
  };
}
