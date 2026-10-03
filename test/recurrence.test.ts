import { describe, expect, it } from "vitest";
import { deriveRecurrence } from "../src/recurrence.js";

describe("recurrence class derived from evidence", () => {
  it("a single date is a one-off", () => {
    expect(deriveRecurrence({ start: "2026-10-10T20:00:00-05:00", sportsSeason: false })).toBe("one-off");
  });

  it("a short consecutive span, such as a festival weekend, is a one-off", () => {
    expect(deriveRecurrence({ start: "2026-10-16", end: "2026-10-18", sportsSeason: false })).toBe("one-off");
    expect(deriveRecurrence({ start: "2026-10-15T18:00:00-05:00", end: "2026-10-18", sportsSeason: false })).toBe("one-off");
  });

  it("an end date more than a few days after the start is a limited run", () => {
    expect(deriveRecurrence({ start: "2026-10-15", end: "2026-10-19", sportsSeason: false })).toBe("limited-run");
    expect(deriveRecurrence({ start: "2026-09-01", end: "2027-01-10", sportsSeason: false })).toBe("limited-run");
  });

  it("a schedule phrase with no fixed date is recurring", () => {
    expect(deriveRecurrence({ schedule: "Every Tuesday, 7pm", sportsSeason: false })).toBe("recurring");
  });

  it("a schedule phrase with only a next date is still recurring: the date is one occurrence of an open-ended schedule", () => {
    expect(deriveRecurrence({ schedule: "First Fridays", start: "2026-11-06", sportsSeason: false })).toBe("recurring");
  });

  it("a schedule bounded by an end date is not open-ended, so its span decides", () => {
    expect(deriveRecurrence({ schedule: "Thursdays through Sundays", start: "2026-10-01", end: "2026-10-25", sportsSeason: false })).toBe(
      "limited-run",
    );
  });

  it("a sports season is recurring, whatever its dates", () => {
    expect(deriveRecurrence({ start: "2026-04-01", end: "2026-09-27", sportsSeason: true })).toBe("recurring");
  });

  it("nothing to go on is a one-off", () => {
    expect(deriveRecurrence({ sportsSeason: false })).toBe("one-off");
  });
});
