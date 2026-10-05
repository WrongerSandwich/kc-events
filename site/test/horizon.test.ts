import { describe, expect, it } from "vitest";
import { anchorDate, bucketDontMiss, closingLine, horizon, horizonBounds, horizonHeading, HORIZONS } from "../src/lib/horizon";
import { events } from "../src/generated/events";
import { meta } from "../src/generated/meta";
import { isDated, isPast } from "../src/lib/events";
import { addDays } from "../src/lib/dates";
import { event } from "./fixtures/event";

describe("horizon", () => {
  it("bounds the first bucket at the coming Sunday and the second at today plus fourteen", () => {
    expect(horizonBounds("2026-10-05")).toEqual({ sunday: "2026-10-11", twoWeeks: "2026-10-19" });
    expect(horizonBounds("2026-10-11")).toEqual({ sunday: "2026-10-11", twoWeeks: "2026-10-25" });
    expect(horizonBounds("2026-12-30")).toEqual({ sunday: "2027-01-03", twoWeeks: "2027-01-13" });
    // The DST Sunday: clocks fall back at 2:00 on 2026-11-01; date arithmetic must not shift a day.
    expect(horizonBounds("2026-11-01")).toEqual({ sunday: "2026-11-01", twoWeeks: "2026-11-15" });
  });

  it("heads the first bucket by weekday, every day of the week, always with dates", () => {
    expect(horizonHeading("through-sunday", "2026-10-05")).toBe("This week, Oct 5–11"); // Mon
    expect(horizonHeading("through-sunday", "2026-10-06")).toBe("This week, Oct 6–11"); // Tue
    expect(horizonHeading("through-sunday", "2026-10-07")).toBe("This week, Oct 7–11"); // Wed
    expect(horizonHeading("through-sunday", "2026-10-08")).toBe("This weekend, Oct 8–11"); // Thu
    expect(horizonHeading("through-sunday", "2026-10-09")).toBe("This weekend, Oct 9–11"); // Fri
    expect(horizonHeading("through-sunday", "2026-10-10")).toBe("This weekend, Oct 10–11"); // Sat
    expect(horizonHeading("through-sunday", "2026-10-11")).toBe("This weekend, Oct 11"); // Sun
    expect(horizonHeading("through-sunday", "2026-11-01")).toBe("This weekend, Nov 1"); // the DST Sunday
    expect(horizonHeading("through-sunday", "2026-12-30")).toBe("This week, Dec 30–Jan 3"); // across the year
    expect(horizonHeading("next-two-weeks", "2026-10-05")).toBe("Next two weeks, through Oct 19");
    expect(horizonHeading("next-two-weeks", "2026-11-01")).toBe("Next two weeks, through Nov 15");
    expect(horizonHeading("further-out", "2026-10-05")).toBe("Further out");
  });

  it("buckets around the DST Sunday by local date", () => {
    const today = "2026-11-01";
    expect(horizon(event({ start: "2026-11-01T01:30:00-05:00" }), today)).toBe("through-sunday");
    expect(horizon(event({ start: "2026-11-01T19:00:00-06:00" }), today)).toBe("through-sunday");
    expect(horizon(event({ start: "2026-11-02T19:00:00-06:00" }), today)).toBe("next-two-weeks");
    expect(horizon(event({ start: "2026-11-15" }), today)).toBe("next-two-weeks");
    expect(horizon(event({ start: "2026-11-16" }), today)).toBe("further-out");
  });

  it("anchors a one-off on its start and a limited run on its close", () => {
    expect(anchorDate(event({ start: "2026-10-09T19:00:00-05:00" }))).toBe("2026-10-09");
    expect(anchorDate(event({ start: "2026-10-09", end: "2026-10-11" }))).toBe("2026-10-09");
    expect(anchorDate(event({ recurrence: "limited-run", start: "2026-09-20", end: "2026-11-14" }))).toBe("2026-11-14");
    expect(anchorDate(event({ recurrence: "limited-run", start: undefined, end: "2026-10-31" }))).toBe("2026-10-31");
    expect(anchorDate(event({ recurrence: "recurring", start: undefined, schedule: "Tuesdays" }))).toBeUndefined();
  });

  it("buckets by anchor against the bounds", () => {
    const today = "2026-10-05";
    expect(horizon(event({ start: "2026-10-06" }), today)).toBe("through-sunday");
    expect(horizon(event({ start: "2026-10-11" }), today)).toBe("through-sunday");
    expect(horizon(event({ start: "2026-10-12" }), today)).toBe("next-two-weeks");
    expect(horizon(event({ start: "2026-10-19" }), today)).toBe("next-two-weeks");
    expect(horizon(event({ start: "2026-10-20" }), today)).toBe("further-out");
    expect(horizon(event({ recurrence: "limited-run", start: "2026-09-01", end: "2026-10-10" }), today)).toBe("through-sunday");
    expect(horizon(event({ recurrence: "limited-run", start: undefined, end: "2026-12-31" }), today)).toBe("further-out");
    expect(horizon(event({ recurrence: "recurring", start: undefined, schedule: "Tuesdays" }), today)).toBeUndefined();
  });

  it("is total over every non-past dated event in the committed dataset for a week of todays", () => {
    for (let i = 0; i < 7; i++) {
      const today = addDays(meta.buildToday, i);
      for (const e of events) {
        if (!isDated(e) || isPast(e, today)) continue;
        expect(HORIZONS).toContain(horizon(e, today));
      }
    }
  });

  it("groups and sorts the don't-miss events, leaving empty buckets present", () => {
    const today = "2026-10-05";
    const a = event({ id: "a", dontMiss: true, whyLine: "x", start: "2026-10-10" });
    const b = event({ id: "b", dontMiss: true, whyLine: "x", start: "2026-10-06T20:00:00-05:00" });
    const c = event({ id: "c", dontMiss: true, whyLine: "x", recurrence: "limited-run", start: "2026-09-01", end: "2026-11-20" });
    const d = event({ id: "d", dontMiss: false, start: "2026-10-06" });
    const r = event({ id: "r", recurrence: "recurring", start: undefined, schedule: "Tuesdays" });
    const buckets = bucketDontMiss([a, b, c, d, r], today);
    expect(buckets["through-sunday"].map((e) => e.id)).toEqual(["b", "a"]);
    expect(buckets["next-two-weeks"]).toEqual([]);
    expect(buckets["further-out"].map((e) => e.id)).toEqual(["c"]);
  });

  it("writes the closing line for runs", () => {
    const today = "2026-10-05";
    expect(closingLine(event({ recurrence: "limited-run", start: "2026-09-20", end: "2026-10-11" }), today)).toBe("On now, closes Sun Oct 11");
    expect(closingLine(event({ recurrence: "limited-run", start: "2026-10-20", end: "2026-11-14" }), today)).toBe("Opens Tue Oct 20, runs through Sat Nov 14");
    expect(closingLine(event({ recurrence: "limited-run", start: undefined, end: "2026-10-31" }), today)).toBe("On now, closes Sat Oct 31");
    expect(closingLine(event({ start: "2026-10-09", end: "2026-10-11" }), today)).toBe("Fri Oct 9–Sun Oct 11");
    expect(closingLine(event({ start: "2026-10-09", end: "2026-10-11" }), "2026-10-10")).toBe("On now, through Sun Oct 11");
  });
});
