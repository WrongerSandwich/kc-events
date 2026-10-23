// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { googleCalendarUrl, toIcs } from "../src/lib/ics";
import { event } from "./fixtures/event";

const opts = { siteName: "KC Events", stamp: "2026-10-05T11:30:00Z" };
const fixture = (name: string) => readFileSync(new URL(`./fixtures/ics/${name}.ics`, import.meta.url), "utf8");

describe("toIcs", () => {
  it("writes a timed single event in UTC with a two-hour placeholder end", () => {
    expect(toIcs([event({ dontMiss: true, whyLine: "Rare; see it." })], opts)).toBe(fixture("timed"));
  });

  it("links the event's own page when there is one, in URL and in the notes", () => {
    const unfolded = toIcs([event({ eventUrl: "https://www.therecordbar.com/shows/a-show" })], opts).replace(/\r\n[ \t]/g, "");
    expect(unfolded).toContain("URL:https://www.therecordbar.com/shows/a-show\r\n");
    expect(unfolded).toContain("details at https://www.therecordbar.com/shows/a-show.");
    expect(unfolded).not.toContain("https://www.therecordbar.com/shows\r\n");
  });

  it("locates an event in the catch-all region at its venue alone: the region's name is no place", () => {
    const ics = toIcs([event({ venue: "Powell Gardens", neighborhood: "Elsewhere in the metro", region: "Elsewhere in the metro" })], opts).replace(/\r\n[ \t]/g, "");
    expect(ics).toContain("LOCATION:Powell Gardens\r\n");
  });

  it("locates an event at its venue, not the room the page named (#91)", () => {
    const ics = toIcs([event({ venue: "Kauffman Center for the Performing Arts", room: "Helzberg Hall", neighborhood: "Downtown" })], opts).replace(/\r\n[ \t]/g, "");
    expect(ics).toContain("LOCATION:Kauffman Center for the Performing Arts\\, Downtown\r\n");
  });

  it("locates an event at its venue's street address and position when its table row has them (#137)", () => {
    const e = {
      ...event({ venue: "Kauffman Center for the Performing Arts", room: "Helzberg Hall", neighborhood: "Downtown" }),
      addressLine: "1601 Broadway Blvd, Kansas City, MO 64108",
      geo: { lat: 39.0937, lng: -94.5857 },
    };
    const ics = toIcs([e], opts).replace(/\r\n[ \t]/g, "");
    expect(ics).toContain("LOCATION:Kauffman Center for the Performing Arts\\, 1601 Broadway Blvd\\, Kansas City\\, MO 64108\r\n");
    expect(ics).toContain("GEO:39.0937;-94.5857\r\n");
  });

  it("writes no GEO for a venue without a position", () => {
    const ics = toIcs([event()], opts);
    expect(ics).toContain("LOCATION:recordBar\\, Crossroads\r\n");
    expect(ics).not.toContain("GEO:");
  });

  it("writes a date-only event as all-day with an exclusive end", () => {
    expect(toIcs([event({ start: "2026-10-09" })], opts)).toBe(fixture("all-day"));
  });

  it("writes a timed one-off whose end is a later date as all-day through it, its start time in the notes (#90, #190)", () => {
    expect(toIcs([event({ start: "2026-10-09T20:30:00-05:00", end: "2026-10-10" })], opts)).toBe(fixture("timed-through"));
  });

  it("writes a run with a timed start and a date end as all-day, since two hours of a month-long run says nothing", () => {
    const unfolded = toIcs([event({ recurrence: "limited-run", start: "2026-10-02T18:00:00-05:00", end: "2026-10-31" })], opts).replace(/\r\n[ \t]/g, "");
    expect(unfolded).toContain("DTSTART;VALUE=DATE:20261002\r\nDTEND;VALUE=DATE:20261101\r\n");
  });

  it("writes a start-less run as its last day", () => {
    expect(toIcs([event({ recurrence: "limited-run", start: undefined, end: "2026-10-31" })], opts)).toBe(fixture("last-day"));
  });

  it("escapes a lone carriage return as a newline", () => {
    const out = toIcs([event({ title: "One\rTwo\r\nThree\nFour" })], opts);
    expect(out).toContain("SUMMARY:One\\nTwo\\nThree\\nFour\r\n");
  });

  it("puts Last day. before the why-line in a start-less run", () => {
    const out = toIcs([event({ recurrence: "limited-run", start: undefined, end: "2026-10-31", whyLine: "Rare; see it." })], opts);
    expect(out).toContain("DESCRIPTION:Last day.\\n\\nRare\\; see it.\\n\\nVerified");
  });

  it("skips recurring events and writes nothing but the wrapper for none", () => {
    expect(toIcs([event({ recurrence: "recurring", start: undefined, schedule: "Tuesdays" })], opts)).toBe(fixture("empty"));
  });

  it("escapes and folds text", () => {
    const out = toIcs([event({ title: "Comma, semicolon; backslash\\ and a line\nbreak " + "x".repeat(80) })], opts);
    expect(out).toContain("SUMMARY:Comma\\, semicolon\\; backslash\\\\ and a line\\nbreak ");
    for (const line of out.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(out).toContain("\r\n xxx"); // a folded continuation
  });

  it("folds a multi-byte title at 75 octets without splitting a character, and unfolds intact", () => {
    const title = "Fête des ténèbres — 夜の音楽祭 🎷 ".repeat(6).trim();
    const out = toIcs([event({ title })], opts);
    const lines = out.split("\r\n");
    for (const line of lines) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(lines.some((l) => l.startsWith(" "))).toBe(true);
    const unfolded = out.replace(/\r\n /g, "");
    expect(unfolded).toContain(`SUMMARY:${title}`);
    expect(unfolded).not.toContain("\uFFFD");
  });

  it("writes a timed start with a timed end as both instants in UTC", () => {
    const out = toIcs([event({ start: "2026-10-09T19:00:00-05:00", end: "2026-10-09T22:30:00-05:00" })], opts);
    expect(out).toContain("DTSTART:20261010T000000Z");
    expect(out).toContain("DTEND:20261010T033000Z");
  });

  it("writes a date-only start with a timed end as all-day, ending after the end's local day", () => {
    const out = toIcs([event({ start: "2026-10-09", end: "2026-10-11T15:00:00-05:00" })], opts);
    expect(out).toContain("DTSTART;VALUE=DATE:20261009");
    expect(out).toContain("DTEND;VALUE=DATE:20261012");
  });

  it("converts the winter offset too", () => {
    expect(toIcs([event({ start: "2026-11-20T19:00:00-06:00" })], opts)).toContain("DTSTART:20261121T010000Z");
  });

  it("names the calendar only when asked, after METHOD:PUBLISH, as RFC 7986's NAME and the older X-WR-CALNAME (#190)", () => {
    expect(toIcs([event()], { ...opts, calendarName: "KC Events, weekly" })).toContain("METHOD:PUBLISH\r\nNAME:KC Events\\, weekly\r\nX-WR-CALNAME:KC Events\\, weekly\r\nBEGIN:VEVENT");
    expect(toIcs([event()], opts)).not.toContain("X-WR-CALNAME");
    expect(toIcs([event()], opts)).not.toMatch(/\r\nNAME:/);
  });

  it("describes the calendar only when asked, as DESCRIPTION and X-WR-CALDESC, before the events (#190)", () => {
    const ics = toIcs([event()], { ...opts, calendarName: "KC Events", description: "A list; weekly." });
    expect(ics).toContain("X-WR-CALNAME:KC Events\r\nDESCRIPTION:A list\\; weekly.\r\nX-WR-CALDESC:A list\\; weekly.\r\nBEGIN:VEVENT");
    expect(toIcs([event()], opts)).not.toContain("X-WR-CALDESC");
  });
});

describe("toIcs, what each event says about itself (#190)", () => {
  const unfold = (s: string) => s.replace(/\r\n[ \t]/g, "");
  const vevent = (e: Parameters<typeof toIcs>[0][number]) => unfold(toIcs([e], opts)).split("BEGIN:VEVENT")[1]!;

  it("carries its kind as a category, in the kind's own words", () => {
    expect(vevent(event({ kind: "music" }))).toContain("\r\nCATEGORIES:Music\r\n");
    expect(vevent(event({ kind: "theater/dance" }))).toContain("\r\nCATEGORIES:Theater and dance\r\n");
    expect(vevent(event({ kind: "other" }))).toContain("\r\nCATEGORIES:Other events\r\n");
  });

  it("is last modified when it was last verified, in UTC", () => {
    expect(vevent(event({ lastVerified: "2026-10-03T21:47:36-05:00" }))).toContain("\r\nLAST-MODIFIED:20261004T024736Z\r\n");
  });

  it("is free time, not busy, when it is all-day; a timed event leaves TRANSP to its default", () => {
    expect(vevent(event({ recurrence: "limited-run", start: "2026-10-01", end: "2026-11-15" }))).toContain("\r\nTRANSP:TRANSPARENT\r\n");
    expect(vevent(event({ recurrence: "limited-run", start: undefined, end: "2026-10-31" }))).toContain("\r\nTRANSP:TRANSPARENT\r\n");
    expect(vevent(event({ recurrence: "limited-run", start: "2026-10-01", end: "2026-11-15", days: [3, 4] }))).toContain("\r\nTRANSP:TRANSPARENT\r\n");
    expect(vevent(event({ start: "2026-10-09" }))).toContain("\r\nTRANSP:TRANSPARENT\r\n");
    expect(vevent(event())).not.toContain("TRANSP:");
  });

  it("says a two-hour end is a placeholder, and gives a stated end without the note", () => {
    expect(vevent(event())).toContain("DESCRIPTION:End time not listed\\; shown as two hours.\\n\\nVerified");
    expect(vevent(event({ end: "2026-10-09T22:30:00-05:00" }))).not.toContain("End time not listed");
    // A night past midnight ends when it says, on the next day.
    const late = vevent(event({ start: "2026-10-09T21:00:00-05:00", end: "2026-10-10T02:00:00-05:00" }));
    expect(late).toContain("DTSTART:20261010T020000Z\r\nDTEND:20261010T070000Z\r\n");
    expect(late).not.toContain("End time not listed");
  });

  it("says a one-off with a date and no time had no time listed; a run's dates need no such note", () => {
    expect(vevent(event({ start: "2026-10-09" }))).toContain("DESCRIPTION:No time listed on the venue's page\\; check before you go.\\n\\nVerified");
    expect(vevent(event({ recurrence: "limited-run", start: "2026-10-01", end: "2026-11-15" }))).not.toContain("No time listed");
  });

  it("writes a timed one-off that ends on a later day as all-day across its days, with its times in the notes", () => {
    // PBR Outlaw Days: Friday 7:45 pm to Sunday 1:45 pm, listed on the site under each of its three days.
    const pbr = vevent(event({ start: "2026-10-23T19:45:00-05:00", end: "2026-10-25T13:45:00-05:00" }));
    expect(pbr).toContain("DTSTART;VALUE=DATE:20261023\r\nDTEND;VALUE=DATE:20261026\r\n");
    expect(pbr).toContain("TRANSP:TRANSPARENT\r\n");
    expect(pbr).toContain("DESCRIPTION:Starts Fri Oct 23 at 7:45 pm\\; ends Sun Oct 25 at 1:45 pm.\\n\\nVerified");
    expect(pbr).not.toContain("End time not listed");
    // A date end says the last day and no hour.
    const stand = vevent(event({ start: "2026-10-09T20:30:00-05:00", end: "2026-10-10" }));
    expect(stand).toContain("DTSTART;VALUE=DATE:20261009\r\nDTEND;VALUE=DATE:20261011\r\n");
    expect(stand).toContain("DESCRIPTION:Starts Fri Oct 9 at 8:30 pm\\; through Sat Oct 10.\\n\\nVerified");
  });

  it("puts the time notes before the why-line", () => {
    expect(vevent(event({ whyLine: "Rare; see it." }))).toContain("DESCRIPTION:End time not listed\\; shown as two hours.\\n\\nRare\\; see it.\\n\\nVerified");
  });
});

describe("googleCalendarUrl (#188)", () => {
  const params = (url: string) => {
    const u = new URL(url);
    expect(`${u.origin}${u.pathname}`).toBe("https://calendar.google.com/calendar/render");
    return u.searchParams;
  };

  it("fills Google Calendar's event template with the same times as the event's calendar file", () => {
    const p = params(googleCalendarUrl(event({ whyLine: "Rare; see it." }), "KC Events"));
    expect(p.get("action")).toBe("TEMPLATE");
    expect(p.get("text")).toBe("A show");
    // 7 pm Central is midnight UTC, and the two-hour placeholder, as the .ics has them.
    expect(p.get("dates")).toBe("20261010T000000Z/20261010T020000Z");
    expect(p.get("location")).toBe("recordBar, Crossroads");
    expect(p.get("details")).toContain("End time not listed; shown as two hours.");
    expect(p.get("details")).toContain("Rare; see it.");
    expect(p.get("details")).toContain("details at https://www.therecordbar.com/shows.");
    expect(p.has("recur")).toBe(false);
  });

  it("gives a dated event all-day dates with the exclusive end, and its venue's address when the table has it", () => {
    const e = { ...event({ start: "2026-10-09", end: "2026-10-11", recurrence: "limited-run" }), addressLine: "1601 Broadway Blvd, Kansas City, MO 64108" };
    const p = params(googleCalendarUrl(e, "KC Events"));
    expect(p.get("dates")).toBe("20261009/20261012");
    expect(p.get("location")).toBe("recordBar, 1601 Broadway Blvd, Kansas City, MO 64108");
  });

  it("repeats a run with days weekly on them, as the file's RRULE", () => {
    const p = params(googleCalendarUrl(event({ recurrence: "limited-run", start: "2026-10-01", end: "2026-11-15", days: [3, 4] }), "KC Events"));
    expect(p.get("dates")).toBe("20261001/20261002");
    expect(p.get("recur")).toBe("RRULE:FREQ=WEEKLY;BYDAY=WE,TH;UNTIL=20261115");
  });
});
