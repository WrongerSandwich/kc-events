import { describe, expect, it } from "vitest";
import { groupResults, rowDateLine } from "../src/lib/group";
import { DEFAULT_FILTERS, type Filters } from "../src/lib/query";
import { event } from "./fixtures/event";

const today = "2026-10-05";
const f = (over: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, ...over });
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

  it("collapses On now when no when-filter is set, so the dated days lead, and keeps it open under a when-filter", () => {
    const collapsed = (over: Partial<Filters>) => groupResults(all, f(over), today, none).map((g) => [g.key, g.collapsed]);
    expect(collapsed({})).toEqual([["on-now", true], ["2026-10-06", false], ["2026-10-09", false], ["2026-10-20", false]]);
    expect(collapsed({ kinds: ["music"], recurring: true })[0]).toEqual(["on-now", true]);
    expect(collapsed({ when: { preset: "7d" } })[0]).toEqual(["on-now", false]);
    expect(collapsed({ when: { preset: "fri-sun" } })[0]).toEqual(["on-now", false]);
    expect(collapsed({ when: { from: "2026-10-05", to: "2026-10-31" } })[0]).toEqual(["on-now", false]);
  });

  it("leaves On now open when no dated day follows it, so a filter never shows just a closed line", () => {
    expect(groupResults([onNow, onNowSooner, trivia], f({ recurring: true }), today, none).map((g) => [g.key, g.collapsed])).toEqual([
      ["on-now", false],
      ["always-there", false],
    ]);
  });

  it("lists a multi-day one-off under On now while underway, and under its opening day before", () => {
    const groups = groupResults([festNow, festLater], f(), today, none);
    expect(groups.map((g) => [g.key, g.events.map((e) => e.id)])).toEqual([
      ["on-now", ["festNow"]],
      ["2026-10-29", ["fest"]],
    ]);
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

  it("sorts by venue into one list when asked", () => {
    const groups = groupResults([fri7, fri5, onNow], f({ sort: "venue" }), today, none);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.heading).toBe("By venue");
    expect(groups[0]!.events.map((e) => e.id)).toEqual(["fri5", "onNow", "fri7"]);
  });

  it("applies the filters", () => {
    const groups = groupResults(all, f({ q: "show" }), today, none);
    expect(groups.flatMap((g) => g.events.map((e) => e.id))).toEqual(["fri5", "fri7"]);
  });
});

describe("venue sort", () => {
  it("orders two shows at one venue on one day by start time, then title", () => {
    const late = event({ id: "late", title: "A late show", start: "2026-10-09T21:00:00-05:00", venue: "recordBar" });
    const early = event({ id: "early", title: "Z early show", start: "2026-10-09T18:00:00-05:00", venue: "recordBar" });
    const groups = groupResults([late, early], f({ sort: "venue" }), today, none);
    expect(groups[0]!.events.map((e) => e.id)).toEqual(["early", "late"]);
  });
});

describe("rowDateLine", () => {
  it("keeps the start time of a timed multi-day one-off on its opening day, as a span short enough for the date column", () => {
    const timed = event({ id: "timed", title: "Festival", start: "2026-10-29T18:00:00-05:00", end: "2026-10-31T22:00:00-05:00" });
    expect(rowDateLine(timed, today)).toBe("6:00 pm–Sat Oct 31");
    expect(rowDateLine(timed, today, true)).toBe("Thu Oct 29, 6:00 pm–Sat Oct 31");
    expect(rowDateLine(event({ ...timed, start: "2026-10-03T18:00:00-05:00", end: "2026-10-07T22:00:00-05:00" }), today)).toBe("Through Wed Oct 7");
  });

  it("writes the time, all day, a span, or a schedule", () => {
    expect(rowDateLine(fri7, today)).toBe("7:00 pm");
    expect(rowDateLine(friAll, today)).toBe("All day");
    expect(rowDateLine(onNow, today)).toBe("Closes Tue Oct 20");
    expect(rowDateLine(onNowSooner, today)).toBe("Closes Sun Oct 11");
    expect(rowDateLine(festNow, today)).toBe("Through Wed Oct 7");
    expect(rowDateLine(opensLater, today)).toBe("Runs through Sat Nov 14");
    expect(rowDateLine(festLater, today)).toBe("Runs through Sat Oct 31");
    expect(rowDateLine(trivia, today)).toBe("Tuesdays");
  });

  it("puts the day first when there are no day headings (the venue sort)", () => {
    expect(rowDateLine(fri7, today, true)).toBe("Fri Oct 9 · 7:00 pm");
    expect(rowDateLine(friAll, today, true)).toBe("Fri Oct 9 · all day");
    expect(rowDateLine(onNow, today, true)).toBe("Closes Tue Oct 20");
    expect(rowDateLine(onNowSooner, today, true)).toBe("Closes Sun Oct 11");
    expect(rowDateLine(festNow, today, true)).toBe("Through Wed Oct 7");
    expect(rowDateLine(opensLater, today, true)).toBe("Tue Oct 20–Sat Nov 14");
    expect(rowDateLine(festLater, today, true)).toBe("Thu Oct 29–Sat Oct 31");
    expect(rowDateLine(trivia, today, true)).toBe("Tuesdays");
  });
});
