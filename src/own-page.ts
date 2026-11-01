/**
 * An event's own page read (#123, #133, #254; ADR 0009 amended): every upcoming event with an own page
 * has it read once, before curation, for the time, the price, the age limit, and a description. The list stays the primary page; the own
 * page's quotes are kept beside the date and venue quotes.
 */
import { z } from "zod";
import type { RunConfig } from "./config.js";
import { MAX_AGES, MAX_PRICE, WEEKDAYS, type Event, type Weekday } from "./dataset.js";
import { comparable, EXTRACTION_TIMEOUT_MS, localIso, MAX_DESCRIPTION, MAX_QUOTE, quotableText, quotedOn, withoutLinkMarkers, type PageReading } from "./extraction.js";
import { calendarDate } from "./identity.js";
import { strictResponseFormat, thisRunLines } from "./model-request.js";
import type { CompletionRequest, FetchResult } from "./ports.js";
import { givesDays, orderedDays } from "./weekdays.js";

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
  days: z
    .array(z.enum(WEEKDAYS))
    .nullable()
    .describe("The weekdays a run of several weeks plays, when the page states them or lists its performances. Null when it gives only the span."),
  daysEvidence: z.string().nullable().describe("The exact text from the page body the weekdays were read from. Null when there are no days."),
  daysLink: z
    .number()
    .int()
    .nullable()
    .describe("When the page gives no weekdays: the number of a link on it to a page listing the run's performances with their dates. Null otherwise."),
  description: z
    .string()
    .nullable()
    .describe("One or two plain sentences on what the event is, from the page's own text only. Null when the page says nothing about it beyond its title."),
});

const ownPageResponseFormat = strictResponseFormat("event_page_details", ownPageReplySchema);

/**
 * One call over one event's own page: the event page rules, this run's dates, and the event the
 * page is for, by title, venue and the date its list gave. A "ticket" call is over the ticket page
 * a run's own page links (#143), read for its days alone.
 */
export function buildOwnPageRequest(
  event: Event,
  page: FetchResult,
  reading: PageReading,
  rules: string,
  config: RunConfig,
  today: string,
  kind: "own" | "ticket" = "own",
): CompletionRequest {
  const system = [
    rules,
    "",
    ...thisRunLines(config, today),
    `- Event: ${event.title}`,
    ...(event.venue !== undefined ? [`- Venue: ${event.venue}`] : []),
    `- The calendar's date: ${calendarDate(event.start)}`,
    ...(event.end !== undefined ? [`- The calendar's last day: ${calendarDate(event.end)}`] : []),
    ...(kind === "ticket" ? [`- This page: the run's ticket page, linked from its own page, read for the weekdays it plays (days); leave the other fields null.`] : []),
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
export interface Quoted<T = string> {
  value: T;
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
  | { kind: "read"; start?: Quoted; price?: Quoted; ages?: Quoted; days?: Quoted<Weekday[]>; ticketPage?: string; description?: string; problems: string[] };

export function readOwnPageReply(value: unknown, event: Event, reading: PageReading, timezone: string): OwnPageReading {
  const parsed = ownPageReplySchema.safeParse(value);
  if (!parsed.success) return { kind: "unreadable" };
  const reply = parsed.data;
  const day = reply.date?.trim();
  if (day && day !== calendarDate(event.start)) return { kind: "disagrees", date: day };
  const quotable = quotableText(reading);
  const unmarked = unmarkedIn(reading);
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
  const days = event.recurrence === "limited-run" ? statedDays(reply, quotable, unmarked, problems) : undefined;
  const ticketPage = event.recurrence === "limited-run" && days === undefined ? linkedPage(reply.daysLink, reading, problems) : undefined;
  const description = unmarked(reply.description);
  const describes = description !== "" && description.length <= MAX_DESCRIPTION;
  if (description.length > MAX_DESCRIPTION) problems.push(`its description ran past the ${MAX_DESCRIPTION}-character cap; no description taken`);
  return {
    kind: "read",
    ...(time.start !== undefined ? { start: time.start } : {}),
    ...(price !== undefined ? { price } : {}),
    ...(ages !== undefined ? { ages } : {}),
    ...(days !== undefined ? { days } : {}),
    ...(ticketPage !== undefined ? { ticketPage } : {}),
    ...(describes ? { description } : {}),
    problems,
  };
}

/**
 * What a run's ticket page, followed from its own page (#143), gives: its days with their quote, or nothing, with a
 * line for each problem worth one. Its date, time, price and the rest are the own page's to give, so they are not read.
 */
export function readTicketPageReply(value: unknown, reading: PageReading): { kind: "unreadable" } | { kind: "read"; days?: Quoted<Weekday[]>; problems: string[] } {
  const parsed = ownPageReplySchema.safeParse(value);
  if (!parsed.success) return { kind: "unreadable" };
  const problems: string[] = [];
  const unmarked = unmarkedIn(reading);
  const days = statedDays(parsed.data, quotableText(reading), unmarked, problems);
  return { kind: "read", ...(days !== undefined ? { days } : {}), problems };
}

/**
 * The weekdays a reply gives a run, in week order and each once, with a quote on the page that names each of them
 * (givesDays); none when it gives none, or every day of the week, which is what a run without days already means, or
 * when the quote fails, with a line saying why.
 */
function statedDays(
  reply: z.infer<typeof ownPageReplySchema>,
  quotable: string,
  unmarked: (text: string | null) => string,
  problems: string[],
): Quoted<Weekday[]> | undefined {
  const quote = unmarked(reply.daysEvidence);
  if (reply.days === null || reply.days.length === 0 || !quote) return undefined;
  const days = orderedDays(reply.days);
  const problem =
    days.length === WEEKDAYS.length
      ? "named every day of the week"
      : quote.length > MAX_QUOTE
        ? `its days quote ran past the ${MAX_QUOTE}-character cap`
        : !quotedOn(quote, quotable)
          ? `quoted "${quote}" for its days, which is not on the page`
          : !givesDays(quote, days)
            ? `quoted "${quote}" for its days, which does not give ${days.join(", ")}`
            : undefined;
  if (problem === undefined) return { value: days, quote };
  problems.push(`${problem}; no days taken`);
  return undefined;
}

/** The page a reply's link number names, or none, with a line when the page has no such link. */
function linkedPage(link: number | null, reading: PageReading, problems: string[]): string | undefined {
  if (link === null) return undefined;
  const url = reading.links[link - 1];
  if (url === undefined) problems.push(`named link ${link} for its performances, which the page does not have; not followed`);
  return url;
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

/** A reply's text with the page's link markers taken out and trimmed; "" for none. */
function unmarkedIn(reading: PageReading): (text: string | null) => string {
  return (text) => (text === null ? "" : withoutLinkMarkers(text, reading.links.length).trim());
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
