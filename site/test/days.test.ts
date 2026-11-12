// @vitest-environment node
import { describe, expect, it } from "vitest";
import { longDateLine } from "../src/lib/date-line";
import { daysPhrase } from "../src/build/load-dataset";
import { isOnNow, nextRunDay, playsOn } from "../src/lib/events";
import { matches } from "../src/lib/filter";
import { groupResults, rowDate } from "../src/lib/group";
import { anchorDate, bucketDontMiss, closingLine } from "../src/lib/horizon";
import { toIcs } from "../src/lib/ics";
import { DEFAULT_FILTERS, EVERY_DATE } from "../src/lib/query";
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
    expect(longDateLine(poe, THU)).toBe("Fri–Sun each week, through Sunday, November 1");
    expect(longDateLine(poe, FRI)).toBe("Fri–Sun each week, through Sunday, November 1");
    expect(longDateLine(poe, "2026-10-05")).toBe("Fri–Sun each week, Wednesday, October 14 through Sunday, November 1");
    expect(longDateLine(everyDay, THU)).toBe("Closes Sunday, November 1");
  });

  it("says its days on the tile and its closing line", () => {
    expect(dateTile(poe, FRI)).toEqual({ top: "Closes", day: "1", month: "Nov", detail: "Fri–Sun", label: "Fri–Sun each week, closes Sun Nov 1" });
    expect(dateTile(poe, THU)).toMatchObject({ top: "Closes", detail: "Fri–Sun" });
    expect(dateTile(poe, "2026-10-05")).toEqual({ top: "Opens", day: "14", month: "Oct", detail: "Fri–Sun, through Sun Nov 1", label: "Opens Wed Oct 14, Fri–Sun each week, through Sun Nov 1" });
    expect(closingLine(poe, THU)).toBe("Fri–Sun each week, closes Sun Nov 1");
    expect(dateTile(everyDay, THU)).toMatchObject({ detail: undefined, label: "Closes Sun Nov 1" });
  });

  it("is listed under its next playing day in the explorer on a day it does not play, and under On now on one it does", () => {
    const groups = (today: string) => groupResults([poe], { ...DEFAULT_FILTERS, when: EVERY_DATE }, today, new Set()).map((g) => [g.key, g.events.map((e) => e.id)]);
    expect(groups(THU)).toEqual([[FRI, ["poe"]]]);
    expect(groups(FRI)).toEqual([["on-now", ["poe"]]]);
    expect(groups("2026-10-05")).toEqual([["2026-10-14", ["poe"]]]);
    expect(rowDate(poe, THU).line).toBe("Fri–Sun, through Sun Nov 1");
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

/**
 * Liberty's Beacon on the 2026-11-09 front page: Fri Sep 25 through Wed Nov 11, its list saying "(Weekends)". From the
 * Monday no Saturday or Sunday was left before it closed, and it led the front page as today's while the explorer's
 * same week left it out.
 */
const beacon = event({ id: "beacon", title: "Liberty's Beacon", dontMiss: true, recurrence: "limited-run", start: "2026-09-25", end: "2026-11-11", days: [6, 0], daysLine: "Sat & Sun" });
const MON = "2026-11-09";
const WED = "2026-11-11";

describe("a run whose span outlasts its last listed weekday", () => {
  it("can next be gone to on its weekdays, then on its closing day, and on no day after that", () => {
    expect(nextRunDay(beacon, "2026-11-06")).toBe("2026-11-07");
    expect(nextRunDay(beacon, MON)).toBe(WED);
    expect(nextRunDay(beacon, WED)).toBe(WED);
    expect(nextRunDay(beacon, "2026-11-12")).toBeUndefined();
    expect(nextRunDay(everyDay, THU)).toBe(THU);
    expect(nextRunDay(everyDay, "2026-11-02")).toBeUndefined();
  });

  it("sorts on the front page under its closing day, not today, and is never said to be on", () => {
    expect(anchorDate(beacon, MON)).toBe(WED);
    const tue = event({ id: "tue", dontMiss: true, start: "2026-11-10T19:00:00-06:00" });
    const thu = event({ id: "thu", dontMiss: true, start: "2026-11-12T19:00:00-06:00" });
    expect(bucketDontMiss([thu, beacon, tue], MON)["through-sunday"].map((e) => e.id)).toEqual(["tue", "beacon", "thu"]);
    expect(isOnNow(beacon, MON)).toBe(false);
    expect(isOnNow(beacon, WED)).toBe(false);
    expect(dateTile(beacon, WED, `${WED}T12:00`)).toMatchObject({ top: "Closes", day: "11", month: "Nov", detail: "Sat & Sun" });
    expect(closingLine(beacon, MON)).toBe("Sat & Sun each week, closes Wed Nov 11");
  });

  it("is listed in the explorer under its closing day, through that day", () => {
    const groups = (today: string) => groupResults([beacon], { ...DEFAULT_FILTERS, when: EVERY_DATE }, today, new Set()).map((g) => [g.key, g.events.map((e) => e.id)]);
    expect(groups("2026-11-06")).toEqual([["2026-11-07", ["beacon"]]]);
    expect(groups(MON)).toEqual([[WED, ["beacon"]]]);
    expect(groups(WED)).toEqual([[WED, ["beacon"]]]);
    expect(groups("2026-11-12")).toEqual([]);
    expect(rowDate(beacon, MON).line).toBe("Sat & Sun, through Wed Nov 11");
  });

  it("matches a when-filter that reaches its closing day, and none that stops short of it", () => {
    const when = (w: typeof DEFAULT_FILTERS.when) => ({ ...DEFAULT_FILTERS, when: w });
    expect(matches(beacon, when({ preset: "weekend" }), MON, new Set())).toBe(true);
    expect(matches(beacon, when({ preset: "today" }), MON, new Set())).toBe(false);
    expect(matches(beacon, when({ preset: "today" }), WED, new Set())).toBe(true);
    expect(matches(beacon, when({ from: MON, to: "2026-11-10" }), MON, new Set())).toBe(false);
    // The explorer lists it under the same day the filter held it for.
    expect(groupResults([beacon], when({ preset: "weekend" }), MON, new Set()).map((g) => g.key)).toEqual([WED]);
  });

  it("stays a weekly rule on its weekdays in the calendar export, with no entry on the closing day", () => {
    // Its own file from the Monday, too: a calendar entry on the Wednesday would say it is on that day.
    for (const visitFrom of [undefined, MON]) {
      const ics = toIcs([beacon], { siteName: "KC Events", stamp: "2026-11-09T11:30:00Z", visitFrom }).replace(/\r\n[ \t]/g, "");
      expect(ics).toContain("DTSTART;VALUE=DATE:20260926\r\nDTEND;VALUE=DATE:20260927\r\nRRULE:FREQ=WEEKLY;BYDAY=SA,SU;UNTIL=20261111\r\n");
    }
  });
});
