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

describe("rowDateLine", () => {
  it("writes the time, all day, a span, or a schedule", () => {
    expect(rowDateLine(fri7, today)).toBe("7:00 pm");
    expect(rowDateLine(friAll, today)).toBe("All day");
    expect(rowDateLine(onNow, today)).toBe("On now, closes Tue Oct 20");
    expect(rowDateLine(opensLater, today)).toBe("Runs through Sat Nov 14");
    expect(rowDateLine(festLater, today)).toBe("Runs through Sat Oct 31");
    expect(rowDateLine(trivia, today)).toBe("Tuesdays");
  });

  it("puts the day first when there are no day headings (the venue sort)", () => {
    expect(rowDateLine(fri7, today, true)).toBe("Fri Oct 9 · 7:00 pm");
    expect(rowDateLine(friAll, today, true)).toBe("Fri Oct 9 · all day");
    expect(rowDateLine(onNow, today, true)).toBe("On now, closes Tue Oct 20");
    expect(rowDateLine(onNowSooner, today, true)).toBe("On now, closes Sun Oct 11");
    expect(rowDateLine(opensLater, today, true)).toBe("Tue Oct 20–Sat Nov 14");
    expect(rowDateLine(festLater, today, true)).toBe("Thu Oct 29–Sat Oct 31");
    expect(rowDateLine(trivia, today, true)).toBe("Tuesdays");
  });
});
