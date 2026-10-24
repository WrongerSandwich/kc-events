import { describe, expect, it } from "vitest";
import type { Event } from "../src/dataset.js";
import type { ExtractionContext } from "../src/extraction.js";
import {
  eventKey,
  HARD_CASES,
  measureSetups,
  renderComparison,
  renderSetups,
  scoreModels,
  trialEvent,
  trialSighting,
  type HardCase,
  type ReadSetup,
  type Trial,
  type TrialEvent,
  type TrialSighting,
} from "../src/model-compare.js";
import { testConfig } from "./fakes/config.js";

const PAGE = "https://example.org/events/";

function ev(title: string, overrides: Partial<TrialEvent> = {}): TrialEvent {
  return { title, start: "2026-11-01T20:00:00-05:00", venue: "The Hall", recurrence: "one-off", kind: "music", status: "active", primaryUrl: PAGE, ...overrides };
}

function trial(model: string, repeat: number, events: TrialEvent[] | undefined, overrides: Partial<Trial> = {}): Trial {
  return { model, page: `Hall ${PAGE}`, source: "Hall", repeat, costUsd: 0.002, ms: 1000, ...(events ? { events, extracted: events.length } : {}), ...overrides };
}

function stored(title: string, overrides: Partial<Event> = {}): Event {
  return {
    id: `evt_${title}`,
    title,
    start: "2026-11-01T20:00:00-05:00",
    venue: "The Hall",
    neighborhood: "Crossroads",
    primaryUrl: PAGE,
    kind: "music",
    recurrence: "one-off",
    dontMiss: false,
    firstSeen: "2026-10-01T00:00:00-05:00",
    status: "active",
    verificationFailures: 0,
    consecutiveOutages: 0,
    lead: { lane: "registry", source: "Hall" },
    evidence: { date: "Nov 1", venue: "The Hall" },
    ...overrides,
  } as Event;
}

const score = (trials: Trial[], dataset: Event[] = [], cases: HardCase[] = []) => scoreModels(["m"], trials, dataset, cases)[0]!;

describe("scoreModels", () => {
  it("rates quotes on the page among the citable candidates only", () => {
    const s = score([trial("m", 0, [ev("A"), ev("B", { status: "unverified", quoteProblem: 'quoted "x" for its venue' }), ev("C", { status: "unverified" })])]);
    expect(s).toMatchObject({ verified: 1, quoteMisses: 1, uncited: 1, quotePassRate: 0.5 });
  });

  it("scores failed calls for cost and count but nothing else", () => {
    const s = score([trial("m", 0, [ev("A")]), trial("m", 1, undefined, { error: "Request timed out.", costUsd: 0.001 })]);
    expect(s).toMatchObject({ calls: 2, failed: 1, failures: { "Request timed out.": 1 }, eventsPerPage: 1, costPerPage: 0.002 });
    expect(s.costUsd).toBeCloseTo(0.003);
  });

  it("measures how far repeats of one page find the same events, and read them alike", () => {
    const s = score([
      trial("m", 0, [ev("A"), ev("B")]),
      trial("m", 1, [ev("A"), ev("B", { venue: "Elsewhere" })]),
      trial("m", 2, [ev("A")]),
    ]);
    // Pairs: {A,B}-{A,B} 1, {A,B}-{A} 0.5, {A,B}-{A} 0.5.
    expect(s.setStability).toBeCloseTo(2 / 3);
    // A read alike three times; B read twice, with two venues.
    expect(s.fieldStability).toBe(0.5);
  });

  it("compares repeats with each other, not a page that lists one event twice with itself", () => {
    const s = score([trial("m", 0, [ev("A"), ev("A", { start: "2026-11-01" })])]);
    expect(s.fieldStability).toBeNaN();
    expect(score([trial("m", 0, [ev("A"), ev("A", { venue: "X" })]), trial("m", 1, [ev("A")])]).fieldStability).toBe(1);
  });

  it("keys an event by title and first date, so a moved date is another event", () => {
    expect(eventKey(ev("The Show"))).toBe(eventKey(ev("the show", { start: "2026-11-01" })));
    expect(eventKey(ev("The Show"))).not.toBe(eventKey(ev("The Show", { start: "2026-11-02T20:00:00-06:00" })));
    expect(eventKey(ev("Market", { start: undefined, recurrence: "recurring" }))).toBe("market|recurring");
  });

  it("compares verified readings with the stored record of the same page and title, and lists each disagreement", () => {
    const s = score(
      [trial("m", 0, [ev("Lecture", { start: "2026-11-01T18:00:00-05:00" }), ev("Unknown"), ev("Lecture2", { status: "unverified" })]), trial("m", 1, [ev("Lecture", { start: "2026-11-01T18:00:00-05:00" })])],
      [stored("Lecture", { start: "2026-11-01T19:00:00-05:00" }), stored("Lecture2")],
    );
    expect(s.storedMatched).toBe(2);
    expect(s.storedAgreement).toEqual({ date: 1, time: 0, venue: 1, recurrence: 1 });
    expect(s.storedDisagreements).toEqual([{ title: "Lecture", field: "time", stored: "19:00", read: "18:00", times: 2 }]);
  });

  it("counts an end on the start's own day as no end, against the stored record and between repeats", () => {
    const sameDayEnd = ev("A", { end: "2026-11-01T22:00:00-05:00" });
    const s = score([trial("m", 0, [sameDayEnd]), trial("m", 1, [ev("A")])], [stored("A")]);
    expect(s.storedAgreement.date).toBe(1);
    expect(s.fieldStability).toBe(1);
  });

  it("counts a failed call on a hard case's page as a miss", () => {
    const market: HardCase = { label: "Market", matches: (e) => e.title === "Market", problem: () => undefined };
    const s = score([trial("m", 0, [ev("Market")]), trial("m", 1, undefined, { error: "Request timed out." })], [], [market]);
    expect(s.hardCases[0]).toEqual({ label: "Market", read: 2, right: 1, misses: { "call failed": 1 } });
  });

  it("scores a hard case on every page any model found it on, so a model that never finds it misses there", () => {
    const market: HardCase = {
      label: "Market",
      matches: (e) => e.title === "Market",
      problem: (e) => (e.recurrence === "limited-run" ? undefined : `read as ${e.recurrence}`),
    };
    const trials = [
      trial("good", 0, [ev("Market", { recurrence: "limited-run" })]),
      trial("good", 1, [ev("Market", { status: "unverified", quoteProblem: 'quoted "x" for its venue' })]),
      trial("bad", 0, [ev("Other")]),
      trial("bad", 1, [ev("Market", { recurrence: "recurring" })]),
    ];
    const [good, bad] = scoreModels(["good", "bad"], trials, [], [market]);
    expect(good!.hardCases[0]).toEqual({ label: "Market", read: 2, right: 1, misses: { 'unverified (quoted "x" for its venue)': 1 } });
    expect(bad!.hardCases[0]).toEqual({ label: "Market", read: 2, right: 0, misses: { "not found": 1, "read as recurring": 1 } });
  });
});

describe("HARD_CASES", () => {
  const find = (label: string) => HARD_CASES.find((c) => c.label.startsWith(label))!;
  const crossroads = "https://kccrossroads.org/";

  it("wants the Secret Show as its dated run with no days", () => {
    const secret = find("Secret Show");
    const right = ev("The Secret Show", { primaryUrl: crossroads, recurrence: "limited-run", start: "2026-10-02", end: "2027-02-05" });
    expect(secret.matches(right)).toBe(true);
    expect(secret.problem(right)).toBeUndefined();
    expect(secret.problem({ ...right, recurrence: "recurring", start: undefined, end: undefined, schedule: "First Friday" })).toMatch(/read as recurring/);
    expect(secret.problem({ ...right, days: ["Fri"] })).toBe("days Fri");
    expect(secret.matches({ ...right, primaryUrl: "https://example.org/" })).toBe(false);
  });

  it("wants Kenneth Spencer's start, not its doors", () => {
    const lecture = find("Kenneth Spencer");
    const at = (start: string) => ev("Kenneth Spencer Lecture: Tao Leigh Goffe", { primaryUrl: "https://www.liberty-hall.com/upcoming-events", start });
    expect(lecture.problem(at("2026-11-09T19:00:00-06:00"))).toBeUndefined();
    expect(lecture.problem(at("2026-11-09T18:00:00-06:00"))).toBe("start 18:00");
    expect(lecture.problem(at("2026-11-09"))).toBe("start no time");
  });
});

describe("trialEvent", () => {
  it("keeps the scored fields and the quote problem's phrase", () => {
    const event = stored("A", { evidence: { date: "Nov 1", venue: "Hall" }, days: ["Sat"] });
    const t = trialEvent({ event, cancelled: false, quoteProblem: { phrase: 'quoted "Hall" for its venue', pageText: "long" } });
    expect(t).toEqual({
      title: "A",
      start: "2026-11-01T20:00:00-05:00",
      venue: "The Hall",
      recurrence: "one-off",
      days: ["Sat"],
      kind: "music",
      status: "active",
      primaryUrl: PAGE,
      quoteProblem: 'quoted "Hall" for its venue',
      dateEvidence: "Nov 1",
      venueEvidence: "Hall",
    });
  });
});

describe("renderComparison", () => {
  it("writes the summary, the hard cases and each model's disagreements, and says when the cap cut it short", () => {
    const scores = scoreModels(["a/one", "b/two"], [trial("a/one", 0, [ev("A")]), trial("b/two", 0, [ev("A", { venue: "Elsewhere" })])], [stored("A")], HARD_CASES);
    const md = renderComparison(scores, { date: "2026-10-23", pages: 1, sources: 1, repeats: 1, capUsd: 6, spentUsd: 0.004, capHit: true, unfetched: ["X (failed)"] });
    expect(md).toContain("# Extraction model comparison 2026-10-23");
    expect(md).toContain("**cap hit**");
    expect(md).toContain("cost $0.00 in all (each invocation capped at $6.00)");
    expect(md).toContain("Not fetched: X (failed).");
    expect(md).toMatch(/\| `a\/one` \| 100\.0% \|/);
    expect(md).toContain('- A: venue stored "the hall", read "elsewhere"');
    expect(md).toContain("Secret Show: dated monthly run, no days");
  });
});

describe("measureSetups", () => {
  const context: ExtractionContext = { config: testConfig(), rules: "", today: "2026-10-23", nowIso: "2026-10-23T12:00:00-05:00", neighborhoods: [] };
  const KEY = `Hall ${PAGE}`;
  const pages = [{ key: KEY, finalUrl: PAGE, quotable: "nov 1 the hall" }];
  const seen = (title: string, overrides: Partial<Event> = {}, quoteProblem?: string): TrialSighting => ({
    event: stored(title, { id: `evt_new_${title}`, firstSeen: context.nowIso, ...overrides }),
    cancelled: false,
    ...(quoteProblem !== undefined ? { quoteProblem } : {}),
  });
  const read = (model: string, repeat: number, sightings: TrialSighting[] | undefined, overrides: Partial<Trial> = {}): Trial =>
    trial(model, repeat, sightings?.map((s) => trialEvent({ event: s.event, cancelled: s.cancelled })), { ...(sightings ? { sightings } : {}), ...overrides });
  // Alpha's stored quotes are on the page; Beta's date quote is not.
  const dataset = [stored("Alpha"), stored("Beta", { start: "2026-11-02T20:00:00-05:00", evidence: { date: "Nov 2", venue: "The Hall" } })];
  const measure = (setups: ReadSetup[], trials: Trial[]) => measureSetups(setups, trials, dataset, pages, context);

  it("merges each draw's readings of a page through the run's merge and counts what became of the stored records", () => {
    const trials = [
      read("a", 0, [seen("Alpha")]),
      read("a", 1, [seen("Beta", { start: "2026-11-02T20:00:00-05:00" })]),
      read("b", 0, [seen("Beta", { start: "2026-11-02T20:00:00-05:00", status: "unverified" }, 'quoted "x" for its venue')]),
      read("b", 1, [seen("Alpha")]),
    ];
    const [single, twice, pair] = measure(
      [
        { label: "a", models: ["a"] },
        { label: "a ×2", models: ["a", "a"] },
        { label: "a + b", models: ["a", "b"] },
      ],
      trials,
    );
    // One read finds one of the two each time; the other takes a strike.
    expect(single).toMatchObject({ label: "a", draws: 2, storedOnPages: 2, verified: 1, unsighted: 1, madeUnverified: 0, newRecords: 0 });
    // Two reads of a: repeats 0 and 1 together find both.
    expect(twice).toMatchObject({ draws: 1, verified: 2, unsighted: 0 });
    // a 0 + b 0: Alpha verified, Beta's own page read with a quote not on it, so held unverified. a 1 + b 1: Beta and Alpha verified.
    expect(pair).toMatchObject({ draws: 2, verified: 1.5, madeUnverified: 0.5, unsighted: 0 });
  });

  it("keeps an event on its stored citation when a read's quote fails but the stored quotes are on the page", () => {
    const trials = [read("a", 0, []), read("b", 0, [seen("Alpha", { status: "unverified" }, 'quoted "x" for its venue')])];
    const [pair] = measure([{ label: "a + b", models: ["a", "b"] }], trials);
    expect(pair).toMatchObject({ verified: 0, kept: 1, madeUnverified: 0, unsighted: 1 });
  });

  it("counts new records, and the ones beside a record of the same page, day and name as identity churn", () => {
    const trials = [
      read("a", 0, [seen("Alpha"), seen("Gamma", { start: "2026-11-05T20:00:00-05:00" })]),
      read("b", 0, [seen("Support Act One, Alpha"), seen("Gamma", { start: "2026-11-05T20:00:00-05:00" })]),
    ];
    const [pair] = measure([{ label: "a + b", models: ["a", "b"] }], trials);
    // Gamma is new once (b's reading confirms a's); b's bill, headliner last, starts a second Alpha.
    expect(pair).toMatchObject({ verified: 1, newRecords: 2, churn: 1, retitled: 0, folded: 0 });
  });

  it("counts a record the second read verified as verified, though the first read's quote failed", () => {
    const beta = { start: "2026-11-02T20:00:00-05:00" };
    const trials = [read("a", 0, [seen("Beta", { ...beta, status: "unverified" }, 'quoted "x" for its venue')]), read("b", 0, [seen("Beta", beta)])];
    const [pair] = measure([{ label: "a + b", models: ["a", "b"] }], trials);
    expect(pair).toMatchObject({ verified: 1, madeUnverified: 0, unsighted: 1 });
  });

  it("does not count as churn a second record of one title on another day, as a play stored night by night has (#228)", () => {
    const trials = [read("a", 0, [seen("Beta", { start: "2026-11-02T20:00:00-05:00" })]), read("b", 0, [seen("Beta", { start: "2026-11-20T20:00:00-05:00" })])];
    const [pair] = measure([{ label: "a + b", models: ["a", "b"] }], trials);
    expect(pair).toMatchObject({ verified: 1, newRecords: 1, churn: 0 });
  });

  it("counts a stored record a reading retitled, which only the first read of a page can do", () => {
    // Matched on its own page and date under a title that is no form of the stored one.
    const eventUrl = "https://example.org/events/alpha";
    const trials = [read("a", 0, [seen("Alpha", { eventUrl })]), read("b", 0, [seen("The Big Night", { eventUrl })])];
    const [first, second] = measureSetups(
      [
        { label: "b + a", models: ["b", "a"] },
        { label: "a + b", models: ["a", "b"] },
      ],
      trials,
      [stored("Alpha", { eventUrl })],
      pages,
      context,
    );
    expect(first).toMatchObject({ verified: 1, newRecords: 0, retitled: 1 });
    expect(second).toMatchObject({ verified: 1, newRecords: 0, retitled: 0 });
  });

  it("adds the draw's costs, and times two reads of a page one after the other and side by side", () => {
    const trials = [read("a", 0, [], { costUsd: 0.002, ms: 20_000 }), read("b", 0, [], { costUsd: 0.004, ms: 40_000 })];
    const [pair] = measure([{ label: "a + b", models: ["a", "b"] }], trials);
    expect(pair!.costUsd).toBeCloseTo(0.006);
    expect(pair!.serialMinutes).toBeCloseTo(1);
    expect(pair!.parallelMinutes).toBeCloseTo(40 / 60);
  });

  it("leaves out trials saved without their sightings, and a set-up with no draw scores nothing", () => {
    const [single] = measure([{ label: "a", models: ["a"] }], [trial("a", 0, [ev("Alpha")])]);
    expect(single).toMatchObject({ draws: 0 });
    expect(single!.verified).toBeNaN();
  });

  it("counts a failed call's cost and time, and reads nothing from it", () => {
    const [twice] = measure([{ label: "a ×2", models: ["a", "a"] }], [read("a", 0, [seen("Alpha")]), read("a", 1, [], { error: "Request timed out.", events: undefined })]);
    expect(twice).toMatchObject({ draws: 1, verified: 1, unsighted: 1 });
    expect(twice!.costUsd).toBeCloseTo(0.004);
  });

  it("renders the set-ups side by side", () => {
    const md = renderSetups(measure([{ label: "a", models: ["a"] }], [read("a", 0, [seen("Alpha")])]));
    expect(md).toContain("## Two reads");
    expect(md).toMatch(/\| a \| 1 \| 2 \| 50\.0% \|/);
  });
});

describe("trialSighting", () => {
  it("keeps the sighting with the quote problem's phrase and not the page text", () => {
    const event = stored("A");
    expect(trialSighting({ event, cancelled: false, quoteProblem: { phrase: "p", pageText: "long" } })).toEqual({ event, cancelled: false, quoteProblem: "p" });
  });
});
