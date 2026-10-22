import { describe, expect, it } from "vitest";
import { SHORTLIST_GROUP, groupResults, resultEvents, rowDateLine } from "../src/lib/group";
import { DEFAULT_FILTERS, EVERY_DATE, type Filters } from "../src/lib/query";
import { event } from "./fixtures/event";

const today = "2026-10-05";
// Every date unless a test says otherwise; the explorer's default is the week (#183).
const f = (over: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, when: EVERY_DATE, ...over });
const none = new Set<string>();

const fri7 = event({ id: "fri7", title: "Late show", start: "2026-10-09T19:00:00-05:00", venue: "recordBar" });
const fri5 = event({ id: "fri5", title: "Early show", start: "2026-10-09T17:00:00-05:00", venue: "Knuckleheads" });
const friAll = event({ id: "friAll", title: "Market", start: "2026-10-09", venue: "City Market" });
const tue = event({ id: "tue", title: "Talk", start: "2026-10-06T18:00:00-05:00", venue: "Library" });
const onNow = event({ id: "onNow", title: "Exhibition", recurrence: "limited-run", start: "2026-09-01", end: "2026-10-20", venue: "Nelson-Atkins" });
const onNowSooner = event({ id: "sooner", title: "Closing run", recurrence: "limited-run", start: undefined, end: "2026-10-11", venue: "Spencer" });
const opensLater = event({ id: "later", title: "Opens later", recurrence: "limited-run", start: "2026-10-20", end: "2026-11-14", venue: "Folly" });
const festLater = event({ id: "fest", title: "Festival", start: "2026-10-29", end: "2026-10-31", venue: "Park" });
const festNow = event({ id: "festNow", title: "Fair", start: "2026-10-03", end: "2026-10-07", venue: "Fairground" });
const trivia = event({ id: "trivia", title: "Pub trivia", recurrence: "recurring", start: undefined, schedule: "Tuesdays", kind: "food/drink", venue: "A bar" });
const all = [fri7, fri5, friAll, tue, onNow, onNowSooner, opensLater, trivia];
/** More runs open today, each closing in November. */
const exhibitions = (n: number) => Array.from({ length: n }, (_, i) => event({ id: `ex${i}`, title: `Exhibition ${i}`, recurrence: "limited-run", start: "2026-09-01", end: "2026-11-30", venue: "Kemper" }));

describe("groupResults", () => {
  it("puts underway spans first, then days ascending with all-day first, then always there when asked", () => {
    const groups = groupResults(all, f({ recurring: true }), today, none);
    expect(groups.map((g) => [g.key, g.heading, g.events.map((e) => e.id)])).toEqual([
      ["on-now", "On now", ["sooner", "onNow"]],
      ["2026-10-06", "Tue Oct 6", ["tue"]],
      ["2026-10-09", "Fri Oct 9", ["friAll", "fri5", "fri7"]],
      ["2026-10-20", "Tue Oct 20", ["later"]],
      ["always-there", "Always there", ["trivia"]],
    ]);
  });

  it("collapses On now past six rows under any when-filter, so the dated days lead, and keeps six or fewer open (#183)", () => {
    const collapsed = (list: typeof all, over: Partial<Filters>) => groupResults(list, f(over), today, none).map((g) => [g.key, g.collapsed]);
    const many = [...all, ...exhibitions(5)]; // seven on now
    const six = [...all, ...exhibitions(4)];
    expect(collapsed(many, {})).toEqual([["on-now", true], ["2026-10-06", false], ["2026-10-09", false], ["2026-10-20", false]]);
    expect(collapsed(many, { kinds: ["music"], recurring: true })[0]).toEqual(["on-now", true]);
    for (const when of [{ preset: "weekend" }, { preset: "7d" }, { preset: "fri-sun" }, { from: "2026-10-05", to: "2026-10-31" }] as const) {
      expect(collapsed(many, { when })[0]).toEqual(["on-now", true]);
      expect(collapsed(six, { when })[0]).toEqual(["on-now", false]);
    }
    expect(collapsed(six, {})[0]).toEqual(["on-now", false]);
  });

  it("keeps On now open in the saved view: a list the reader made is short, and a folded save looks lost (audit B1)", () => {
    const list = [...all, ...exhibitions(5)];
    const saved = new Set(["tue", ...list.filter((e) => e.recurrence === "limited-run").map((e) => e.id)]);
    expect(groupResults(list, f({ saved: true }), today, saved).map((g) => [g.key, g.collapsed])).toEqual([["on-now", false], ["2026-10-06", false], ["2026-10-20", false]]);
  });

  it("leaves On now open when no dated day follows it, so a filter never shows just a closed line", () => {
    expect(groupResults([onNow, onNowSooner, ...exhibitions(5), trivia], f({ recurring: true }), today, none).map((g) => [g.key, g.collapsed])).toEqual([
      ["on-now", false],
      ["always-there", false],
    ]);
  });

  it("lists a multi-day one-off under each day of its span from today, never under On now, which is for runs (#90)", () => {
    const groups = groupResults([festNow, festLater, onNow], f(), today, none);
    expect(groups.map((g) => [g.key, g.events.map((e) => e.id)])).toEqual([
      ["on-now", ["onNow"]],
      ["2026-10-05", ["festNow"]],
      ["2026-10-06", ["festNow"]],
      ["2026-10-07", ["festNow"]],
      ["2026-10-29", ["fest"]],
      ["2026-10-30", ["fest"]],
      ["2026-10-31", ["fest"]],
    ]);
  });

  it("lists a multi-day one-off only under the days a when-filter covers", () => {
    const comedy = event({ id: "comedy", title: "Stand-up", start: "2026-10-09T20:30:00-05:00", end: "2026-10-10" });
    expect(groupResults([comedy], f({ when: { from: "2026-10-10", to: "2026-10-10" } }), today, none).map((g) => g.key)).toEqual(["2026-10-10"]);
    expect(groupResults([comedy], f({ when: { preset: "today" } }), "2026-10-10", none).map((g) => g.key)).toEqual(["2026-10-10"]);
  });

  it("orders a carried-over one-off among a day's rows by its time of day", () => {
    const comedy = event({ id: "comedy", title: "Stand-up", start: "2026-10-09T20:30:00-05:00", end: "2026-10-10" });
    const sat = event({ id: "sat", title: "Matinee", start: "2026-10-10T14:00:00-05:00" });
    const satAll = event({ id: "satAll", title: "Market", start: "2026-10-10" });
    const groups = groupResults([comedy, sat, satAll], f(), today, none);
    expect(groups.find((g) => g.key === "2026-10-10")!.events.map((e) => e.id)).toEqual(["satAll", "sat", "comedy"]);
  });

  it("lists a show that runs past midnight under its night only", () => {
    const late = event({ id: "late", title: "Late set", start: "2026-10-09T21:00:00-05:00", end: "2026-10-10T01:00:00-05:00" });
    const groups = groupResults([late], f(), today, none);
    expect(groups.map((g) => g.key)).toEqual(["2026-10-09"]);
    expect(rowDateLine(late, today)).toBe("9:00 pm");
    expect(groupResults([late], f(), "2026-10-10", none)).toEqual([]); // the next morning it is past, not under yesterday
  });

  it("counts and exports an event listed under several days once", () => {
    const comedy = event({ id: "comedy", title: "Stand-up", start: "2026-10-09T20:30:00-05:00", end: "2026-10-10" });
    expect(resultEvents(groupResults([comedy, fri7], f(), today, none)).map((e) => e.id)).toEqual(["fri7", "comedy"]);
  });

  it("sorts the always-there group by kind, then title", () => {
    const rec = (id: string, title: string, kind: string) => event({ id, title, kind, recurrence: "recurring", start: undefined, schedule: "Weekly" });
    const groups = groupResults([rec("1", "Zumba", "music"), rec("2", "Bingo", "food/drink"), rec("3", "Anthem", "music"), rec("4", "Trivia", "food/drink")], f({ recurring: true }), today, none);
    expect(groups.map((g) => g.key)).toEqual(["always-there"]);
    expect(groups[0]!.events.map((e) => e.title)).toEqual(["Bingo", "Trivia", "Anthem", "Zumba"]);
  });

  it("omits empty groups and the recurring group by default", () => {
    const groups = groupResults([fri7, tue], f(), today, none);
    expect(groups.map((g) => g.key)).toEqual(["2026-10-06", "2026-10-09"]);
  });

  it("groups by venue when asked, a heading per venue, each venue's events by start", () => {
    const early = event({ id: "early", title: "Matinee", start: "2026-10-08T14:00:00-05:00", venue: "recordBar" });
    const groups = groupResults([fri7, fri5, onNow, early], f({ sort: "venue" }), today, none);
    expect(groups.map((g) => [g.heading, g.collapsed, g.events.map((e) => e.id)])).toEqual([
      ["Knuckleheads", false, ["fri5"]],
      ["Nelson-Atkins", false, ["onNow"]],
      ["recordBar", false, ["early", "fri7"]],
    ]);
    // Keys never collide with a day's or a fixed group's, whatever a venue is called.
    expect(new Set(groups.map((g) => g.key)).size).toBe(3);
    expect(groups.every((g) => g.key.startsWith("venue:"))).toBe(true);
  });

  it("applies the filters", () => {
    const groups = groupResults(all, f({ q: "show" }), today, none);
    expect(groups.flatMap((g) => g.events.map((e) => e.id))).toEqual(["fri5", "fri7"]);
  });
});

describe("passed saves (#93)", () => {
  it("lists a save that has passed last in the saved view, under Already happened, the latest first", () => {
    const later = "2026-10-10"; // Friday's shows, Tuesday's talk and the fair are over
    const saved = new Set([fri7.id, tue.id, festNow.id, onNow.id]);
    const groups = groupResults([fri7, tue, festNow, onNow, fri5], f({ saved: true }), later, saved);
    expect(groups.map((g) => [g.heading, g.events.map((e) => e.id)])).toEqual([
      ["On now", ["onNow"]],
      ["Already happened", ["fri7", "festNow", "tue"]], // by last day: the fair closed Wednesday, after the talk
    ]);
  });

  it("leaves passed events out everywhere else", () => {
    const groups = groupResults([fri7, onNow], f(), "2026-10-10", new Set([fri7.id]));
    expect(resultEvents(groups).map((e) => e.id)).toEqual(["onNow"]);
  });
});

describe("venue sort", () => {
  it("orders two shows at one venue on one day by start time, then title", () => {
    const late = event({ id: "late", title: "A late show", start: "2026-10-09T21:00:00-05:00", venue: "recordBar" });
    const early = event({ id: "early", title: "Z early show", start: "2026-10-09T18:00:00-05:00", venue: "recordBar" });
    const groups = groupResults([late, early], f({ sort: "venue" }), today, none);
    expect(groups[0]!.events.map((e) => e.id)).toEqual(["early", "late"]);
  });

  it("puts every room of a venue under the venue's one heading (#91)", () => {
    const kauffman = "Kauffman Center for the Performing Arts";
    const hall = event({ id: "hall", title: "Symphony", start: "2026-10-09T19:00:00-05:00", venue: kauffman, room: "Helzberg Hall" });
    const theatre = event({ id: "theatre", title: "Opera", start: "2026-10-10T19:00:00-05:00", venue: kauffman, room: "Muriel Kauffman Theatre" });
    const lobby = event({ id: "lobby", title: "Open house", start: "2026-10-08T12:00:00-05:00", venue: kauffman });
    const groups = groupResults([hall, theatre, lobby], f({ sort: "venue" }), today, none);
    expect(groups.map((g) => [g.heading, g.events.map((e) => e.id)])).toEqual([[kauffman, ["lobby", "hall", "theatre"]]]);
  });
});

describe("rowDateLine", () => {
  it("gives a multi-day one-off its time and its last day on every day it is listed, underway or not (#90)", () => {
    const timed = event({ id: "timed", title: "Festival", start: "2026-10-29T18:00:00-05:00", end: "2026-10-31T22:00:00-05:00" });
    expect(rowDateLine(timed, today)).toBe("6:00 pm · through Sat Oct 31");
    expect(rowDateLine(timed, "2026-10-30")).toBe("6:00 pm · through Sat Oct 31");
    expect(rowDateLine(timed, today, true)).toBe("Thu Oct 29, 6:00 pm–Sat Oct 31");
    expect(rowDateLine(timed, "2026-10-30", true)).toBe("Thu Oct 29, 6:00 pm–Sat Oct 31");
    const comedy = event({ id: "comedy", title: "Stand-up", start: "2026-10-09T20:30:00-05:00", end: "2026-10-10" });
    expect(rowDateLine(comedy, "2026-10-10")).toBe("8:30 pm · through Sat Oct 10");
  });

  it("writes the time, no time listed for a date-only start, a span, or a schedule", () => {
    expect(rowDateLine(fri7, today)).toBe("7:00 pm");
    expect(rowDateLine(friAll, today)).toBe("No time listed");
    expect(rowDateLine(onNow, today)).toBe("Closes Tue Oct 20");
    expect(rowDateLine(onNowSooner, today)).toBe("Closes Sun Oct 11");
    expect(rowDateLine(festNow, today)).toBe("Through Wed Oct 7");
    expect(rowDateLine(opensLater, today)).toBe("Runs through Sat Nov 14");
    expect(rowDateLine(festLater, today)).toBe("Through Sat Oct 31");
    expect(rowDateLine(trivia, today)).toBe("Tuesdays");
  });

  it("puts the day first when there are no day headings (the venue sort)", () => {
    expect(rowDateLine(fri7, today, true)).toBe("Fri Oct 9 · 7:00 pm");
    expect(rowDateLine(friAll, today, true)).toBe("Fri Oct 9 · no time listed");
    expect(rowDateLine(onNow, today, true)).toBe("Closes Tue Oct 20");
    expect(rowDateLine(onNowSooner, today, true)).toBe("Closes Sun Oct 11");
    expect(rowDateLine(festNow, today, true)).toBe("Sat Oct 3–Wed Oct 7");
    expect(rowDateLine(opensLater, today, true)).toBe("Tue Oct 20–Sat Nov 14");
    expect(rowDateLine(festLater, today, true)).toBe("Thu Oct 29–Sat Oct 31");
    expect(rowDateLine(trivia, today, true)).toBe("Tuesdays");
  });
});

describe("shortlist (#132)", () => {
  it("lists exactly the shortlisted events, in the link's order, under one Shortlist heading", () => {
    const groups = groupResults(all, f({ ids: ["fri7", "trivia", "onNow", "tue"] }), today, none);
    expect(groups.map((g) => [g.key, g.heading, g.collapsed, g.events.map((e) => e.id)])).toEqual([
      [SHORTLIST_GROUP, "Shortlist · 4 events", false, ["fri7", "trivia", "onNow", "tue"]],
    ]);
  });

  it("applies the other filters on top, counting what is left", () => {
    const groups = groupResults(all, f({ ids: ["fri7", "tue", "friAll"], when: { from: "2026-10-09", to: "2026-10-09" } }), today, none);
    expect(groups.map((g) => [g.heading, g.events.map((e) => e.id)])).toEqual([["Shortlist · 2 events", ["fri7", "friAll"]]]);
    expect(groupResults(all, f({ ids: ["tue"] }), today, none)[0]!.heading).toBe("Shortlist · 1 event");
    expect(groupResults(all, f({ ids: ["tue"], kinds: ["film"] }), today, none)).toEqual([]);
  });

  it("leaves out a shortlisted event that has passed", () => {
    const past = event({ id: "past", title: "Gone", start: "2026-10-01T19:00:00-05:00" });
    expect(resultEvents(groupResults([...all, past], f({ ids: ["past", "tue"] }), today, none)).map((e) => e.id)).toEqual(["tue"]);
  });

  it("keeps the link's order and heading under the venue sort too", () => {
    const groups = groupResults(all, f({ ids: ["fri7", "tue"], sort: "venue" }), today, none);
    expect(groups.map((g) => [g.heading, g.events.map((e) => e.id)])).toEqual([["Shortlist · 2 events", ["fri7", "tue"]]]);
  });
});
