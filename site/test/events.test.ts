import { describe, expect, it } from "vitest";
import { firstDay, hasStartDay, hostOf, isDated, isMultiDay, isPast, isUnderway, lastDay, detailsUrl } from "../src/lib/events";
import { event } from "./fixtures/event";

const oneDay = event();
const multiDay = event({ start: "2026-10-09", end: "2026-10-11" });
const run = event({ recurrence: "limited-run", start: "2026-09-20", end: "2026-11-14" });
const runNoStart = event({ recurrence: "limited-run", start: undefined, end: "2026-10-31" });
const recurring = event({ recurrence: "recurring", start: undefined, schedule: "Every Tuesday, 7pm" });

describe("event predicates", () => {
  it("finds first and last days, including the start-less run", () => {
    expect(firstDay(oneDay)).toBe("2026-10-09");
    expect(lastDay(oneDay)).toBe("2026-10-09");
    expect(lastDay(multiDay)).toBe("2026-10-11");
    expect(firstDay(runNoStart)).toBeUndefined();
    expect(lastDay(runNoStart)).toBe("2026-10-31");
    expect(isDated(recurring)).toBe(false);
    expect(isDated(runNoStart)).toBe(true);
  });

  it("is past only when its last day is before today", () => {
    expect(isPast(oneDay, "2026-10-09")).toBe(false);
    expect(isPast(oneDay, "2026-10-10")).toBe(true);
    expect(isPast(multiDay, "2026-10-11")).toBe(false);
    expect(isPast(runNoStart, "2026-11-01")).toBe(true);
    expect(isPast(recurring, "2099-01-01")).toBe(false);
  });

  it("is multi-day only with an end on a later day", () => {
    expect(isMultiDay(oneDay)).toBe(false);
    expect(isMultiDay(event({ start: "2026-10-09T19:00:00-05:00", end: "2026-10-09T23:00:00-05:00" }))).toBe(false);
    expect(isMultiDay(multiDay)).toBe(true);
    expect(isMultiDay(runNoStart)).toBe(true);
  });

  it("is underway when its span includes today; a start-less run always is", () => {
    expect(isUnderway(run, "2026-10-05")).toBe(true);
    expect(isUnderway(run, "2026-09-19")).toBe(false);
    expect(isUnderway(run, "2026-11-15")).toBe(false);
    expect(isUnderway(multiDay, "2026-10-10")).toBe(true);
    expect(isUnderway(oneDay, "2026-10-09")).toBe(false); // single-day events are never "on now"
    expect(isUnderway(runNoStart, "2026-10-05")).toBe(true);
    expect(isUnderway(recurring, "2026-10-05")).toBe(false);
  });

  it("names the host of a primary page without www", () => {
    expect(hostOf("https://www.therecordbar.com/shows")).toBe("therecordbar.com");
    expect(hostOf("https://kcrep.org/event/x")).toBe("kcrep.org");
    expect(hostOf("not a url")).toBe("not a url");
  });
});

describe("hasStartDay", () => {
  it("is true for a dated event with a start, false for a recurring event or a run with no start", () => {
    expect(hasStartDay(event())).toBe(true);
    expect(hasStartDay(event({ recurrence: "recurring", start: undefined, schedule: "Tuesdays" }))).toBe(false);
    expect(hasStartDay(event({ recurrence: "limited-run", start: undefined, end: "2026-10-31" }))).toBe(false);
  });
});

describe("detailsUrl", () => {
  it("is the event's own page when the job found one, else the primary page", () => {
    expect(detailsUrl(event({ eventUrl: "https://www.therecordbar.com/shows/a-show" }))).toBe("https://www.therecordbar.com/shows/a-show");
    expect(detailsUrl(event())).toBe("https://www.therecordbar.com/shows");
  });
});
