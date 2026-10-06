import { addDays, formatShort, isDateOnly, localDate } from "./dates";
import { firstDay, isDated, lastDay } from "./events";
import type { PublishedEvent } from "./types";

/** RFC 5545 TEXT escaping: backslash first, then semicolon, comma, and newline. */
function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n?|\n/g, "\\n");
}

const encoder = new TextEncoder();

/** RFC 5545 folding: lines of at most 75 octets, continuations begin with one space. TextEncoder, not Buffer, so this runs in the browser too. */
function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const b = encoder.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + b > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += b;
  }
  out.push(current);
  return out.map((l, i) => (i === 0 ? l : ` ${l}`)).join("\r\n");
}

function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function dateStamp(date: string): string {
  return date.replace(/-/g, "");
}

function vevent(e: PublishedEvent, siteName: string, stamp: string): string[] {
  const lines = [`UID:${e.id}@kc-events`, `DTSTAMP:${utcStamp(stamp)}`];
  const notes: string[] = [];
  const first = firstDay(e);
  const last = lastDay(e)!;

  if (first === undefined) {
    // A run read after it began: the one day we can stand behind is its last.
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(last)}`, `DTEND;VALUE=DATE:${dateStamp(addDays(last, 1))}`);
    notes.push("Last day.");
  } else if (isDateOnly(e.start!) || (e.end !== undefined && isDateOnly(e.end))) {
    // Any date-only side makes the whole event all-day; a date end is exclusive.
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(first)}`, `DTEND;VALUE=DATE:${dateStamp(addDays(last, 1))}`);
  } else {
    const end = e.end ?? new Date(new Date(e.start!).getTime() + 2 * 3_600_000).toISOString();
    lines.push(`DTSTART:${utcStamp(e.start!)}`, `DTEND:${utcStamp(end)}`);
  }

  lines.push(`SUMMARY:${escapeText(e.title)}`, `LOCATION:${escapeText(`${e.venue}, ${e.neighborhood}`)}`, `URL:${e.primaryUrl}`);
  if (e.whyLine) notes.push(e.whyLine);
  notes.push(`Verified ${formatShort(localDate(e.lastVerified))} by ${siteName}; details at ${e.primaryUrl}.`);
  lines.push(`DESCRIPTION:${escapeText(notes.join("\n\n"))}`);
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"];
}

/** An RFC 5545 calendar of the dated events; recurring events are skipped (a schedule phrase is not an RRULE). */
export function toIcs(events: PublishedEvent[], opts: { siteName: string; stamp: string }): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${opts.siteName}//EN`, "CALSCALE:GREGORIAN"];
  for (const e of events) if (isDated(e)) lines.push(...vevent(e, opts.siteName, opts.stamp));
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
