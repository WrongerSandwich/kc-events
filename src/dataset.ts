import { z } from "zod";

/** Bump when the published dataset's shape changes; downstream readers key on it. */
export const DATASET_SCHEMA_VERSION = 1;

/** ISO 8601 date (YYYY-MM-DD) or date-time with offset, as read in local time. */
const isoDateOrDateTime = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
const isoDateTime = z.iso.datetime({ offset: true });

export const RECURRENCE_CLASSES = ["one-off", "limited-run", "recurring"] as const;
export const EVENT_STATUSES = ["active", "unverified", "expired"] as const;
export const EXPIRY_REASONS = ["past", "two-strike", "cancelled"] as const;

export type RecurrenceClass = (typeof RECURRENCE_CLASSES)[number];
export type ExpiryReason = (typeof EXPIRY_REASONS)[number];

export const leadSchema = z.discriminatedUnion("lane", [
  z.strictObject({ lane: z.literal("registry"), source: z.string().min(1) }),
  z.strictObject({ lane: z.literal("discovery"), query: z.string().min(1) }),
]);

const eventFields = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  /** Absent for recurring events. */
  start: isoDateOrDateTime.optional(),
  /** Optional for one-offs on a single date; absent for recurring events. */
  end: isoDateOrDateTime.optional(),
  /** Recurring events only, e.g. "every Tuesday at 7pm". */
  schedule: z.string().min(1).optional(),
  /** Absent only while unverified: the page named no venue that could be cited. */
  venue: z.string().min(1).optional(),
  neighborhood: z.string().min(1),
  primaryUrl: z.url(),
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
 * Cite-or-drop as a schema invariant: an active event has a cited date and venue and a
 * last-verified stamp. A recurring event carries its schedule instead of a start and end;
 * nothing else carries a schedule.
 */
export const eventSchema = eventFields
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
  });

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

export const datasetSchema = z.strictObject({
  schemaVersion: z.literal(DATASET_SCHEMA_VERSION),
  /** When this file was written; null only before the first run. */
  generatedAt: isoDateTime.nullable(),
  /** When the last run completed; null only before the first run. */
  lastSuccessfulRun: isoDateTime.nullable(),
  events: z.array(eventSchema),
  /** Keyed by registry source name. */
  sourceState: z.record(z.string(), sourceStateSchema),
  /** Keyed by host, without "www.". */
  discoveryState: z.record(z.string(), discoveryHostStateSchema).default({}),
});

export type Event = z.infer<typeof eventSchema>;
export type SourceState = z.infer<typeof sourceStateSchema>;
export type Dataset = z.infer<typeof datasetSchema>;

export function parseDataset(raw: unknown): Dataset {
  return datasetSchema.parse(raw);
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
