/**
 * Extraction: one fetched page plus the extraction rules go to the model, candidate events come
 * back, and each candidate becomes an event under cite-or-drop.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import type { RunConfig } from "./config.js";
import type { Event } from "./dataset.js";
import type { CompletionRequest, FetchResult } from "./ports.js";
import type { Source } from "./registry.js";
import { fromLocal } from "./time.js";

/** A page body longer than this is cut before it reaches the model; venue calendars rarely need more. */
const MAX_PAGE_CHARS = 60_000;

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME = /^\d{2}:\d{2}$/;

/**
 * What the extraction model returns for one page. Everything is required and nullable rather
 * than optional so the generated JSON schema is valid in strict mode. Dates and times are
 * local wall-clock strings; the run attaches the configured timezone.
 */
export const candidateSchema = z.object({
  title: z.string().describe("The event's title as the page gives it, without the venue name appended."),
  startDate: z.string().nullable().describe("First (or only) date, YYYY-MM-DD, read from the page body. Null when the page gives none."),
  startTime: z.string().nullable().describe("Show or start time on the first date, HH:MM 24-hour local. Null when the page gives none."),
  endDate: z.string().nullable().describe("Last date of a multi-date run, YYYY-MM-DD. Null for a single date."),
  endTime: z.string().nullable().describe("End time on the last date, HH:MM, when the page gives one."),
  venue: z.string().nullable().describe("The venue name as the page gives it. Null when the page does not name one."),
  primaryUrl: z.string().describe("The URL of the page the date and venue were read from, or the event's own page when this page links to one."),
  dateEvidence: z.string().nullable().describe("The exact text from the page body the dates and times were read from. Null when there is none."),
  venueEvidence: z.string().nullable().describe("The exact text from the page body the venue was read from. Null when there is none."),
  notice: z.enum(["none", "cancelled", "postponed"]).describe("Whether the page says the event is cancelled or postponed."),
});

export const extractionReplySchema = z.object({ events: z.array(candidateSchema) });

export type Candidate = z.infer<typeof candidateSchema>;

/** The strict JSON schema sent as the response format on every extraction call. */
export const extractionResponseFormat: CompletionRequest["responseFormat"] = {
  name: "extracted_events",
  schema: withoutSchemaKeyword(z.toJSONSchema(extractionReplySchema)),
};

/** Zod emits a `$schema` declaration that strict-mode response formats do not accept. */
function withoutSchemaKeyword({ $schema: _, ...schema }: Record<string, unknown>): Record<string, unknown> {
  return schema;
}

/** What every extraction call and every candidate in one run shares. */
export interface ExtractionContext {
  config: RunConfig;
  /** The extraction rules document, the first editorial surface. */
  rules: string;
  /** The run's local date, so relative dates on the page resolve. */
  today: string;
  /** The run's start, stamped as first-seen and last-verified. */
  nowIso: string;
  /** Every URL fetched this run, normalized; a candidate's primary page must be among them to verify. */
  fetchedUrls: Set<string>;
}

export function buildExtractionRequest(page: FetchResult, source: Source, context: ExtractionContext): CompletionRequest {
  const { config, rules, today } = context;
  const system = [
    rules,
    "",
    "## This run",
    "",
    `- Today: ${today} (${config.timezone})`,
    `- Horizon: the next ${config.horizonWeeks} weeks`,
    `- Geography: ${config.geography}`,
    `- Source: ${source.name} (${source.kind}, ${source.neighborhood})`,
    ...(source.checkHints ? [`- Source hints: ${source.checkHints}`] : []),
  ].join("\n");
  const user = `Page URL: ${page.finalUrl}\n\n${pageText(page.body)}`;
  return {
    model: config.models.extraction,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    responseFormat: extractionResponseFormat,
  };
}

/** HTML becomes readable text; anything else (an ICS or RSS feed) is passed through. Both are capped. */
export function pageText(body: string): string {
  const text = /<\s*(!doctype|html|body|div)\b/i.test(body)
    ? body
        .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article|header|footer)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/[ \t]+/g, " ")
        .replace(/\s*\n\s*/g, "\n")
        .trim()
    : body;
  return text.length > MAX_PAGE_CHARS ? `${text.slice(0, MAX_PAGE_CHARS)}\n[page truncated]` : text;
}

/**
 * A fresh id for an event first seen now. Opaque: it only has to be unique and never change, so
 * it is hashed from what makes this sighting distinct rather than from anything matching uses.
 */
export function newEventId(primaryUrl: string, title: string, nowIso: string): string {
  const digest = createHash("sha256").update(`${primaryUrl}\n${title}\n${nowIso}`).digest("hex");
  return `evt_${digest.slice(0, 12)}`;
}

/** Where a candidate came from: the source whose page it was read on. */
export interface CandidateOrigin {
  source: Source;
  /** The page this candidate was read from, normalized; the fallback primary URL. */
  pageUrl: string;
}

/**
 * Cite-or-drop: the candidate becomes active only when its primary page was fetched this run
 * and the model quoted evidence for both a usable date and a venue; anything less is held
 * unverified. A venue the page did not name stays absent rather than borrowing the source's.
 * Recurrence class is derived in a later ticket (#6); every event is a one-off for now.
 */
export function candidateToEvent(candidate: Candidate, origin: CandidateOrigin, context: ExtractionContext): Event {
  const { timezone } = context.config;
  const primaryUrl = normalizeUrl(candidate.primaryUrl, origin.pageUrl);
  const title = candidate.title.trim();
  const start = localIso(candidate.startDate, candidate.startTime, timezone);
  const end = localIso(candidate.endDate, candidate.endTime, timezone);
  const dateEvidence = nonEmpty(candidate.dateEvidence);
  const venueEvidence = nonEmpty(candidate.venueEvidence);
  const venue = nonEmpty(candidate.venue);

  const verified =
    context.fetchedUrls.has(primaryUrl) && start !== undefined && dateEvidence !== undefined && venue !== undefined && venueEvidence !== undefined;

  return {
    id: newEventId(primaryUrl, title, context.nowIso),
    title,
    ...(start !== undefined ? { start } : {}),
    ...(end !== undefined ? { end } : {}),
    ...(venue !== undefined ? { venue } : {}),
    neighborhood: origin.source.neighborhood,
    primaryUrl,
    kind: origin.source.kind,
    recurrence: "one-off",
    dontMiss: false,
    firstSeen: context.nowIso,
    ...(verified ? { lastVerified: context.nowIso } : {}),
    status: verified ? "active" : "unverified",
    verificationFailures: 0,
    lead: { lane: "registry", source: origin.source.name },
    evidence: {
      ...(dateEvidence !== undefined ? { date: dateEvidence } : {}),
      ...(venueEvidence !== undefined ? { venue: venueEvidence } : {}),
    },
  };
}

/** The URL in canonical form, or the fallback when it does not parse. */
export function normalizeUrl(url: string, fallback: string): string {
  try {
    return new URL(url).href;
  } catch {
    return fallback;
  }
}

/** A malformed date or time from the model counts as none: it cannot be cited. */
function localIso(date: string | null, time: string | null, timezone: string): string | undefined {
  if (date === null || !LOCAL_DATE.test(date) || Number.isNaN(Date.parse(date))) return undefined;
  return fromLocal(date, time !== null && LOCAL_TIME.test(time) ? time : undefined, timezone);
}

function nonEmpty(text: string | null): string | undefined {
  const trimmed = text?.trim();
  return trimmed ? trimmed : undefined;
}
