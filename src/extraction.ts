/**
 * Extraction: one fetched page plus the extraction rules go to the model, candidate events come
 * back, and each candidate becomes an event under cite-or-drop.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import type { RunConfig } from "./config.js";
import { citedDate, type Event } from "./dataset.js";
import { strictResponseFormat, thisRunLines } from "./model-request.js";
import type { CompletionRequest, FetchResult } from "./ports.js";
import type { Source } from "./registry.js";
import { deriveRecurrence } from "./recurrence.js";
import { toKind, toNeighborhood } from "./taxonomy.js";
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
  schedule: z
    .string()
    .nullable()
    .describe('For something that repeats with no end date (weekly trivia, a monthly market, a team\'s season): how it repeats, as a short phrase from the page, e.g. "Every Tuesday, 7pm". Null otherwise.'),
  sportsSeason: z.boolean().describe("True when this candidate is a sports team's season of games as a whole rather than one game."),
  venue: z.string().nullable().describe("The venue name as the page gives it. Null when the page does not name one."),
  neighborhood: z
    .string()
    .nullable()
    .describe(
      "The neighborhood from the Neighborhoods list under This run that the venue's address or location falls in. When none fits, the neighborhood or city the address is in. Null when the page gives no address or location and the venue is not the source's own.",
    ),
  outsideGeography: z.boolean().describe("True when the page places the event outside the Geography under This run."),
  kind: z.string().describe("One kind from the Kinds list under This run; other when none fits."),
  primaryUrl: z.string().describe("The URL of the page the date and venue were read from, or the event's own page when this page links to one."),
  dateEvidence: z.string().nullable().describe("The exact text from the page body the dates and times were read from. Null when there is none."),
  venueEvidence: z.string().nullable().describe("The exact text from the page body the venue was read from. Null when there is none."),
  notice: z.enum(["none", "cancelled", "postponed"]).describe("Whether the page says the event is cancelled or postponed."),
});

export const extractionReplySchema = z.object({ events: z.array(candidateSchema) });

export type Candidate = z.infer<typeof candidateSchema>;

/** The strict JSON schema sent as the response format on every extraction call. */
export const extractionResponseFormat = strictResponseFormat("extracted_events", extractionReplySchema);

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
  /** The controlled neighborhood list, seeded from the registry. */
  neighborhoods: string[];
}

/** Where a page came from: a registry source, or a discovery search that led to it. */
export type PageOrigin = { lane: "registry"; source: Source } | { lane: "discovery"; query: string };

export function buildExtractionRequest(page: FetchResult, origin: PageOrigin, context: ExtractionContext): CompletionRequest {
  const { config, rules, today, neighborhoods } = context;
  const sourceLines =
    origin.lane === "registry"
      ? [
          `- Source: ${origin.source.name} (${origin.source.kind}, ${origin.source.neighborhood})`,
          ...(origin.source.checkHints ? [`- Source hints: ${origin.source.checkHints}`] : []),
        ]
      : [`- Source: none; this page was found by the web search "${origin.query}"`];
  const system = [
    rules,
    "",
    ...thisRunLines(config, today),
    `- Geography: ${config.geography}`,
    `- Kinds: ${config.kinds.join(", ")}`,
    `- Neighborhoods: ${neighborhoods.join(", ")}`,
    ...sourceLines,
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
        .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, decodeCharacterReference)
        .replace(/[ \t\u00a0]+/g, " ")
        .replace(/\s*\n\s*/g, "\n")
        .trim()
    : body;
  return text.length > MAX_PAGE_CHARS ? `${text.slice(0, MAX_PAGE_CHARS)}\n[page truncated]` : text;
}

/** The named references that show up in event listings; a name not listed here is left as it was. */
const NAMED_REFERENCES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", deg: "°",
};

/** One HTML character reference (`&#x27;`, `&#8211;`, `&ndash;`) as the character a browser would show. */
function decodeCharacterReference(reference: string, body: string): string {
  if (body.startsWith("#")) {
    const codePoint = body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : reference;
  }
  return NAMED_REFERENCES[body.toLowerCase()] ?? reference;
}

/**
 * A fresh id for an event first seen now. Opaque: it only has to be unique and never change, so
 * it is hashed from what makes this sighting distinct rather than from anything matching uses.
 */
export function newEventId(primaryUrl: string, title: string, nowIso: string): string {
  const digest = createHash("sha256").update(`${primaryUrl}\n${title}\n${nowIso}`).digest("hex");
  return `evt_${digest.slice(0, 12)}`;
}

/** Where a candidate came from: how its page was found, and the page itself. */
export type CandidateOrigin = PageOrigin & {
  /** The page this candidate was read from, normalized; the fallback primary URL. */
  pageUrl: string;
};

/**
 * One candidate after cite-or-drop: the event as read off a page this run, whether the page says
 * it is cancelled, and, when its address mapped to no neighborhood on the list, what the
 * extractor proposed instead.
 */
export interface Sighting {
  event: Event;
  cancelled: boolean;
  unmappable?: { proposed?: string };
}

/**
 * Cite-or-drop: the candidate becomes active only when its primary page was fetched this run
 * and the model quoted evidence for both a usable date and a venue; anything less is held
 * unverified. A recurring event's date is its schedule phrase, which it carries instead of a
 * start and end. A venue the page did not name stays absent rather than borrowing the source's.
 */
export function candidateToSighting(candidate: Candidate, origin: CandidateOrigin, context: ExtractionContext): Sighting {
  const { timezone } = context.config;
  const primaryUrl = normalizeUrl(candidate.primaryUrl, origin.pageUrl);
  const title = candidate.title.trim();
  const start = localIso(candidate.startDate, candidate.startTime, timezone);
  const end = localIso(candidate.endDate, candidate.endTime, timezone);
  const schedule = nonEmpty(candidate.schedule);
  const recurrence = deriveRecurrence({ start, end, schedule, sportsSeason: candidate.sportsSeason });
  const when = recurrence === "recurring" ? { schedule } : { start, end };
  const dateEvidence = nonEmpty(candidate.dateEvidence);
  const venueEvidence = nonEmpty(candidate.venueEvidence);
  const venue = nonEmpty(candidate.venue);
  const placement = toNeighborhood(candidate.neighborhood, context.neighborhoods);

  const verified =
    context.fetchedUrls.has(primaryUrl) &&
    citedDate({ recurrence, ...when }) !== undefined &&
    dateEvidence !== undefined &&
    venue !== undefined &&
    venueEvidence !== undefined;

  const event: Event = {
    id: newEventId(primaryUrl, title, context.nowIso),
    title,
    ...(when.start !== undefined ? { start: when.start } : {}),
    ...(when.end !== undefined ? { end: when.end } : {}),
    ...(when.schedule !== undefined ? { schedule: when.schedule } : {}),
    ...(venue !== undefined ? { venue } : {}),
    neighborhood: placement.neighborhood,
    primaryUrl,
    kind: toKind(candidate.kind, context.config.kinds),
    recurrence,
    dontMiss: false,
    firstSeen: context.nowIso,
    ...(verified ? { lastVerified: context.nowIso } : {}),
    status: verified ? "active" : "unverified",
    verificationFailures: 0,
    consecutiveOutages: 0,
    lead: origin.lane === "registry" ? { lane: "registry", source: origin.source.name } : { lane: "discovery", query: origin.query },
    evidence: {
      ...(dateEvidence !== undefined ? { date: dateEvidence } : {}),
      ...(venueEvidence !== undefined ? { venue: venueEvidence } : {}),
    },
  };
  return { event, cancelled: candidate.notice === "cancelled", ...("unmappable" in placement ? { unmappable: placement.unmappable } : {}) };
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
