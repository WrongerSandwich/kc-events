/**
 * An event's own page read (#123, #133; ADR 0009 amended): for a registry source flagged
 * `readEventPages`, an event its list dates but does not time, and every pick, has its own page read
 * for the time, the price, the age limit, and a description. The list stays the primary page; the own
 * page's quotes are kept beside the date and venue quotes.
 */
import { z } from "zod";
import type { RunConfig } from "./config.js";
import { MAX_AGES, MAX_PRICE, type Event } from "./dataset.js";
import { comparable, EXTRACTION_TIMEOUT_MS, localIso, MAX_QUOTE, quotableText, quotedOn, withoutLinkMarkers, type PageReading } from "./extraction.js";
import { calendarDate } from "./identity.js";
import { strictResponseFormat, thisRunLines } from "./model-request.js";
import type { CompletionRequest, FetchResult } from "./ports.js";

/** The longest description an own page's reading may give: as long as a list's may be. */
export const MAX_OWN_PAGE_DESCRIPTION = 300;
/**
 * A stored description at most this long is a list's line ("X performs with Y."), so an own page's
 * longer one replaces it (#133); a longer stored one stands.
 */
export const LISTING_LINE_LENGTH = 100;

/**
 * What the model returns for one event's own page: its date and start time there, its price and age
 * limit as the page states them, each with the words they come from, and a description.
 */
export const ownPageReplySchema = z.object({
  date: z.string().nullable().describe("The date this page gives for the event, YYYY-MM-DD. Null when it gives none."),
  time: z.string().nullable().describe("The event's start time on that date, HH:MM 24-hour local. Null when the page gives none."),
  timeEvidence: z.string().nullable().describe("The exact text from the page body the date and time were read from. Null when there is no time."),
  price: z.string().nullable().describe('The price as the page states it: "Free", "$25", "$25–$45". Null when the page gives none.'),
  priceEvidence: z.string().nullable().describe("The exact text from the page body the price was read from. Null when there is no price."),
  ages: z.string().nullable().describe('The age limit as the page states it: "21+", "All ages". Null when the page gives none.'),
  agesEvidence: z.string().nullable().describe("The exact text from the page body the age limit was read from. Null when there is none."),
  description: z
    .string()
    .nullable()
    .describe("One or two plain sentences on what the event is, from the page's own text only. Null when the page says nothing about it beyond its title."),
});

const ownPageResponseFormat = strictResponseFormat("event_page_details", ownPageReplySchema);

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
    // As long as a list page gets: a call past it costs only what the one page would give.
    timeoutMs: EXTRACTION_TIMEOUT_MS,
  };
}

/** A value read from an own page, with the words on it the value comes from. */
export interface Quoted {
  value: string;
  quote: string;
}

/**
 * What an own page's reading gives the event: another date than the list's, which a person should
 * look at and from which nothing is taken; a reply that could not be read; or what it gives on the
 * list's date (or giving no date), each field only when it holds, with a line for each one left out
 * that is worth one. A time comes only on the list's date, with a quote on the page that gives that
 * time; a price or an age limit only with a quote on the page that states it (ADR 0002). One that
 * fails that, a time that does not exist, or a value past its cap, is left out. A description, written
 * as the list's is, carries no quote.
 */
export type OwnPageReading =
  | { kind: "disagrees"; date: string }
  | { kind: "unreadable" }
  | { kind: "read"; start?: Quoted; price?: Quoted; ages?: Quoted; description?: string; problems: string[] };

export function readOwnPageReply(value: unknown, event: Event, reading: PageReading, timezone: string): OwnPageReading {
  const parsed = ownPageReplySchema.safeParse(value);
  if (!parsed.success) return { kind: "unreadable" };
  const reply = parsed.data;
  const day = reply.date?.trim();
  if (day && day !== calendarDate(event.start)) return { kind: "disagrees", date: day };
  const quotable = quotableText(reading);
  const unmarked = (text: string | null) => (text === null ? "" : withoutLinkMarkers(text, reading.links.length).trim());
  const problems: string[] = [];

  const time = day ? ownPageTime(reply.time, unmarked(reply.timeEvidence), day, quotable, timezone) : {};
  if (time.problem !== undefined) problems.push(`${time.problem}; no time taken`);
  const stated = (field: "price" | "ages", cap: number, noun: string): Quoted | undefined => {
    const value = unmarked(reply[field]);
    const quote = unmarked(reply[`${field}Evidence`]);
    if (!value || !quote) return undefined;
    const problem =
      value.length > cap
        ? `its ${noun} ran past the ${cap}-character cap`
        : quote.length > MAX_QUOTE
          ? `its ${noun} quote ran past the ${MAX_QUOTE}-character cap`
          : !quotedOn(quote, quotable)
            ? `quoted "${quote}" for its ${noun}, which is not on the page`
            : !statesValue(quote, value)
              ? `quoted "${quote}" for its ${noun}, which does not give "${value}"`
              : undefined;
    if (problem === undefined) return { value, quote };
    problems.push(`${problem}; no ${noun} taken`);
    return undefined;
  };
  const price = stated("price", MAX_PRICE, "price");
  const ages = stated("ages", MAX_AGES, "age limit");
  const description = unmarked(reply.description);
  const describes = description !== "" && description.length <= MAX_OWN_PAGE_DESCRIPTION;
  if (description.length > MAX_OWN_PAGE_DESCRIPTION) problems.push(`its description ran past the ${MAX_OWN_PAGE_DESCRIPTION}-character cap; no description taken`);
  return {
    kind: "read",
    ...(time.start !== undefined ? { start: time.start } : {}),
    ...(price !== undefined ? { price } : {}),
    ...(ages !== undefined ? { ages } : {}),
    ...(describes ? { description } : {}),
    problems,
  };
}

/** The start an own page's time and quote give on the list's date, or why they give none when that is worth a line. */
function ownPageTime(time: string | null, quote: string, day: string, quotable: string, timezone: string): { start?: Quoted; problem?: string } {
  if (!time?.trim() || !quote) return {};
  const at = localIso(day, time, timezone);
  if (at.problem !== undefined || at.iso === undefined) return { problem: at.problem ?? `"${time}" is not a real time` };
  if (quote.length > MAX_QUOTE) return { problem: `its time quote ran past the ${MAX_QUOTE}-character cap` };
  if (!quotedOn(quote, quotable)) return { problem: `quoted "${quote}" for its time, which is not on the page` };
  if (!givesTime(quote, at.iso.slice(11, 16))) return { problem: `quoted "${quote}" for its time, which does not give ${time.trim()}` };
  return { start: { value: at.iso, quote } };
}

/**
 * Whether a quote states a value as the page wrote it: the value is in the quote, compared as a quote
 * is with its page and with no whitespace counted, so "$25 – $45" is in "Tickets $25-$45".
 */
export function statesValue(quote: string, value: string): boolean {
  const bare = (text: string) => comparable(text).replace(/\s/g, "");
  return bare(quote).includes(bare(value));
}

/**
 * Whether a quote gives a clock time (HH:MM, 24-hour) as a page would write it: the hour on a
 * 12-hour clock with the right am or pm, its minutes left off only on the hour ("7:00 pm", "7pm",
 * "7 p.m." for 19:00), or with its minutes after a colon or point and no am or pm ("19:00", "7.00").
 * A bare number is not taken for an hour, so a quote of the date alone ("October 12") does not cite
 * noon, and "7 pm" does not cite 07:00.
 */
export function givesTime(quote: string, time: string): boolean {
  const [hour, minutes] = [Number(time.slice(0, 2)), time.slice(3, 5)];
  const h12 = String(hour % 12 || 12);
  const minute = `[:.]${minutes}(?!\\d)`;
  const meridiem = `\\s?[ap]\\.?\\s?m\\b`;
  const marked = `${h12}(?:${minute})${minutes === "00" ? "?" : ""}\\s?${hour < 12 ? "a" : "p"}\\.?\\s?m\\b`;
  const clock = `(?:${[...new Set([h12, String(hour), String(hour).padStart(2, "0")])].join("|")})${minute}(?!${meridiem})`;
  return new RegExp(`(?<![\\d:.])(?:${marked}|${clock})`, "i").test(quote);
}
