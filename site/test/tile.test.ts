import { describe, expect, it } from "vitest";
import { dateTile } from "../src/lib/tile";
import { event } from "./fixtures/event";

describe("dateTile", () => {
  const today = "2026-10-05";

  it("shows a one-off's weekday, day, and month, with its time as the detail", () => {
    expect(dateTile(event({ start: "2026-10-06T19:00:00-05:00" }), today)).toEqual({ top: "Tue", day: "6", month: "Oct", detail: "7:00 pm", label: "Tue Oct 6, 7:00 pm" });
    expect(dateTile(event({ start: "2026-10-10" }), today)).toEqual({ top: "Sat", day: "10", month: "Oct", detail: undefined, label: "Sat Oct 10" });
  });

  it("shows a multi-day one-off by its first day, with the span as the detail", () => {
    expect(dateTile(event({ start: "2026-10-09", end: "2026-10-11" }), today)).toMatchObject({ top: "Fri", day: "9", detail: "Fri Oct 9–Sun Oct 11" });
  });

  it("shows a run on now by its close, and a run not yet open by its opening", () => {
    expect(dateTile(event({ recurrence: "limited-run", start: "2026-09-01", end: "2026-12-13" }), today)).toEqual({
      top: "Until", day: "13", month: "Dec", detail: "On now", label: "On now, closes Sun Dec 13",
    });
    expect(dateTile(event({ recurrence: "limited-run", start: undefined, end: "2026-10-31" }), today)).toMatchObject({ top: "Until", day: "31" });
    expect(dateTile(event({ recurrence: "limited-run", start: "2026-10-08", end: "2026-10-25" }), today)).toEqual({
      top: "Opens", day: "8", month: "Oct", detail: "Through Sun Oct 25", label: "Opens Thu Oct 8, runs through Sun Oct 25",
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
        top: "Today", today: true, detail: "On now, through Wed Oct 7", label: "Today through Wed Oct 7",
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

    it("never says a date-only pick has started", () => {
      expect(dateTile(event({ start: "2026-10-05" }), today, "2026-10-05T23:59")).toEqual({ top: "Today", day: "5", month: "Oct", detail: undefined, label: "Today", today: true });
    });

    it("leaves limited runs as they are", () => {
      const onNow = event({ recurrence: "limited-run", start: "2026-09-01", end: "2026-12-13" });
      const opening = event({ recurrence: "limited-run", start: "2026-10-05T10:00:00-05:00", end: "2026-10-25" });
      expect(dateTile(onNow, today, now)).toEqual(dateTile(onNow, today));
      expect(dateTile(opening, today, now)).toEqual(dateTile(opening, today));
    });
  });
});
