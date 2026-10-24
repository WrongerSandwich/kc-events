import { describe, expect, it } from "vitest";
import { emptyDataset, type Dataset, type Event } from "../src/dataset.js";
import { likelyDuplicate, likelyDuplicatePairs } from "../src/likely-duplicates.js";
import { renderReportMarkdown } from "../src/report.js";
import { testConfig } from "./fakes/config.js";
import { knuckleheads, PAGE, reply, WEEK_1 } from "./fakes/fixtures.js";
import { runWith } from "./fakes/run.js";

const SEEN = "2026-10-01T16:05:31-05:00";
const ALIASES = { "Kansas City Zoo": ["Kansas City Zoo & Aquarium"] };
const config = testConfig({ venueAliases: ALIASES });

let nextId = 0;
/** An active one-off read from this page unless overridden. */
function event(title: string, venue: string | undefined, primaryUrl: string, start: string | undefined, overrides: Partial<Event> = {}): Event {
  return {
    id: `evt_${String(++nextId).padStart(12, "0")}`,
    title,
    ...(start !== undefined ? { start } : {}),
    ...(venue !== undefined ? { venue } : {}),
    neighborhood: "Crossroads",
    primaryUrl,
    kind: "art",
    recurrence: "one-off",
    dontMiss: false,
    firstSeen: SEEN,
    lastVerified: SEEN,
    lastChanged: SEEN,
    lastJudged: SEEN,
    status: "active",
    verificationFailures: 0,
    consecutiveOutages: 0,
    lead: { lane: "registry", source: "Somewhere" },
    evidence: { ...(start !== undefined ? { date: start } : {}), ...(venue !== undefined ? { venue } : {}) },
    ...overrides,
  };
}

const CHARLOTTE = "https://www.charlottestreet.org/events";
const ZOO_EVENTS = "https://kansascityzoo.org/events/";
const ZOO_HOME = "https://kansascityzoo.org/";
const CLAY = "https://www.clayandcocktails.test/calendar";

/** The two pairs the #228 triage found in the committed dataset, and #227's Pottery & Pinot. */
const charlotte = () => [
  event("Artist Market @ Rooms We Carry Opening Reception", "Charlotte Street", CHARLOTTE, "2026-11-21T15:00:00-06:00"),
  event("Rooms We Carry Opening Reception", "Charlotte Street", CHARLOTTE, "2026-11-21T15:00:00-06:00"),
];
const gloWild = () => [
  event("GloWild", "Kansas City Zoo", ZOO_EVENTS, "2026-10-01", { recurrence: "limited-run", end: "2026-12-27" }),
  event("GloWild", "Kansas City Zoo & Aquarium", ZOO_HOME, "2026-11-01", { recurrence: "limited-run", end: "2026-11-30" }),
];
const potteryAndPinot = () => [
  event("Pottery & Pinot", "Clay & Cocktails", CLAY, "2026-07-25", { recurrence: "limited-run", end: "2026-12-19" }),
  event("Pottery & Pinot", "Clay & Cocktails", CLAY, "2026-10-24T18:00:00-05:00"),
];

describe("likelyDuplicate", () => {
  it("lists one night's records on one page under a title one contains (Charlotte Street)", () => {
    const [a, b] = charlotte();
    expect(likelyDuplicate(a!, b!, ALIASES)).toBe(true);
    expect(likelyDuplicate(b!, a!, ALIASES)).toBe(true);
  });

  it("lists one title at one venue on two pages, one span inside the other (GloWild)", () => {
    const [a, b] = gloWild();
    expect(likelyDuplicate(a!, b!, ALIASES)).toBe(true);
    expect(likelyDuplicate(b!, a!, ALIASES)).toBe(true);
  });

  it("lists a one-off beside a run of the same title that covers its day (Pottery & Pinot)", () => {
    const [run, night] = potteryAndPinot();
    expect(likelyDuplicate(run!, night!, ALIASES)).toBe(true);
    expect(likelyDuplicate(night!, run!, ALIASES)).toBe(true);
  });

  it("does not list a one-off the same-titled run does not cover", () => {
    const [run] = potteryAndPinot();
    const later = event("Pottery & Pinot", "Clay & Cocktails", CLAY, "2027-01-09");
    expect(likelyDuplicate(run!, later, ALIASES)).toBe(false);
  });

  it("does not list two shows of one night under different names, neither containing the other", () => {
    const a = event("Endrid", "Knuckleheads", CHARLOTTE, "2026-11-21T20:00:00-06:00");
    const b = event("Poets Mortis", "Knuckleheads", CHARLOTTE, "2026-11-21T20:00:00-06:00");
    expect(likelyDuplicate(a, b, ALIASES)).toBe(false);
  });

  it("does not list two nights of one play stored as one-offs", () => {
    const a = event("Hamlet", "The Coterie", CHARLOTTE, "2026-11-20T19:30:00-06:00");
    const b = event("Hamlet", "The Coterie", CHARLOTTE, "2026-11-21T19:30:00-06:00");
    expect(likelyDuplicate(a, b, ALIASES)).toBe(false);
  });

  it("does not list records on different pages at different venues", () => {
    const a = event("Rooms We Carry Opening Reception", "Charlotte Street", CHARLOTTE, "2026-11-21T15:00:00-06:00");
    const b = event("Rooms We Carry Opening Reception", "Kansas City Zoo", ZOO_EVENTS, "2026-11-21T15:00:00-06:00");
    const c = event("GloWild", "Charlotte Street", CHARLOTTE, "2026-11-05");
    expect(likelyDuplicate(a, b, ALIASES)).toBe(false);
    expect(likelyDuplicate(gloWild()[0]!, c, ALIASES)).toBe(false);
  });

  it("counts two recurring records under a contained title, but not a recurring record beside a dated one", () => {
    const weekly = (title: string) => event(title, "Charlotte Street", CHARLOTTE, undefined, { recurrence: "recurring", schedule: "Every Friday" });
    expect(likelyDuplicate(weekly("Open Studio"), weekly("Open Studio Night"), ALIASES)).toBe(true);
    const dated = event("Open Studio Night", "Charlotte Street", CHARLOTTE, "2026-11-20");
    expect(likelyDuplicate(weekly("Open Studio"), dated, ALIASES)).toBe(false);
    expect(likelyDuplicate(weekly("Open Studio Night"), dated, ALIASES)).toBe(false);
  });

  it("never counts an empty title", () => {
    const a = event(" ", "Charlotte Street", CHARLOTTE, "2026-11-21");
    const b = event("Rooms We Carry", "Charlotte Street", CHARLOTTE, "2026-11-21");
    expect(likelyDuplicate(a, b, ALIASES)).toBe(false);
    expect(likelyDuplicate(a, { ...a, id: "evt_other" }, ALIASES)).toBe(false);
  });
});

describe("likelyDuplicatePairs", () => {
  it("lists every pair among the records once, in dataset order, and none for a record alone", () => {
    const [a, b] = charlotte();
    const [c, d] = gloWild();
    expect(likelyDuplicatePairs([a!, c!, b!, d!], ALIASES).map(([x, y]) => [x.id, y.id])).toEqual([
      [a!.id, b!.id],
      [c!.id, d!.id],
    ]);
    expect(likelyDuplicatePairs([a!], ALIASES)).toEqual([]);
  });
});

/** A run whose only registry page lists nothing; every other page is down, so re-verification holds what it checks. */
const quietRun = (dataset: Dataset) =>
  runWith(WEEK_1, dataset, { sources: [knuckleheads], pages: { [knuckleheads.urls[0]!]: PAGE }, completions: [reply()], config });
const withEvents = (events: Event[]): Dataset => ({ ...emptyDataset(), events });

describe("the run's likely duplicates", () => {
  it("lists a pair no rule folds and leaves both records as they were, but not a pair the fold joins", async () => {
    const [market, reception] = charlotte();
    const twin = event("Rooms We Carry Opening Reception", "Charlotte Street", CHARLOTTE, "2026-11-21T15:00:00-06:00", { firstSeen: "2026-10-01T21:00:00-05:00" });
    const { dataset, report } = await quietRun(withEvents([market!, reception!, twin]));

    const after = new Map(dataset.events.map((e) => [e.id, e]));
    expect(after.get(twin.id)).toMatchObject({ status: "expired", expiryReason: "duplicate" });
    // Each record of the pair comes out as a run without the other makes it.
    const apart = new Map([...(await quietRun(withEvents([market!]))).dataset.events, ...(await quietRun(withEvents([reception!, twin]))).dataset.events].map((e) => [e.id, e]));
    expect(after.get(market!.id)).toEqual(apart.get(market!.id));
    expect(after.get(reception!.id)).toEqual(apart.get(reception!.id));
    expect(after.get(market!.id)).toMatchObject({ status: "active", title: market!.title, start: market!.start });
    expect(report.likelyDuplicates).toEqual([
      {
        a: { id: market!.id, title: market!.title, primaryUrl: CHARLOTTE, firstDay: "2026-11-21" },
        b: { id: reception!.id, title: reception!.title, primaryUrl: CHARLOTTE, firstDay: "2026-11-21" },
      },
    ]);
    const markdown = renderReportMarkdown(report);
    expect(markdown).toContain("## Likely duplicates");
    expect(markdown).toContain(
      `- Artist Market @ Rooms We Carry Opening Reception (${market!.id}, 2026-11-21, ${CHARLOTTE}) and Rooms We Carry Opening Reception (${reception!.id}, 2026-11-21, ${CHARLOTTE})`,
    );
  });

  it("shows each run's span in the report", async () => {
    const [zoo, home] = gloWild();
    const { report } = await quietRun(withEvents([zoo!, home!]));
    expect(report.likelyDuplicates).toEqual([
      {
        a: { id: zoo!.id, title: "GloWild", primaryUrl: ZOO_EVENTS, firstDay: "2026-10-01", lastDay: "2026-12-27" },
        b: { id: home!.id, title: "GloWild", primaryUrl: ZOO_HOME, firstDay: "2026-11-01", lastDay: "2026-11-30" },
      },
    ]);
    expect(renderReportMarkdown(report)).toContain(`- GloWild (${zoo!.id}, 2026-10-01 to 2026-12-27, ${ZOO_EVENTS}) and GloWild (${home!.id}, 2026-11-01 to 2026-11-30, ${ZOO_HOME})`);
  });

  it("says there are none when no pair is likely", async () => {
    const { report } = await quietRun(withEvents([charlotte()[0]!]));
    expect(report.likelyDuplicates).toEqual([]);
    expect(renderReportMarkdown(report)).toMatch(/## Likely duplicates\n\n_None\._/);
  });
});
