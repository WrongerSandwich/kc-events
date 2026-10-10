import { z } from "zod";
import { DEFAULT_PLATFORM_HOSTS } from "./config.js";
import { onHost, sameSite } from "./hosts.js";

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
export const EXPIRY_REASONS = ["past", "two-strike", "cancelled", "index-page", "duplicate"] as const;

export type RecurrenceClass = (typeof RECURRENCE_CLASSES)[number];
export type EventStatus = (typeof EVENT_STATUSES)[number];
export type ExpiryReason = (typeof EXPIRY_REASONS)[number];

export const leadSchema = z.discriminatedUnion("lane", [
  z.strictObject({ lane: z.literal("registry"), source: z.string().min(1) }),
  z.strictObject({ lane: z.literal("discovery"), query: z.string().min(1) }),
]);

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
  primaryUrl: httpUrl,
  /** The event's own page, linked from the primary page: where the site sends the reader. Never fetched; absent when the primary page links to none. */
  eventUrl: httpUrl.optional(),
  kind: z.string().min(1),
  recurrence: z.enum(RECURRENCE_CLASSES),
  dontMiss: z.boolean(),
  whyLine: z.string().min(1).optional(),
  firstSeen: isoDateTime,
  lastVerified: isoDateTime.optional(),
  /** The run that first saw the event or last changed its date, venue, or status; curation re-judges on it. */
  lastChanged: isoDateTime.optional(),
  /** The run that last judged the event for don't-miss; absent until curation has seen it. */
  lastJudged: isoDateTime.optional(),
  status: z.enum(EVENT_STATUSES),
  /** Present exactly when the event is expired. */
  expiryReason: z.enum(EXPIRY_REASONS).optional(),
  verificationFailures: z.number().int().nonnegative(),
  /** Consecutive runs in which the event's primary page could not be loaded; absent in datasets older than the field. */
  consecutiveOutages: z.number().int().nonnegative().default(0),
  lead: leadSchema,
  evidence: z.strictObject({
    date: z.string().min(1).optional(),
    venue: z.string().min(1).optional(),
  }),
});

/**
 * What an event's date was read as: a recurring event's schedule phrase; otherwise its start, or
 * for a run already underway whose page gives only a closing date, its end.
 */
export function citedDate(e: { recurrence: RecurrenceClass; start?: string; end?: string; schedule?: string }): string | undefined {
  return e.recurrence === "recurring" ? e.schedule : (e.start ?? e.end);
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
    .refine((e) => e.eventUrl === undefined || ownPageAllowed(e.eventUrl, e.primaryUrl, platformHosts), {
      message: "an event's own page is on its primary page's site or a ticketing platform",
    });

export const eventSchema = eventSchemaFor(DEFAULT_PLATFORM_HOSTS);

export const sourceStateSchema = z.strictObject({
  consecutiveFailures: z.number().int().nonnegative(),
});

/** What the run remembers about a host the discovery lane found events on, for promotion suggestions. */
export const discoveryHostStateSchema = z.strictObject({
  /** How many runs have found an active event on this host. */
  runsSeen: z.number().int().positive(),
  /** The start of the last run that did. */
  lastSeen: isoDateTime,
});

export const datasetSchemaFor = (platformHosts: readonly string[]) =>
  z.strictObject({
    schemaVersion: z.literal(DATASET_SCHEMA_VERSION),
    /** When this file was written; null only before the first run. */
    generatedAt: isoDateTime.nullable(),
    /** When the last run completed; null only before the first run. */
    lastSuccessfulRun: isoDateTime.nullable(),
    events: z.array(eventSchemaFor(platformHosts)).superRefine((events, ctx) => {
      const seen = new Set<string>();
      for (const { id } of events) {
        if (seen.has(id)) ctx.addIssue({ code: "custom", message: `event ids must be unique; ${id} appears more than once` });
        seen.add(id);
      }
    }),
    /** Keyed by registry source name. */
    sourceState: z.record(z.string(), sourceStateSchema),
    /** Keyed by host, without "www.". */
    discoveryState: z.record(z.string(), discoveryHostStateSchema).default({}),
  });

export const datasetSchema = datasetSchemaFor(DEFAULT_PLATFORM_HOSTS);

export type Event = z.infer<typeof eventSchema>;
export type SourceState = z.infer<typeof sourceStateSchema>;
export type Dataset = z.infer<typeof datasetSchema>;

/** What parsing a dataset needs from the config; the defaults stand in where there is no config. */
export interface DatasetOptions {
  /** The ticketing platforms an event's own page may be on when it is off the primary page's site. */
  platformHosts?: readonly string[];
}

export function parseDataset(raw: unknown, { platformHosts = DEFAULT_PLATFORM_HOSTS }: DatasetOptions = {}): Dataset {
  return datasetSchemaFor(platformHosts).parse(raw);
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
