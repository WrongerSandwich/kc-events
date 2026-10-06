import { describe, expect, it } from "vitest";
import { dateRange, matches } from "../src/lib/filter";
import { DEFAULT_FILTERS, type Filters } from "../src/lib/query";
import { event } from "./fixtures/event";

const today = "2026-10-05"; // a Monday
const f = (over: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, ...over });
const none = new Set<string>();

describe("dateRange", () => {
  it("turns presets into inclusive ranges from today", () => {
    expect(dateRange({ preset: "all" }, today)).toBeUndefined();
    expect(dateRange({ preset: "today" }, today)).toEqual({ from: today, to: today });
    expect(dateRange({ preset: "weekend" }, today)).toEqual({ from: today, to: "2026-10-11" });
    expect(dateRange({ preset: "weekend" }, "2026-10-11")).toEqual({ from: "2026-10-11", to: "2026-10-11" });
    expect(dateRange({ preset: "7d" }, today)).toEqual({ from: today, to: "2026-10-12" });
    expect(dateRange({ preset: "30d" }, today)).toEqual({ from: today, to: "2026-11-04" });
    expect(dateRange({ from: "2026-10-09", to: "2026-10-11" }, today)).toEqual({ from: "2026-10-09", to: "2026-10-11" });
  });

  it("turns This weekend into the coming Friday to Sunday, or today to Sunday once the weekend has begun", () => {
    const weekend = { preset: "fri-sun" } as const;
    expect(dateRange(weekend, "2026-10-05")).toEqual({ from: "2026-10-09", to: "2026-10-11" }); // Mon
    expect(dateRange(weekend, "2026-10-08")).toEqual({ from: "2026-10-09", to: "2026-10-11" }); // Thu
    expect(dateRange(weekend, "2026-10-09")).toEqual({ from: "2026-10-09", to: "2026-10-11" }); // Fri
    expect(dateRange(weekend, "2026-10-10")).toEqual({ from: "2026-10-10", to: "2026-10-11" }); // Sat
    expect(dateRange(weekend, "2026-10-11")).toEqual({ from: "2026-10-11", to: "2026-10-11" }); // Sun
    expect(dateRange(weekend, "2026-10-28")).toEqual({ from: "2026-10-30", to: "2026-11-01" }); // Wed, into the DST Sunday
  });
});

describe("matches", () => {
  const show = event({ start: "2026-10-09T19:00:00-05:00" });
  const run = event({ id: "run", recurrence: "limited-run", start: "2026-09-20", end: "2026-10-20", kind: "art/exhibitions", region: "Lawrence", neighborhood: "Lawrence", venue: "Spencer Museum" });
  const runNoStart = event({ id: "nostart", recurrence: "limited-run", start: undefined, end: "2026-10-31" });
  const trivia = event({ id: "trivia", recurrence: "recurring", start: undefined, schedule: "Tuesdays", title: "Pub trivia" });
  const flagged = event({ id: "flag", dontMiss: true, whyLine: "A rare touring occasion for Kansas City." });

  it("matches everything by default, except recurring events", () => {
    expect(matches(show, f(), today, none)).toBe(true);
    expect(matches(trivia, f(), today, none)).toBe(false);
    expect(matches(trivia, f({ recurring: true }), today, none)).toBe(true);
  });

  it("intersects a span with the date range; recurring events ignore it", () => {
    expect(matches(show, f({ when: { preset: "weekend" } }), today, none)).toBe(true);
    expect(matches(show, f({ when: { preset: "today" } }), today, none)).toBe(false);
    expect(matches(run, f({ when: { preset: "weekend" } }), today, none)).toBe(true);
    expect(matches(run, f({ when: { from: "2026-10-21", to: "2026-10-31" } }), today, none)).toBe(false);
    expect(matches(run, f({ when: { from: "2026-10-20", to: "2026-10-31" } }), today, none)).toBe(true);
    expect(matches(runNoStart, f({ when: { preset: "today" } }), today, none)).toBe(true);
    expect(matches(runNoStart, f({ when: { from: "2026-11-01", to: "2026-11-30" } }), today, none)).toBe(false);
    expect(matches(trivia, f({ recurring: true, when: { preset: "today" } }), today, none)).toBe(true);
  });

  it("matches the weekend preset on a Sunday only for today", () => {
    const sunday = "2026-10-11";
    const weekend = f({ when: { preset: "weekend" } });
    expect(matches(event({ id: "sun", start: "2026-10-11T19:00:00-05:00" }), weekend, sunday, none)).toBe(true);
    expect(matches(event({ id: "mon", start: "2026-10-12T19:00:00-05:00" }), weekend, sunday, none)).toBe(false);
    expect(matches(event({ id: "sat", start: "2026-10-10T19:00:00-05:00" }), weekend, sunday, none)).toBe(false); // past
  });

  it("ORs within kind and region and ANDs across", () => {
    expect(matches(show, f({ kinds: ["music", "film"] }), today, none)).toBe(true);
    expect(matches(show, f({ kinds: ["film"] }), today, none)).toBe(false);
    expect(matches(run, f({ kinds: ["art/exhibitions"], regions: ["Central KC"] }), today, none)).toBe(false);
    expect(matches(run, f({ kinds: ["art/exhibitions"], regions: ["Central KC", "Lawrence"] }), today, none)).toBe(true);
  });

  it("filters don't-miss and saved", () => {
    expect(matches(show, f({ dontMiss: true }), today, none)).toBe(false);
    expect(matches(flagged, f({ dontMiss: true }), today, none)).toBe(true);
    expect(matches(show, f({ saved: true }), today, none)).toBe(false);
    expect(matches(show, f({ saved: true }), today, new Set([show.id]))).toBe(true);
  });

  it("searches title, venue, neighborhood, and why-line, every term somewhere", () => {
    expect(matches(flagged, f({ q: "touring" }), today, none)).toBe(true);
    expect(matches(flagged, f({ q: "RECORDBAR touring" }), today, none)).toBe(true);
    expect(matches(flagged, f({ q: "crossroads" }), today, none)).toBe(true);
    expect(matches(flagged, f({ q: "touring opera" }), today, none)).toBe(false);
    expect(matches(show, f({ q: "" }), today, none)).toBe(true);
  });

  it("never matches a past event", () => {
    expect(matches(show, f(), "2026-10-10", none)).toBe(false);
  });
});
