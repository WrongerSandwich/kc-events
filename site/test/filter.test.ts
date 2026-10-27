import { describe, expect, it } from "vitest";
import { dateRange, dayPresets, facetCounts, keepGoing, matches, railPresets, shownPreset } from "../src/lib/filter";
import { DEFAULT_FILTERS, EVERY_DATE, type Filters } from "../src/lib/query";
import { event } from "./fixtures/event";

const today = "2026-10-05"; // a Monday
// Every date unless a test says otherwise; the explorer's default is the week (#183).
const f = (over: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, when: EVERY_DATE, ...over });
const none = new Set<string>();

describe("dateRange", () => {
  it("turns presets into inclusive ranges from today", () => {
    expect(dateRange({ preset: "all" }, today)).toBeUndefined();
    expect(dateRange({ preset: "today" }, today)).toEqual({ from: today, to: today });
    expect(dateRange({ preset: "weekend" }, today)).toEqual({ from: today, to: "2026-10-11" });
    expect(dateRange({ preset: "weekend" }, "2026-10-11")).toEqual({ from: "2026-10-11", to: "2026-10-11" });
    expect(dateRange({ preset: "7d" }, today)).toEqual({ from: today, to: "2026-10-11" }); // seven days, today among them
    expect(dateRange({ preset: "30d" }, today)).toEqual({ from: today, to: "2026-11-03" });
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

describe("dayPresets", () => {
  it("offers Friday, Saturday and Sunday from Thursday, each only while it is still to come and not today (#183)", () => {
    const week: [string, string[]][] = [
      ["2026-10-05", []], // Mon
      ["2026-10-06", []], // Tue
      ["2026-10-07", []], // Wed
      ["2026-10-08", ["2026-10-09", "2026-10-10", "2026-10-11"]], // Thu
      ["2026-10-09", ["2026-10-10", "2026-10-11"]], // Fri
      ["2026-10-10", ["2026-10-11"]], // Sat
      ["2026-10-11", []], // Sun
    ];
    for (const [day, presets] of week) expect(dayPresets(day), day).toEqual(presets);
    expect(dayPresets("2026-10-29")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]); // across a month, into the DST Sunday
  });
});


describe("railPresets and shownPreset", () => {
  it("offers each span of days once, the first preset that names it: the week is This weekend from Friday, Today on Sunday", () => {
    expect(railPresets("2026-10-05")).toEqual(["today", "fri-sun", "weekend", "30d", "all"]); // Monday: 7 days is the week
    expect(railPresets("2026-10-06")).toEqual(["today", "fri-sun", "weekend", "7d", "30d", "all"]);
    expect(railPresets("2026-10-09")).toEqual(["today", "fri-sun", "7d", "30d", "all"]); // Friday
    expect(railPresets("2026-10-10")).toEqual(["today", "fri-sun", "7d", "30d", "all"]); // Saturday
    expect(railPresets("2026-10-11")).toEqual(["today", "7d", "30d", "all"]); // Sunday
  });

  it("presses the offered preset with the same days, and none for a range", () => {
    expect(shownPreset({ preset: "weekend" }, "2026-10-09")).toBe("fri-sun");
    expect(shownPreset({ preset: "weekend" }, "2026-10-11")).toBe("today");
    expect(shownPreset({ preset: "7d" }, "2026-10-05")).toBe("weekend");
    expect(shownPreset({ preset: "30d" }, "2026-10-05")).toBe("30d");
    expect(shownPreset({ from: "2026-10-09", to: "2026-10-09" }, "2026-10-05")).toBeUndefined();
  });
});

describe("facetCounts", () => {
  it("counts each kind with the other kinds let in, and each region with the other regions, the rest as filtered", () => {
    const events = [
      event({ id: "a", start: "2026-10-09T19:00:00-05:00", kind: "music", region: "Central KC" }),
      event({ id: "b", start: "2026-10-10", kind: "film", region: "Lawrence" }),
      event({ id: "c", start: "2026-10-10", kind: "music", region: "Lawrence" }),
      event({ id: "d", start: "2026-11-20", kind: "film", region: "Lawrence" }), // past the week
    ];
    const { kinds, regions } = facetCounts(events, f({ when: { preset: "weekend" }, kinds: ["music"], regions: ["Lawrence"] }), today, none);
    expect(Object.fromEntries(kinds)).toEqual({ music: 1, film: 1 }); // in Lawrence, this week
    expect(Object.fromEntries(regions)).toEqual({ "Central KC": 1, Lawrence: 1 }); // music, this week
  });
});

describe("keepGoing", () => {
  const mon = event({ id: "mon", start: "2026-10-12T19:00:00-05:00" }); // next Monday
  const sun2 = event({ id: "sun2", start: "2026-10-18T19:00:00-05:00" }); // next Sunday
  const later = event({ id: "later", start: "2026-10-19T19:00:00-05:00" }); // the Monday after
  const sat = event({ id: "sat", start: "2026-10-10T19:00:00-05:00" }); // this Saturday
  const fair = event({ id: "fair", start: "2026-10-10", end: "2026-10-13" }); // in the week already, into the next
  const trivia = event({ id: "trivia", recurrence: "recurring", start: undefined, schedule: "Tuesdays" });
  const list = [mon, sun2, later, sat, fair, trivia];

  it("extends a bounded filter to the Sunday after its end, counting only the events that adds", () => {
    const k = keepGoing(list, f({ when: { preset: "weekend" } }), today, none)!;
    expect(k.next).toEqual(f({ when: { from: today, to: "2026-10-18" } }));
    expect(k.through).toBe("2026-10-18");
    expect(k.nextWeek).toBe(true);
    expect(k.added).toBe(2); // mon, sun2; fair was already in the week
    expect(k.everyDate).toEqual(f());
    expect(k.total).toBe(5);
  });

  it("follows the same rule from any end: Today on a Monday to this Sunday, a Saturday to the next Sunday", () => {
    expect(keepGoing(list, f({ when: { preset: "today" } }), today, none)).toMatchObject({ next: { when: { from: today, to: "2026-10-11" } }, nextWeek: false, added: 2 });
    const satOnly = keepGoing(list, f({ when: { from: "2026-10-10", to: "2026-10-10" } }), today, none)!;
    expect(satOnly).toMatchObject({ next: { when: { from: "2026-10-10", to: "2026-10-11" } }, added: 0 });
    expect(keepGoing(list, f({ when: { from: "2026-10-11", to: "2026-10-11" } }), today, none)).toMatchObject({ next: { when: { from: "2026-10-11", to: "2026-10-18" } }, added: 2 });
  });

  it("keeps the other filters, and counts every date's events with them, always-there included only when asked", () => {
    const k = keepGoing(list, f({ when: { preset: "weekend" }, recurring: true, q: "zzz" }), today, none)!;
    expect(k.next.q).toBe("zzz");
    expect(k).toMatchObject({ added: 0, total: 0 });
    expect(keepGoing(list, f({ when: { preset: "weekend" }, recurring: true }), today, none)!.total).toBe(6);
  });

  it("has nothing to extend under every date or a shortlist", () => {
    expect(keepGoing(list, f(), today, none)).toBeUndefined();
    expect(keepGoing(list, f({ when: { preset: "weekend" }, ids: ["evt_mon"] }), today, none)).toBeUndefined();
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

  it("searches the room too (#91)", () => {
    const hall = event({ venue: "Kauffman Center for the Performing Arts", room: "Helzberg Hall" });
    expect(matches(hall, f({ q: "helzberg" }), today, none)).toBe(true);
    expect(matches(hall, f({ q: "kauffman" }), today, none)).toBe(true);
  });

  it("searches kind and region too, and folds accents and case on both sides (#93)", () => {
    const cafe = event({ title: "Jazz at the Café", kind: "comedy", region: "Johnson County", neighborhood: "Overland Park" });
    expect(matches(cafe, f({ q: "comedy" }), today, none)).toBe(true);
    expect(matches(cafe, f({ q: "johnson county" }), today, none)).toBe(true);
    expect(matches(cafe, f({ q: "cafe" }), today, none)).toBe(true);
    expect(matches(cafe, f({ q: "CAFÉ" }), today, none)).toBe(true);
    expect(matches(run, f({ q: "art/exhibitions" }), today, none)).toBe(true);
    expect(matches(cafe, f({ q: "café opera" }), today, none)).toBe(false);
  });

  it("folds an accent inside a word, not only at its end (#193)", () => {
    const rolon = event({ title: "Carlos Rolón: All We Have Is Right Now" });
    const raices = event({ title: "Un campo con raíces" });
    expect(matches(rolon, f({ q: "rolon" }), today, none)).toBe(true);
    expect(matches(rolon, f({ q: "carlos rolon" }), today, none)).toBe(true);
    expect(matches(rolon, f({ q: "rolón" }), today, none)).toBe(true);
    expect(matches(raices, f({ q: "raices" }), today, none)).toBe(true);
  });

  it("never matches a past event, except a save in the saved view", () => {
    expect(matches(show, f(), "2026-10-10", none)).toBe(false);
    expect(matches(show, f(), "2026-10-10", new Set([show.id]))).toBe(false);
    expect(matches(show, f({ saved: true }), "2026-10-10", new Set([show.id]))).toBe(true);
    expect(matches(show, f({ saved: true }), "2026-10-10", none)).toBe(false);
  });
});
