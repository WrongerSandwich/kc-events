// @vitest-environment node
import { describe, expect, it } from "vitest";
import { longDateLine } from "../src/lib/date-line";
import { daysPhrase } from "../src/build/load-dataset";
import { isOnNow, playsOn } from "../src/lib/events";
import { matches } from "../src/lib/filter";
import { groupResults, rowDateLine } from "../src/lib/group";
import { closingLine } from "../src/lib/horizon";
import { toIcs } from "../src/lib/ics";
import { DEFAULT_FILTERS } from "../src/lib/query";
import { dateTile } from "../src/lib/tile";
import { weekDays } from "../src/lib/week";
import { event } from "./fixtures/event";

/** Electric Poe (#143): Wed Oct 14 through Sun Nov 1, playing Fridays through Sundays. */
const poe = event({ id: "poe", title: "Electric Poe", recurrence: "limited-run", start: "2026-10-14", end: "2026-11-01", days: [5, 6, 0], daysLine: "Fri–Sun" });
const { days: _, daysLine: __, ...everyDay } = poe;
const THU = "2026-10-15";
const FRI = "2026-10-16";

describe("a limited run that plays only some weekdays (#143)", () => {
  it("is on now only on its weekdays within its span", () => {
    expect(isOnNow(poe, THU)).toBe(false);
    expect(isOnNow(poe, FRI)).toBe(true);
    expect(isOnNow(poe, "2026-11-01")).toBe(true);
    expect(isOnNow(poe, "2026-11-06")).toBe(false);
    expect(playsOn(poe, "2026-10-20")).toBe(false);
    expect(isOnNow(everyDay, THU)).toBe(true);
  });

  it("names its days, a stretch of three or more as a span", () => {
    expect(daysPhrase(["Fri", "Sat", "Sun"])).toBe("Fri–Sun");
    expect(daysPhrase(["Thu", "Fri", "Sat", "Sun"])).toBe("Thu–Sun");
    expect(daysPhrase(["Sat", "Sun"])).toBe("Sat & Sun");
    expect(daysPhrase(["Tue", "Thu", "Sat"])).toBe("Tue, Thu & Sat");
    expect(daysPhrase(["Wed"])).toBe("Wed");
    expect(daysPhrase(["Mon", "Wed", "Thu", "Fri"])).toBe("Mon, Wed–Fri");
  });

  it("is in the week view's running band only on its weekdays", () => {
    const week = weekDays([poe], "2026-10-12", "2026-10-18");
    expect(week.map((d) => d.running.map((e) => e.id))).toEqual([[], [], [], [], ["poe"], ["poe"], ["poe"]]);
    expect(weekDays([everyDay], "2026-10-12", "2026-10-18").map((d) => d.running.length)).toEqual([0, 0, 1, 1, 1, 1, 1]);
  });

  it("says its days on the date line", () => {
    expect(longDateLine(poe, THU)).toBe("Fri–Sun through Sunday, November 1");
    expect(longDateLine(poe, FRI)).toBe("Fri–Sun through Sunday, November 1");
    expect(longDateLine(poe, "2026-10-05")).toBe("Fri–Sun, Wednesday, October 14 through Sunday, November 1");
    expect(longDateLine(everyDay, THU)).toBe("Through Sunday, November 1");
  });

  it("says its days on the tile and its closing line", () => {
    expect(dateTile(poe, FRI)).toEqual({ top: "Until", day: "1", month: "Nov", detail: "Fri–Sun", label: "Fri–Sun, closes Sun Nov 1" });
    expect(dateTile(poe, THU)).toMatchObject({ top: "Until", detail: "Fri–Sun" });
    expect(dateTile(poe, "2026-10-05")).toEqual({ top: "Opens", day: "14", month: "Oct", detail: "Fri–Sun through Sun Nov 1", label: "Opens Wed Oct 14, runs Fri–Sun through Sun Nov 1" });
    expect(closingLine(poe, THU)).toBe("Fri–Sun, closes Sun Nov 1");
    expect(dateTile(everyDay, THU)).toMatchObject({ detail: "On now", label: "On now, closes Sun Nov 1" });
  });

  it("is listed under its next playing day in the explorer on a day it does not play, and under On now on one it does", () => {
    const groups = (today: string) => groupResults([poe], DEFAULT_FILTERS, today, new Set()).map((g) => [g.key, g.events.map((e) => e.id)]);
    expect(groups(THU)).toEqual([[FRI, ["poe"]]]);
    expect(groups(FRI)).toEqual([["on-now", ["poe"]]]);
    expect(groups("2026-10-05")).toEqual([["2026-10-14", ["poe"]]]);
    expect(rowDateLine(poe, THU)).toBe("Fri–Sun through Sun Nov 1");
  });

  it("matches a when-filter only when it plays within it", () => {
    const today = { ...DEFAULT_FILTERS, when: { preset: "today" as const } };
    expect(matches(poe, today, THU, new Set())).toBe(false);
    expect(matches(poe, today, FRI, new Set())).toBe(true);
    expect(matches(poe, { ...DEFAULT_FILTERS, when: { from: "2026-10-19", to: "2026-10-22" } }, THU, new Set())).toBe(false);
    expect(matches(poe, { ...DEFAULT_FILTERS, when: { from: "2026-10-19", to: "2026-10-23" } }, THU, new Set())).toBe(true);
    expect(matches(everyDay, today, THU, new Set())).toBe(true);
  });

  it("is a weekly rule in the calendar export, from its first playing day through its last day", () => {
    const ics = toIcs([poe], { siteName: "KC Events", stamp: "2026-10-05T11:30:00Z" }).replace(/\r\n[ \t]/g, "");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261016\r\nDTEND;VALUE=DATE:20261017\r\nRRULE:FREQ=WEEKLY;BYDAY=FR,SA,SU;UNTIL=20261101\r\n");
    const plain = toIcs([everyDay], { siteName: "KC Events", stamp: "2026-10-05T11:30:00Z" });
    expect(plain).toContain("DTSTART;VALUE=DATE:20261014\r\nDTEND;VALUE=DATE:20261102\r\n");
    expect(plain).not.toContain("RRULE");
  });
});
