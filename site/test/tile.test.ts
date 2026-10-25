import { describe, expect, it } from "vitest";
import { dateTile } from "../src/lib/tile";
import { event } from "./fixtures/event";

describe("dateTile", () => {
  const today = "2026-10-05";

  it("shows a one-off's weekday, day, and month, with its time as the detail", () => {
    expect(dateTile(event({ start: "2026-10-06T19:00:00-05:00" }), today)).toEqual({ top: "Tue", day: "6", month: "Oct", detail: "7:00 pm", label: "Tue Oct 6, 7:00 pm" });
    expect(dateTile(event({ start: "2026-10-10" }), today)).toEqual({ top: "Sat", day: "10", month: "Oct", detail: undefined, label: "Sat Oct 10" });
  });

  it("shows a multi-day one-off by its first day, with its time and last day as the detail, underway or not (#90)", () => {
    const fair = event({ start: "2026-10-09", end: "2026-10-11" });
    expect(dateTile(fair, today)).toEqual({ top: "Fri", day: "9", month: "Oct", detail: "Through Sun Oct 11", label: "Fri Oct 9 through Sun Oct 11" });
    const comedy = event({ start: "2026-10-09T20:30:00-05:00", end: "2026-10-10" });
    expect(dateTile(comedy, today)).toEqual({
      top: "Fri", day: "9", month: "Oct", detail: "8:30 pm · through Sat Oct 10", label: "Fri Oct 9, 8:30 pm, through Sat Oct 10",
    });
  });

  it("shows a multi-day one-off underway by today, the day the explorer lists it under", () => {
    const fair = event({ start: "2026-10-09", end: "2026-10-11" });
    expect(dateTile(fair, "2026-10-10")).toEqual({ top: "Sat", day: "10", month: "Oct", detail: "Through Sun Oct 11", label: "Sat Oct 10 through Sun Oct 11" });
    // On its last day the tile shows the day, so the line says so rather than "through" the same date.
    expect(dateTile(fair, "2026-10-11")).toEqual({ top: "Sun", day: "11", month: "Oct", detail: "Last day", label: "Sun Oct 11, the last day" });
    const comedy = event({ start: "2026-10-09T20:30:00-05:00", end: "2026-10-10" });
    expect(dateTile(comedy, "2026-10-10", "2026-10-10T12:00")).toEqual({
      top: "Today", day: "10", month: "Oct", today: true, detail: "8:30 pm · last day", label: "Today, 8:30 pm, the last day",
    });
  });

  it("shows a run on now by its close, and a run not yet open by its opening", () => {
    expect(dateTile(event({ recurrence: "limited-run", start: "2026-09-01", end: "2026-12-13" }), today)).toEqual({
      top: "Closes", day: "13", month: "Dec", detail: undefined, label: "Closes Sun Dec 13",
    });
    expect(dateTile(event({ recurrence: "limited-run", start: undefined, end: "2026-10-31" }), today)).toMatchObject({ top: "Closes", day: "31" });
    expect(dateTile(event({ recurrence: "limited-run", start: "2026-10-08", end: "2026-10-25" }), today)).toEqual({
      top: "Opens", day: "8", month: "Oct", detail: "Closes Sun Oct 25", label: "Opens Thu Oct 8, closes Sun Oct 25",
    });
  });

  describe("with the visitor's clock", () => {
    // Wall time in the site's zone, as nowIn reads it: noon on Monday Oct 5.
    const now = "2026-10-05T12:00";

    it("calls a pick starting today Today, ringed", () => {
      expect(dateTile(event({ start: "2026-10-05T19:00:00-05:00" }), today, now)).toEqual({
        top: "Today", day: "5", month: "Oct", detail: "7:00 pm", label: "Today, 7:00 pm", today: true,
      });
      expect(dateTile(event({ start: "2026-10-05", end: "2026-10-07" }), today, now)).toMatchObject({
        top: "Today", today: true, detail: "Through Wed Oct 7", label: "Today through Wed Oct 7",
      });
      expect(dateTile(event({ start: "2026-10-05T20:30:00-05:00", end: "2026-10-06" }), today, now)).toMatchObject({
        top: "Today", today: true, detail: "8:30 pm · through Tue Oct 6", label: "Today, 8:30 pm, through Tue Oct 6",
      });
    });

    it("keeps the weekday for a pick on another day", () => {
      expect(dateTile(event({ start: "2026-10-06T19:00:00-05:00" }), today, now)).toEqual({ top: "Tue", day: "6", month: "Oct", detail: "7:00 pm", label: "Tue Oct 6, 7:00 pm" });
    });

    it("says a timed pick has started once its start has passed, from that minute on", () => {
      expect(dateTile(event({ start: "2026-10-05T11:59:00-05:00" }), today, now)).toEqual({
        top: "Today", day: "5", month: "Oct", detail: "Started 11:59 am", label: "Today, started 11:59 am", today: true, started: true,
      });
      expect(dateTile(event({ start: "2026-10-05T12:00:00-05:00" }), today, now)).toMatchObject({ detail: "Started 12:00 pm", started: true });
      expect(dateTile(event({ start: "2026-10-05T12:01:00-05:00" }), today, now)).not.toHaveProperty("started");
    });

    it("says a timed span has started on its last day once the start has passed, and not on a day before it", () => {
      const comedy = event({ start: "2026-10-04T11:30:00-05:00", end: "2026-10-05" });
      expect(dateTile(comedy, today, now)).toEqual({
        top: "Today", day: "5", month: "Oct", today: true, started: true,
        detail: "Started 11:30 am · last day", label: "Today, started 11:30 am, the last day",
      });
      expect(dateTile(event({ start: "2026-10-04T12:30:00-05:00", end: "2026-10-05" }), today, now)).not.toHaveProperty("started");
      // Another day follows: the span can still be gone to.
      expect(dateTile(event({ start: "2026-10-05T11:30:00-05:00", end: "2026-10-06" }), today, now)).not.toHaveProperty("started");
      expect(dateTile(event({ start: "2026-10-04", end: "2026-10-05" }), today, "2026-10-05T23:59")).not.toHaveProperty("started");
    });

    it("times a span's last day by its end when that comes before the start's hour, and folds it once ended", () => {
      // Friday 7:45 pm to Sunday 1:45 pm: Sunday has no 7:45 pm show.
      const rodeo = event({ start: "2026-10-03T19:45:00-05:00", end: "2026-10-05T13:45:00-05:00" });
      expect(dateTile(rodeo, today, now)).toEqual({
        top: "Today", day: "5", month: "Oct", today: true, detail: "Until 1:45 pm · last day", label: "Today, until 1:45 pm, the last day",
      });
      expect(dateTile(rodeo, today, "2026-10-05T15:00")).toEqual({
        top: "Today", day: "5", month: "Oct", today: true, started: true,
        detail: "Ended 1:45 pm · last day", label: "Today, ended 1:45 pm, the last day",
      });
      expect(dateTile(rodeo, "2026-10-04", "2026-10-04T20:00")).not.toHaveProperty("started"); // Saturday: Sunday follows
      // An end at or after the start's hour leaves the start's timing.
      expect(dateTile(event({ start: "2026-10-04T11:30:00-05:00", end: "2026-10-05T17:00:00-05:00" }), today, now)).toMatchObject({ started: true, detail: "Started 11:30 am · last day" });
    });

    it("never says a date-only pick has started", () => {
      expect(dateTile(event({ start: "2026-10-05" }), today, "2026-10-05T23:59")).toEqual({ top: "Today", day: "5", month: "Oct", detail: undefined, label: "Today", today: true });
    });

    it("leaves limited runs as they are", () => {
      const onNow = event({ recurrence: "limited-run", start: "2026-09-01", end: "2026-12-13" });
      const opening = event({ recurrence: "limited-run", start: "2026-10-05T10:00:00-05:00", end: "2026-10-25" });
      expect(dateTile(onNow, today, now)).toEqual(dateTile(onNow, today));
      expect(dateTile(opening, today, now)).toEqual(dateTile(opening, today));
    });

    it("says Today before a run's weekdays on one of them, and only with the visitor's clock", () => {
      const weekends = event({ recurrence: "limited-run", start: "2026-09-01", end: "2026-11-01", days: [5, 6, 0], daysLine: "Fri–Sun" });
      const weekdays = event({ recurrence: "limited-run", start: "2026-09-01", end: "2026-11-01", days: [1, 2], daysLine: "Mon & Tue" });
      expect(dateTile(weekends, today, now)).toEqual(dateTile(weekends, today)); // Monday: not one of its days
      expect(dateTile(weekdays, today)).toMatchObject({ detail: "Mon & Tue" }); // built: no day claimed
      expect(dateTile(weekdays, today, now)).toEqual({
        top: "Closes", day: "1", month: "Nov", detail: "Today · Mon & Tue", label: "On today. Mon & Tue each week, closes Sun Nov 1",
      });
    });
  });
});
