/**
 * Extraction: one fetched page plus the extraction rules go to the model, candidate events come
 * back, and each candidate becomes an event under cite-or-drop.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import type { RunConfig } from "./config.js";
import { citedDate, ownPageAllowed, type Event } from "./dataset.js";
import { linkTarget } from "./discovery.js";
import { samePage } from "./hosts.js";
import { calendarDate } from "./identity.js";
import { strictResponseFormat, thisRunLines } from "./model-request.js";
import type { CompletionRequest, FetchResult } from "./ports.js";
import type { Source } from "./registry.js";
import { deriveRecurrence } from "./recurrence.js";
import { toKind, toNeighborhood } from "./taxonomy.js";
import { fromLocal } from "./time.js";

/** A page body longer than this is cut before it reaches the model; venue calendars rarely need more, link markers included. */
const MAX_PAGE_CHARS = 70_000;

/**
 * A whole anchor element: its attributes (group 1), read one at a time so a quoted value holding ">"
 * cannot end the tag early, and its content (group 2), which stops at the next anchor's start so
 * an unclosed anchor can neither swallow the next one's text nor take its number.
 */
const ANCHOR = /<a\b((?:\s+[^\s<>"'=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s<>"']+))?)*)\s*\/?>((?:(?!<a\b)[\s\S])*?)<\/a\s*>/gi;
const HREF = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i;
/** A number in brackets, as `readPage` writes after a link, with any space before it. */
const BRACKETED_NUMBER = /\s*\[(\d+)\]/g;

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** A clock time, 00:00 to 23:59; a one-digit hour is padded before use. */
const LOCAL_TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;

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
  eventLink: z
    .number()
    .int()
    .nullable()
    .describe("The number in brackets after the link on this page that goes to this event's own page (its details or tickets): 12 for \"[12]\". Null when the event has no link of its own."),
  dateEvidence: z.string().nullable().describe("The exact text from the page body the dates and times were read from. Null when there is none."),
  venueEvidence: z.string().nullable().describe("The exact text from the page body the venue was read from. Null when there is none."),
  notice: z.enum(["none", "cancelled", "postponed"]).describe("Whether the page says the event is cancelled or postponed."),
  description: z
    .string()
    .nullable()
    .describe("One or two plain sentences on what the event is, from the page's own text only. Null when the page says nothing about it beyond its listing line."),
});

export const extractionReplySchema = z.object({ events: z.array(candidateSchema) });

/**
 * The longest each free-text field the model writes may be, so one runaway page cannot grow the
 * dataset past what the site will build. Checked candidate by candidate rather than in the response
 * format, so one long candidate costs only itself and no provider's strict mode has to accept a
 * length keyword.
 */
export const cappedCandidateSchema = candidateSchema.extend({
  title: z.string().max(200),
  venue: z.string().max(150).nullable(),
  description: z.string().max(300).nullable(),
  dateEvidence: z.string().max(500).nullable(),
  venueEvidence: z.string().max(500).nullable(),
  schedule: z.string().max(200).nullable(),
});

/** The first field of the candidate that runs past its cap, and the cap, or undefined when none does. */
export function overCap(candidate: Candidate): { field: string; cap: number } | undefined {
  const parsed = cappedCandidateSchema.safeParse(candidate);
  const issue = parsed.success ? undefined : parsed.error.issues.find((i) => i.code === "too_big");
  return issue ? { field: String(issue.path[0]), cap: Number(issue.maximum) } : undefined;
}

export type Candidate = z.infer<typeof candidateSchema>;

/** Two minutes for one page; a call past it costs only its page, not the weekly run's time budget. */
const EXTRACTION_TIMEOUT_MS = 120_000;

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
  /** The controlled neighborhood list: every region's neighborhoods, then the catch-all. */
  neighborhoods: string[];
}

/** Where a page came from: a registry source, or a discovery search that led to it. */
export type PageOrigin = { lane: "registry"; source: Source } | { lane: "discovery"; query: string };

export function buildExtractionRequest(page: FetchResult, reading: PageReading, origin: PageOrigin, context: ExtractionContext): CompletionRequest {
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
  const user = `Page URL: ${page.finalUrl}\n\n${reading.text}`;
  return {
    model: config.models.extraction,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    responseFormat: extractionResponseFormat,
    timeoutMs: EXTRACTION_TIMEOUT_MS,
  };
}

/** A page as the model reads it: its text, with each followable link marked by number, and what the numbers lead to. */
export interface PageReading {
  text: string;
  /** Link n on the page is `links[n - 1]`. */
  links: string[];
}

/**
 * The page's text with every link a reader could follow kept as a number in brackets after the
 * linked text ("Cheekface [12]"), the same URL getting the same number wherever it is linked. The
 * model names an event's own page by number, so it never writes a URL. Not numbered: the page
 * itself (as fetched or as it redirected), and anything `linkTarget` rules out (assets, ignored
 * and aggregator hosts). The page's schema.org events follow the text, numbered the same way (see
 * `eventDataSection`). A feed has no anchors and is passed through.
 */
export function readPage(page: FetchResult, config: RunConfig): PageReading {
  if (!isHtml(page.body)) return { text: pageText(page.body), links: [] };
  const links: string[] = [];
  const number = (href: string): number | undefined => {
    const link = linkTarget(href, page, config);
    if (link === undefined || samePage(link, page.url) || samePage(link, page.finalUrl)) return undefined;
    const n = links.indexOf(link) + 1;
    return n === 0 ? links.push(link) : n;
  };
  const marked = withoutScripts(page.body).replace(ANCHOR, (_, attributes: string, content: string) => {
    const href = attributes.match(HREF);
    const n = href ? number(href[1] ?? href[2] ?? href[3] ?? "") : undefined;
    // Spaced as the tags were, so adjacent anchors do not run together once the tags are gone.
    return n === undefined ? ` ${content} ` : ` ${content} [${n}] `;
  });
  const section = eventDataSection(page.body, number);
  return { text: capped(section ? `${htmlText(marked)}\n\n${section}` : htmlText(marked)), links };
}

function isHtml(body: string): boolean {
  return /<\s*(!doctype|html|body|div)\b/i.test(body);
}

function withoutScripts(body: string): string {
  return body.replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
}

/**
 * A whole tag: its name, then its attributes read one at a time, so a quoted value holding ">" (a
 * utility class such as `[&>span]:underline`) cannot end it early and spill the rest into the text.
 */
const TAG = /<\/?[a-z][^\s<>/]*(?:\s+[^\s<>"'=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s<>"']+))?)*\s*\/?>/gi;

/** HTML becomes readable text; anything else (an ICS or RSS feed) is passed through. Both are capped. */
export function pageText(body: string): string {
  return capped(isHtml(body) ? htmlText(body) : body);
}

function htmlText(body: string): string {
  return decoded(
    withoutScripts(body)
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article|header|footer)>/gi, "\n")
      .replace(TAG, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function decoded(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, decodeCharacterReference);
}

/** A reading longer than the cap is cut at the end of the last line that fits, so no listing is left half a line. */
function capped(text: string): string {
  if (text.length <= MAX_PAGE_CHARS) return text;
  const lineEnd = text.lastIndexOf("\n", MAX_PAGE_CHARS);
  return `${text.slice(0, lineEnd > 0 ? lineEnd : MAX_PAGE_CHARS)}\n[page truncated]`;
}

const LD_JSON = /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
/** The most of an event's own description the section carries; the model writes two sentences from it. */
const MAX_EVENT_DATA_DESCRIPTION = 400;

/**
 * The page's schema.org events (its `application/ld+json` scripts), one line each: name and its link's
 * number, start, end, place, and description, as the page's code gives them. Calendars often give the
 * time or the blurb only there (#98), and the text drops scripts. Undefined when the page has none.
 */
function eventDataSection(body: string, number: (href: string) => number | undefined): string | undefined {
  const events: Record<string, unknown>[] = [];
  for (const [, json] of body.matchAll(LD_JSON)) {
    try {
      collectEvents(JSON.parse(json ?? ""), events);
    } catch {
      // A script that is not JSON says nothing the model could use.
    }
  }
  const lines = new Set(events.map((event) => eventDataLine(event, number)).filter((line) => line !== undefined));
  return lines.size === 0 ? undefined : ["Event data in the page's code (schema.org):", ...lines].join("\n");
}

/** Every object typed as an event (Event, MusicEvent, TheaterEvent\u2026), wherever it sits; an event's own parts are not walked. */
function collectEvents(value: unknown, into: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectEvents(item, into);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const types: unknown[] = ([] as unknown[]).concat((value as Record<string, unknown>)["@type"]);
  if (types.some((type) => typeof type === "string" && /Event$/.test(type))) into.push(value as Record<string, unknown>);
  else for (const child of Object.values(value)) collectEvents(child, into);
}

function eventDataLine(event: Record<string, unknown>, number: (href: string) => number | undefined): string | undefined {
  const name = plainText(event.name);
  const start = plainText(event.startDate);
  if (!name || !start) return undefined;
  const n = typeof event.url === "string" ? number(event.url) : undefined;
  const end = plainText(event.endDate);
  const place = placeText(event.location);
  const description = plainText(event.description);
  return [
    n === undefined ? name : `${name} [${n}]`,
    `starts ${start}`,
    ...(end ? [`ends ${end}`] : []),
    ...(place ? [`at ${place}`] : []),
    ...(description ? [description.length > MAX_EVENT_DATA_DESCRIPTION ? `${description.slice(0, MAX_EVENT_DATA_DESCRIPTION).trimEnd()}\u2026` : description] : []),
  ].join(" | ");
}

/** A place's name, street, and town, whichever it gives; the first, when there are several. */
function placeText(location: unknown): string {
  const place = Array.isArray(location) ? location[0] : location;
  if (typeof place === "string") return plainText(place);
  if (place === null || typeof place !== "object") return "";
  const { name, address } = place as Record<string, unknown>;
  const parts =
    address !== null && typeof address === "object"
      ? [name, (address as Record<string, unknown>).streetAddress, (address as Record<string, unknown>).addressLocality]
      : [name, address];
  return [...new Set(parts.map(plainText).filter(Boolean))].join(", ");
}

/**
 * A value from the event data as one line of plain text. Sites escape the HTML in it and then escape
 * that again ("&lt;p&gt;", "&amp;amp;"), so references are decoded around the tags' removal.
 */
function plainText(value: unknown): string {
  if (typeof value !== "string") return "";
  return decoded(decoded(value).replace(TAG, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
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
 * it is hashed from what makes this sighting distinct rather than from anything matching uses: its
 * page, title, calendar date (a page may list one title on two nights, #77), and the run.
 */
export function newEventId(primaryUrl: string, title: string, nowIso: string, start?: string): string {
  const digest = createHash("sha256").update(`${primaryUrl}\n${title}\n${calendarDate(start) ?? ""}\n${nowIso}`).digest("hex");
  return `evt_${digest.slice(0, 12)}`;
}

/** Where a candidate came from: how its page was found, and the page itself. */
export type CandidateOrigin = PageOrigin & {
  /** The page this candidate was read from, normalized, and so its primary URL. */
  pageUrl: string;
  /** What the page's numbered links lead to, as `readPage` gave them. */
  links: string[];
  /** The page's text as quotes are compared with it, from `quotableText`. */
  quotableText: string;
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
  /** Why a date or time the model wrote could not be used, which made the candidate uncitable. */
  dateProblem?: string;
  /** Which quote of an otherwise citable candidate is not on its page, which held it unverified. */
  quoteProblem?: string;
}

/**
 * Cite-or-drop: the candidate is keyed to the page it was read from, and becomes active only when
 * the model quoted evidence there for both a usable date and a venue; anything less is held
 * unverified. A date or time that does not exist (February 30th, 24:00), or an end before the
 * start, makes the whole candidate uncitable, since the model misread something; only the unusable
 * value is left out of what is stored. An end is compared by date alone: a show that runs past
 * midnight can be given an end time earlier than its start on the same date. A recurring event's date is its schedule phrase, which it
 * carries instead of a start and end. A venue the page did not name stays absent rather than borrowing the source's.
 * The event's own page, when the model named one of the page's links by number, rides along
 * whatever the status, and so does the description; neither plays any part in verifying. Both
 * quotes must be on the page (#74): the model quotes the page as `readPage` gave it, so the job's
 * own link markers are stripped from every text field first, and a quote then counts only when it
 * occurs in the page's quotable text.
 */
export function candidateToSighting(candidate: Candidate, origin: CandidateOrigin, context: ExtractionContext): Sighting {
  const { timezone } = context.config;
  const primaryUrl = origin.pageUrl;
  const eventUrl = linkedPage(candidate.eventLink, origin.links, primaryUrl, context.config.discovery.platformHosts);
  const unmarked = (text: string | null) => nonEmpty(text === null ? null : withoutLinkMarkers(text, origin.links.length));
  const title = unmarked(candidate.title) ?? candidate.title.trim();
  const startAt = localIso(candidate.startDate, candidate.startTime, timezone);
  const endAt = localIso(candidate.endDate, candidate.endTime, timezone);
  const start = startAt.iso;
  const endsFirst = start !== undefined && endAt.iso !== undefined && endAt.iso.slice(0, 10) < start.slice(0, 10);
  const end = endsFirst ? undefined : endAt.iso;
  const dateProblem = startAt.problem ?? endAt.problem ?? (endsFirst ? `an end (${endAt.iso!.slice(0, 10)}) before its start` : undefined);
  const schedule = nonEmpty(candidate.schedule);
  const recurrence = deriveRecurrence({ start, end, schedule, sportsSeason: candidate.sportsSeason });
  const when = recurrence === "recurring" ? { schedule } : { start, end };
  const dateEvidence = unmarked(candidate.dateEvidence);
  const venueEvidence = unmarked(candidate.venueEvidence);
  const venue = unmarked(candidate.venue);
  const description = unmarked(candidate.description);
  const placement = toNeighborhood(candidate.neighborhood, context.neighborhoods);

  const cited =
    dateProblem === undefined &&
    citedDate({ recurrence, ...when }) !== undefined &&
    dateEvidence !== undefined &&
    venue !== undefined &&
    venueEvidence !== undefined;
  const quoteProblem = cited ? quoteNotOnPage({ date: dateEvidence, venue: venueEvidence }, origin.quotableText) : undefined;
  const verified = cited && quoteProblem === undefined;

  const event: Event = {
    id: newEventId(primaryUrl, title, context.nowIso, when.start),
    title,
    ...(description !== undefined ? { description } : {}),
    ...(when.start !== undefined ? { start: when.start } : {}),
    ...(when.end !== undefined ? { end: when.end } : {}),
    ...(when.schedule !== undefined ? { schedule: when.schedule } : {}),
    ...(venue !== undefined ? { venue } : {}),
    neighborhood: placement.neighborhood,
    primaryUrl,
    ...(eventUrl !== undefined ? { eventUrl } : {}),
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
  return {
    event,
    cancelled: candidate.notice === "cancelled",
    ...("unmappable" in placement ? { unmappable: placement.unmappable } : {}),
    ...(dateProblem !== undefined ? { dateProblem } : {}),
    ...(quoteProblem !== undefined ? { quoteProblem } : {}),
  };
}

/**
 * The text without the link markers `readPage` wrote: a bracketed number that is one of the page's
 * link numbers goes, with the space before it. A higher number (a page's own footnote) is page text.
 */
export function withoutLinkMarkers(text: string, linkCount: number): string {
  return text.replace(BRACKETED_NUMBER, (marker, n: string) => (Number(n) >= 1 && Number(n) <= linkCount ? "" : marker));
}

/**
 * The page's text as a quote from it is compared, worked out once per page: the link markers go, and
 * the rest is read as a person would compare two texts: runs of whitespace (a line break included)
 * are one space, case does not count, and curly quotes, dashes and an ellipsis match their plain
 * forms, which a model writes for them as often as not.
 */
export function quotableText(reading: PageReading): string {
  return comparable(withoutLinkMarkers(reading.text, reading.links.length));
}

/** The first of the quotes, date then venue, that is not in the page's quotable text, as a report phrase. */
function quoteNotOnPage(quotes: { date: string; venue: string }, quotable: string): string | undefined {
  const missing = (["date", "venue"] as const).find((field) => !quotable.includes(comparable(quotes[field])));
  return missing === undefined ? undefined : `quoted "${quotes[missing]}" for its ${missing}`;
}

/**
 * Two quotes the page check cannot tell apart (#82): one is on a page exactly when the other is, so a
 * re-reading may keep the stored one without it leaving the page it was just verified against.
 */
export function sameQuote(a: string, b: string): boolean {
  return comparable(a) === comparable(b);
}

function comparable(text: string): string {
  return text
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Link number n on the page, when there is one, it is not the primary page itself, and it stays on
 * the primary page's site or goes to a ticketing platform (#75). A link anywhere else is no event
 * page: the site would send its readers wherever a page the job found chose, so the event falls
 * back to its primary page instead.
 */
function linkedPage(n: number | null, links: string[], primaryUrl: string, platformHosts: readonly string[]): string | undefined {
  if (n === null || !Number.isInteger(n) || n < 1 || n > links.length) return undefined;
  const link = links[n - 1]!;
  if (samePage(link, primaryUrl) || !ownPageAllowed(link, primaryUrl, platformHosts)) return undefined;
  return link;
}

/** The URL in canonical form, or the fallback when it does not parse. */
export function normalizeUrl(url: string, fallback: string): string {
  try {
    return new URL(url).href;
  } catch {
    return fallback;
  }
}

/**
 * A local date and optional time from the model as an ISO string, or why it cannot be used. A date
 * must be a real calendar date (it survives a round trip through Date unchanged) and a time a real
 * clock time; a blank one counts as none given. A date with an unusable time keeps the date.
 */
function localIso(date: string | null, time: string | null, timezone: string): { iso?: string; problem?: string } {
  const day = nonEmpty(date);
  const clock = nonEmpty(time);
  if (day === undefined) return {};
  if (!realDate(day)) return { problem: `"${day}" is not a real date` };
  if (clock !== undefined && !LOCAL_TIME.test(clock)) return { iso: fromLocal(day, undefined, timezone), problem: `"${clock}" is not a real time` };
  return { iso: fromLocal(day, clock?.padStart(5, "0"), timezone) };
}

function realDate(date: string): boolean {
  if (!LOCAL_DATE.test(date)) return false;
  const parsed = new Date(date);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}

function nonEmpty(text: string | null): string | undefined {
  const trimmed = text?.trim();
  return trimmed ? trimmed : undefined;
}
