/**
 * Calendar helpers over the dataset's two date forms: a local date (YYYY-MM-DD) or a local
 * date-time with offset. Arithmetic runs on YYYY-MM-DD through Date.UTC so a DST change can
 * never shift a day. Nothing here reads the clock; callers pass `today` or `now`.
 */

const DAY_MS = 86_400_000;
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The local date of either dataset form; the job writes local wall time, so the first ten characters are it. */
export function localDate(iso: string): string {
  return iso.slice(0, 10);
}

export function isDateOnly(iso: string): boolean {
  return iso.length === 10;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD that names a real calendar day (not "2026-02-30"); the one validator for the site's date inputs. */
export function isValidDate(s: string): boolean {
  if (!DATE.test(s)) return false;
  const [y, m, d] = parts(s);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y!, m!, d!];
}

function utc(date: string): number {
  const [y, m, d] = parts(date);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return fromUtc(utc(date) + n * DAY_MS);
}

/** 9 for "2026-10-09". */
export function dayOfMonth(date: string): number {
  return parts(date)[2];
}

/** 0 is Sunday, as in Date. */
export function weekday(date: string): number {
  return new Date(utc(date)).getUTCDay();
}

/** The Sunday on or after the date. */
export function comingSunday(today: string): string {
  return addDays(today, (7 - weekday(today)) % 7);
}

/** The calendar date of an instant in the zone. */
export function todayIn(timeZone: string, now: Date): string {
  return localDate(nowIn(timeZone, now));
}

/**
 * The wall clock of an instant in the zone, "2026-10-09T19:30": the same form as the first sixteen characters of a
 * dataset date-time, so the two compare as strings.
 */
export function nowIn(timeZone: string, now: Date): string {
  const found = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => found.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

/** "Oct 9": headings, stamps, and calendar descriptions that need no weekday. */
export function formatShort(date: string): string {
  const [, m, d] = parts(date);
  return `${SHORT_MONTHS[m - 1]} ${d}`;
}

/** "Fri Oct 9" */
export function formatDay(date: string): string {
  return `${SHORT_DAYS[weekday(date)]} ${formatShort(date)}`;
}

/** "Friday, October 9" */
export function formatLong(date: string): string {
  const [, m, d] = parts(date);
  return `${LONG_DAYS[weekday(date)]}, ${LONG_MONTHS[m - 1]} ${d}`;
}

/** "Oct 5–11", or "Oct 29–Nov 2" across a month, or "Dec 29, 2026–Jan 3, 2027" across a year. */
export function formatRange(from: string, to: string): string {
  const [fy, fm, fd] = parts(from);
  const [ty, tm, td] = parts(to);
  if (fy !== ty) return `${formatShort(from)}, ${fy}–${formatShort(to)}, ${ty}`;
  return fm === tm ? `${SHORT_MONTHS[fm - 1]} ${fd}–${td}` : `${SHORT_MONTHS[fm - 1]} ${fd}–${SHORT_MONTHS[tm - 1]} ${td}`;
}

/** "7:00 pm" from the local wall time in a date-time; the offset is ignored because the time is already local. */
export function formatTime(iso: string): string {
  if (isDateOnly(iso)) throw new Error(`formatTime needs a date-time, got the date-only ${iso}; check isDateOnly first`);
  const h = Number(iso.slice(11, 13));
  const mm = iso.slice(14, 16);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${suffix}`;
}
