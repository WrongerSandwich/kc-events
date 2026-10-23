/**
 * A span of dates a date quote gives in words ("Nov 28th – Dec 20th", "Oct. 7-28", "October 2, 2026 –
 * February 5, 2027"), read back so a run the model gave a schedule is held to the dates its own quote
 * states (#218). Month first only, and only one span to a quote: anything else is left as the model read it.
 */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
const DAY = String.raw`(\d{1,2})(?:st|nd|rd|th)?\b`;
const YEAR = String.raw`(?:,?\s*(\d{4})\b)?`;
/** A weekday written beside the closing date ("– Fri , February 5"), which is that date's. */
const WEEKDAY = String.raw`(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s*,?\s*)?`;
const JOIN = String.raw`\s*(?:[-–—]|to|through|thru|until)\s*`;
/** A closing day number that is no clock time: "Oct 7 – 8 p.m." is a time, not the 8th. */
const NOT_A_TIME = String.raw`(?!\s*(?:[ap]\.?m\b|:\d))`;
const SPAN = new RegExp(String.raw`\b${MONTH}\s+${DAY}${YEAR}${JOIN}${WEEKDAY}(?:${MONTH}\s+)?${DAY}${NOT_A_TIME}${YEAR}`, "gi");

export interface QuotedSpan {
  /** `YYYY-MM-DD`. */
  start: string;
  /** `YYYY-MM-DD`. */
  end: string;
}

/**
 * The one month-day span a quote gives, as dates, or none. A year the quote leaves out is the one that
 * puts the span's end on or after today and its start no more than nine months ahead (a run already
 * underway, or the next one), so a past season is not moved to next year; a span that crosses New Year
 * ends in the year after it starts. Two spans, a date that does not exist, or an end before the start
 * ("Dec 28 – 3") give none.
 */
export function quotedSpan(quote: string, today: string): QuotedSpan | undefined {
  const matches = [...quote.matchAll(SPAN)];
  if (matches.length !== 1) return undefined;
  const [, startMonthName, startDayText, startYearText, endMonthName, endDayText, endYearText] = matches[0]!;
  const startMonth = monthNumber(startMonthName!);
  const endMonth = endMonthName === undefined ? startMonth : monthNumber(endMonthName);
  const [startDay, endDay] = [Number(startDayText), Number(endDayText)];
  const crossesYear = endMonthName !== undefined && endMonth * 100 + endDay < startMonth * 100 + startDay;
  const spanFrom = (startYear: number, endYear = startYear + (crossesYear ? 1 : 0)): QuotedSpan | undefined => {
    const start = isoDate(startYear, startMonth, startDay);
    const end = isoDate(endYear, endMonth, endDay);
    return start !== undefined && end !== undefined && end >= start ? { start, end } : undefined;
  };
  if (startYearText !== undefined) return spanFrom(Number(startYearText), endYearText === undefined ? undefined : Number(endYearText));
  if (endYearText !== undefined) return spanFrom(Number(endYearText) - (crossesYear ? 1 : 0), Number(endYearText));
  const thisYear = Number(today.slice(0, 4));
  const latestStart = monthsAhead(today, 9);
  return [thisYear - 1, thisYear, thisYear + 1]
    .map((year) => spanFrom(year))
    .find((span) => span !== undefined && span.end >= today && span.start <= latestStart);
}

/** The `YYYY-MM-DD` date some months after another. */
function monthsAhead(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1 + months, day)).toISOString().slice(0, 10);
}

function monthNumber(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
}

/** The date as `YYYY-MM-DD`, or none when it does not exist (Nov 31). */
function isoDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : undefined;
}
