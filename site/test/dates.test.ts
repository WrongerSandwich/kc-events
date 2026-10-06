import { describe, expect, it } from "vitest";
import { isValidDate, addDays, comingSunday, formatDay, formatLong, formatRange, formatShort, formatTime, isDateOnly, localDate, nowIn, todayIn, weekday } from "../src/lib/dates";
import { inTimeZone } from "./fixtures/time-zone";

describe("dates", () => {
  it("takes the local date off either dataset form", () => {
    expect(localDate("2026-10-09T19:00:00-05:00")).toBe("2026-10-09");
    expect(localDate("2026-10-09")).toBe("2026-10-09");
  });

  it("adds days across month, year, and the DST change without drift", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-05", 14)).toBe("2026-10-19");
    expect(addDays("2026-10-05", -1)).toBe("2026-10-04");
  });

  it("knows the weekday and the coming Sunday", () => {
    expect(weekday("2026-10-05")).toBe(1); // Monday
    expect(weekday("2026-10-11")).toBe(0);
    expect(comingSunday("2026-10-05")).toBe("2026-10-11");
    expect(comingSunday("2026-10-08")).toBe("2026-10-11");
    expect(comingSunday("2026-10-11")).toBe("2026-10-11"); // Sunday is its own
  });

  it("gives today in the zone from an instant", () => {
    // 03:30 UTC on Oct 6 is 22:30 on Oct 5 in Chicago.
    expect(todayIn("America/Chicago", new Date("2026-10-06T03:30:00Z"))).toBe("2026-10-05");
    expect(todayIn("America/Chicago", new Date("2026-10-06T12:00:00Z"))).toBe("2026-10-06");
    for (const iso of ["2026-01-02T08:00:00Z", "2026-12-31T23:59:00Z"]) expect(todayIn("America/Chicago", new Date(iso))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reads an instant as the zone's wall clock, whatever zone the visitor's machine is in", () =>
    // Already Tuesday morning in Tokyo.
    inTimeZone("Asia/Tokyo", () => {
      expect(nowIn("America/Chicago", new Date("2026-10-06T00:30:00Z"))).toBe("2026-10-05T19:30");
      expect(nowIn("America/Chicago", new Date("2026-10-06T05:05:00Z"))).toBe("2026-10-06T00:05"); // midnight is 00, not 24
    }));

  it("refuses a time of a date-only value rather than inventing midnight", () => {
    expect(() => formatTime("2026-10-09")).toThrow(/date-only/);
  });

  it("validates a calendar date: shape and a real day", () => {
    expect(isValidDate("2026-10-09")).toBe(true);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2026-1-9")).toBe(false);
    expect(isValidDate("2026-10-09T19:00:00-05:00")).toBe(false);
    expect(isValidDate("")).toBe(false);
  });

  it("formats for headings, rows, and event pages", () => {
    expect(formatDay("2026-10-09")).toBe("Fri Oct 9");
    expect(formatShort("2026-10-09")).toBe("Oct 9");
    expect(formatShort("2026-11-14")).toBe("Nov 14");
    expect(formatLong("2026-10-09")).toBe("Friday, October 9");
    expect(formatRange("2026-10-05", "2026-10-11")).toBe("Oct 5–11");
    expect(formatRange("2026-10-29", "2026-11-02")).toBe("Oct 29–Nov 2");
    expect(formatRange("2026-10-05", "2027-10-03")).toBe("Oct 5, 2026–Oct 3, 2027");
    expect(formatRange("2026-12-29", "2027-01-03")).toBe("Dec 29, 2026–Jan 3, 2027");
    expect(formatTime("2026-10-09T19:00:00-05:00")).toBe("7:00 pm");
    expect(formatTime("2026-10-09T12:30:00-05:00")).toBe("12:30 pm");
    expect(formatTime("2026-10-09T00:15:00-05:00")).toBe("12:15 am");
    expect(isDateOnly("2026-10-09")).toBe(true);
    expect(isDateOnly("2026-10-09T19:00:00-05:00")).toBe(false);
  });
});
