/**
 * The own-page time (#123, ADR 0009 amended): for a registry source flagged `readEventPages`, an event
 * its list dates but does not time has its own page read for the time, and only the time. The list
 * stays the primary page; the own page's quote is kept beside the date and venue quotes.
 */
import { z } from "zod";
import type { RunConfig } from "./config.js";
import type { Event } from "./dataset.js";
import { localIso, quotedOn, withoutLinkMarkers, type PageReading } from "./extraction.js";
import { calendarDate } from "./identity.js";
import { strictResponseFormat, thisRunLines } from "./model-request.js";
import type { CompletionRequest, FetchResult } from "./ports.js";

/** What the model returns for one event's own page: its date and start time there, and the words they come from. */
export const ownPageReplySchema = z.object({
  date: z.string().nullable().describe("The date this page gives for the event, YYYY-MM-DD. Null when it gives none."),
  time: z.string().nullable().describe("The event's start time on that date, HH:MM 24-hour local. Null when the page gives none."),
  timeEvidence: z.string().nullable().describe("The exact text from the page body the date and time were read from. Null when there is no time."),
});

/** Two minutes, as for a list page: a call past it costs only the one event's time. */
const OWN_PAGE_TIMEOUT_MS = 120_000;

const ownPageResponseFormat = strictResponseFormat("event_page_time", ownPageReplySchema);

/** The longest time quote kept, as for a date quote (cappedCandidateSchema). */
const MAX_TIME_QUOTE = 500;

/**
 * One call over one event's own page: the event page rules, this run's dates, and the event the
 * page is for, by title, venue and the date its list gave.
 */
export function buildOwnPageRequest(event: Event, page: FetchResult, reading: PageReading, rules: string, config: RunConfig, today: string): CompletionRequest {
  const system = [
    rules,
    "",
    ...thisRunLines(config, today),
    `- Event: ${event.title}`,
    ...(event.venue !== undefined ? [`- Venue: ${event.venue}`] : []),
    `- The calendar's date: ${calendarDate(event.start)}`,
  ].join("\n");
  return {
    model: config.models.extraction,
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Page URL: ${page.finalUrl}\n\n${reading.text}` },
    ],
    responseFormat: ownPageResponseFormat,
    timeoutMs: OWN_PAGE_TIMEOUT_MS,
  };
}

/**
 * What an own page's reading gives the event: a start with a time on the list's date and the quote
 * for it; another date than the list's, which a person should look at; a reply that could not be
 * read; or nothing usable, with why when it is worth a line. A time comes only with a quote that is
 * on the page (ADR 0002); one that is not, or a time that does not exist, means no time.
 */
export type OwnPageTime =
  | { kind: "timed"; start: string; quote: string }
  | { kind: "disagrees"; date: string }
  | { kind: "unreadable" }
  | { kind: "untimed"; problem?: string };

export function ownPageTime(value: unknown, event: Event, reading: PageReading, quotable: string, timezone: string): OwnPageTime {
  const parsed = ownPageReplySchema.safeParse(value);
  if (!parsed.success) return { kind: "unreadable" };
  const { date, time, timeEvidence } = parsed.data;
  const listDate = calendarDate(event.start);
  const day = date?.trim();
  if (!day) return { kind: "untimed" };
  if (day !== listDate) return { kind: "disagrees", date: day };
  const quote = timeEvidence === null ? undefined : withoutLinkMarkers(timeEvidence, reading.links.length).trim();
  if (!time?.trim() || !quote) return { kind: "untimed" };
  const at = localIso(day, time, timezone);
  if (at.problem !== undefined || at.iso === undefined) return { kind: "untimed", problem: at.problem ?? `"${time}" is not a real time` };
  if (quote.length > MAX_TIME_QUOTE) return { kind: "untimed", problem: `its time quote ran past the ${MAX_TIME_QUOTE}-character cap` };
  if (!quotedOn(quote, quotable)) return { kind: "untimed", problem: `quoted "${quote}" for its time, which is not on the page` };
  return { kind: "timed", start: at.iso, quote };
}
