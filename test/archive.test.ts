import { describe, expect, it } from "vitest";
import { emptyDataset, type Dataset, type Event } from "../src/dataset.js";
import { renderReportMarkdown } from "../src/report.js";
import { runWith } from "./fakes/run.js";
import { candidateAt, knuckleheads, PAGE, reply, source, week, WEEK_1_ISO, WEEK_2, WEEK_2_ISO } from "./fakes/fixtures.js";

const CALENDAR_URL = knuckleheads.urls[0]!;
const candidate = (overrides: Record<string, unknown> = {}) => candidateAt(knuckleheads, overrides);

let nextId = 0;
/** An event stored by an earlier run from the calendar, active unless overridden. */
function stored(title: string, overrides: Partial<Event> = {}): Event {
  return {
    id: `evt_${String(++nextId).padStart(12, "0")}`,
    title,
    start: "2026-10-31T20:00:00-05:00",
    venue: "Knuckleheads",
    neighborhood: "East Bottoms",
    primaryUrl: CALENDAR_URL,
    kind: "music",
    recurrence: "one-off",
    dontMiss: false,
    firstSeen: WEEK_1_ISO,
    lastVerified: WEEK_1_ISO,
    lastChanged: WEEK_1_ISO,
    lastJudged: WEEK_1_ISO,
    status: "active",
    verificationFailures: 0,
    consecutiveOutages: 0,
    lead: { lane: "registry", source: knuckleheads.name },
    evidence: { date: "Sat, Oct 31 · Doors 7:00 PM · Show 8:00 PM", venue: "Knuckleheads, 1 Main St" },
    ...overrides,
  };
}

const expired = (title: string, overrides: Partial<Event> = {}) => stored(title, { status: "expired", expiryReason: "past", ...overrides });

const runOver = (now: Date, dataset: Dataset, ...candidates: unknown[]) =>
  runWith(now, dataset, { sources: [knuckleheads], pages: { [CALENDAR_URL]: PAGE }, completions: [reply(...candidates)] });

/** The live dataset forgets what is long gone (#82): expired records older than eight weeks move to the archive. */
describe("archiving expired records", () => {
  // WEEK_2's run is on 2026-10-09, so eight weeks back is 2026-08-14.
  it("moves an expired record whose last day and last change are both more than eight weeks back, and keeps the rest", async () => {
    const events = [
      stored("Big Show"),
      expired("Summer Show", { start: "2026-07-01T20:00:00-05:00", lastChanged: "2026-07-02T22:15:00-05:00" }),
      expired("Long Run", { start: "2026-06-01", end: "2026-08-13", recurrence: "limited-run", lastChanged: "2026-07-02T22:15:00-05:00" }),
      expired("Struck Lately", { start: "2026-07-01T20:00:00-05:00", lastChanged: "2026-09-20T22:15:00-05:00", expiryReason: "two-strike" }),
      expired("Cancelled Winter Show", { start: "2026-12-01T20:00:00-05:00", lastChanged: "2026-07-02T22:15:00-05:00", expiryReason: "cancelled" }),
      expired("Edge Of The Window", { start: "2026-08-14T20:00:00-05:00", lastChanged: "2026-08-14T22:15:00-05:00" }),
      expired("Old Weekly Night", { start: undefined, schedule: "every Tuesday", recurrence: "recurring", lastChanged: undefined, firstSeen: "2026-06-01T22:15:00-05:00", expiryReason: "two-strike" }),
      stored("Old Unverified", { start: "2026-07-01T20:00:00-05:00", status: "unverified", lastChanged: "2026-07-02T22:15:00-05:00" }),
    ];

    const { dataset, archived, report } = await runOver(WEEK_2, { ...emptyDataset(), events }, candidate());

    expect(archived.map((e) => e.title)).toEqual(["Summer Show", "Long Run", "Old Weekly Night"]);
    expect(dataset.events.map((e) => e.title)).toEqual(["Big Show", "Struck Lately", "Cancelled Winter Show", "Edge Of The Window", "Old Unverified"]);
    expect(archived[0]).toEqual(events[1]);
    expect(report.counts.archived).toBe(3);
    expect(renderReportMarkdown(report)).toContain("| Archived: expired more than 8 weeks back | 3 |");
  });

  it("does not archive an event in the run that expires it", async () => {
    const events = [stored("Big Show"), stored("Summer Show", { start: "2026-07-01T20:00:00-05:00" })];

    const { dataset, archived } = await runOver(WEEK_2, { ...emptyDataset(), events }, candidate());

    expect(archived).toEqual([]);
    expect(dataset.events.find((e) => e.title === "Summer Show")).toMatchObject({ status: "expired", expiryReason: "past" });
  });
});

/** A record no reading ever verified, and no page lists any more, does not live forever (#82). */
describe("stale records", () => {
  /** Runs week(from)..week(to) in turn over the dataset, the calendar listing Big Show alone unless a run's candidates say otherwise. */
  async function runWeeks(dataset: Dataset, from: number, to: number, listed: (n: number) => unknown[] = () => [candidate()]) {
    const seen: Awaited<ReturnType<typeof runOver>>[] = [];
    for (let n = from; n <= to; n++) {
      const result = await runOver(week(n), dataset, ...listed(n));
      dataset = result.dataset;
      seen.push(result);
    }
    return seen;
  }

  const neverVerified = (title: string, overrides: Partial<Event> = {}) =>
    stored(title, { start: undefined, venue: undefined, status: "unverified", lastVerified: undefined, evidence: {}, ...overrides });

  it("a never-verified record no lane sights for four runs expires as stale, counted", async () => {
    const events = [stored("Big Show"), neverVerified("Something Undated")];

    const runs = await runWeeks({ ...emptyDataset(), events }, 2, 5);

    const record = ({ dataset }: { dataset: Dataset }) => dataset.events.find((e) => e.title === "Something Undated")!;
    expect(runs.map((r) => [record(r).status, record(r).runsUnsighted])).toEqual([
      ["unverified", 1],
      ["unverified", 2],
      ["unverified", 3],
      ["expired", undefined],
    ]);
    expect(record(runs[3]!).expiryReason).toBe("stale");
    expect(runs[3]!.report.counts.expired.stale).toBe(1);
    expect(renderReportMarkdown(runs[3]!.report)).toContain("| Expired: stale | 1 |");
  });

  it("a sighting, even an uncitable one, starts the count again", async () => {
    const events = [stored("Big Show"), neverVerified("Open Jam", { start: "2026-10-31T20:00:00-05:00" })];
    const uncitable = candidate({ title: "Open Jam", venue: null, venueEvidence: null });

    const runs = await runWeeks({ ...emptyDataset(), events }, 2, 5, (n) => (n === 4 ? [candidate(), uncitable] : [candidate()]));

    expect(runs.map((r) => r.dataset.events.find((e) => e.title === "Open Jam")!.runsUnsighted)).toEqual([1, 2, undefined, 1]);
  });

  it("a run in which its page could not be loaded says nothing, so it counts for nothing", async () => {
    const events = [stored("Big Show"), neverVerified("Something Undated", { runsUnsighted: 3 })];

    // Another source loads, so the run is not a dead network.
    const other = source("Other Venue");
    const { dataset } = await runWith(week(2), { ...emptyDataset(), events }, {
      sources: [knuckleheads, other],
      pages: { [CALENDAR_URL]: { status: 503, body: "" }, [other.urls[0]!]: PAGE },
      completions: [reply(candidateAt(other))],
    });

    expect(dataset.events.find((e) => e.title === "Something Undated")).toMatchObject({ status: "unverified", runsUnsighted: 3 });
  });

  it("a record verified once is re-verified instead, and never goes stale", async () => {
    const hidden = stored("Hidden Show", { status: "unverified", consecutiveOutages: 3 });
    const events = [stored("Big Show"), hidden];

    const runs = await runWeeks({ ...emptyDataset(), events }, 2, 2, () => [candidate(), candidate({ title: "Hidden Show" })]);

    expect(runs[0]!.dataset.events.find((e) => e.title === "Hidden Show")).not.toHaveProperty("runsUnsighted");
  });

  it("a discovery-led record does not age in a run with discovery off, which could not have sighted it", async () => {
    const events = [stored("Big Show"), neverVerified("Found Elsewhere", { primaryUrl: "https://promoter.test/x", lead: { lane: "discovery", query: "music events" }, heldForPromotion: true })];

    const runs = await runWeeks({ ...emptyDataset(), events }, 2, 2);

    expect(runs[0]!.dataset.events.find((e) => e.title === "Found Elsewhere")).not.toHaveProperty("runsUnsighted");
  });
});

describe("source state", () => {
  it("drops the state of a source no longer in the registry, and keeps an excluded one's", async () => {
    const excluded = { ...source("Gone Quiet"), status: "excluded" as const, reason: "asked us not to" };
    const dataset = {
      ...emptyDataset(),
      sourceState: { Knuckleheads: { consecutiveFailures: 1 }, "Gone Quiet": { consecutiveFailures: 2 }, "Removed Venue": { consecutiveFailures: 4 } },
    };

    const { dataset: after } = await runWith(WEEK_2, dataset, { sources: [knuckleheads, excluded], pages: { [CALENDAR_URL]: PAGE }, completions: [reply(candidate())] });

    expect(after.sourceState).toEqual({ Knuckleheads: { consecutiveFailures: 0 }, "Gone Quiet": { consecutiveFailures: 2 } });
  });
});

/** A re-reading that says the same thing in other whitespace or punctuation changes nothing stored (#82): the weekly diff is news, not noise. */
describe("stable readings", () => {
  const LISTING = {
    status: 200,
    body: `<html><body><div><a href="/shows/big-show">Big Show</a> Sat, Oct 31 · Doors 7:00 PM · Show 8:00 PM</div></body></html>`,
  };
  const reread = (known: Event, overrides: Record<string, unknown>) =>
    runWith(WEEK_2, { ...emptyDataset(), events: [known] }, { sources: [knuckleheads], pages: { [CALENDAR_URL]: LISTING }, completions: [reply(candidate({ eventLink: 1, ...overrides }))] });

  it("keeps the stored title and description that differ only in whitespace and punctuation, the same own page, and quotes the page check cannot tell apart", async () => {
    const known = stored("Big Show!", {
      description: "A big show, with friends.",
      eventUrl: "https://knuckleheads.test/shows/big-show/",
      evidence: { date: "Sat, Oct 31 · Doors 7:00 PM · Show 8:00 PM", venue: "Knuckleheads, 1 Main St" },
    });

    const { dataset } = await reread(known, {
      title: "Big  Show",
      description: "A big show with friends",
      dateEvidence: "Sat, Oct 31 ·  Doors 7:00 PM ·\nShow 8:00 PM",
      venueEvidence: "KNUCKLEHEADS, 1 Main St",
    });

    expect(dataset.events[0]).toMatchObject({
      title: "Big Show!",
      description: "A big show, with friends.",
      eventUrl: "https://knuckleheads.test/shows/big-show/",
      evidence: { date: "Sat, Oct 31 · Doors 7:00 PM · Show 8:00 PM", venue: "Knuckleheads, 1 Main St" },
      lastVerified: WEEK_2_ISO,
    });
  });

  it("takes a quote with other punctuation, which the page check would not take for the stored one, once the stored one is off the page (#251)", async () => {
    const known = stored("Big Show", { evidence: { date: "Saturday, Oct 31", venue: "Knuckleheads, 1 Main St" } });

    const { dataset } = await reread(known, { dateEvidence: "Sat, Oct 31 Doors 7:00 PM Show 8:00 PM" });

    expect(dataset.events[0]!.evidence.date).toBe("Sat, Oct 31 Doors 7:00 PM Show 8:00 PM");
  });

  it("takes an own page that is another page, however alike its URL reads", async () => {
    const known = stored("Big Show", { eventUrl: "https://knuckleheads.test/showsbig/show" });

    const { dataset } = await reread(known, {});

    expect(dataset.events[0]!.eventUrl).toBe("https://knuckleheads.test/shows/big-show");
  });

  it("takes the new values when the words change, or their case", async () => {
    // A stored listing line gives way to a longer one (#251), and a stored quote off the page to the reading's.
    const known = stored("Big Show", {
      description: "A big show.",
      eventUrl: "https://knuckleheads.test/shows/old-page",
      evidence: { date: "Saturday, Oct 31", venue: "Knuckleheads, 1 Main St" },
    });

    const { dataset } = await reread(known, { title: "BIG SHOW", description: "A big show, late.", dateEvidence: "Sat, Oct 31 · Show 8:00 PM" });

    expect(dataset.events[0]).toMatchObject({
      title: "BIG SHOW",
      description: "A big show, late.",
      eventUrl: "https://knuckleheads.test/shows/big-show",
      evidence: { date: "Sat, Oct 31 · Show 8:00 PM" },
    });
  });
});

/** The report says which events' identity moved this run, so a flap is seen the week it happens (#82). */
describe("identity churn", () => {
  it("lists events whose title or primary page changed, before and after", async () => {
    const moving = source("Moving Venue", { urls: ["https://movingvenue.test/events"] });
    const events = [
      stored("Big Show"),
      stored("Late Show", { start: "2026-11-01T20:00:00-05:00", evidence: { date: "Sun, Nov 1", venue: "Knuckleheads" } }),
      stored("Moved Show", { primaryUrl: "https://movingvenue.test/calendar", lead: { lane: "registry", source: moving.name }, venue: "Moving Venue", neighborhood: "Westport" }),
    ];

    const { report } = await runWith(WEEK_2, { ...emptyDataset(), events }, {
      sources: [knuckleheads, moving],
      pages: { [CALENDAR_URL]: PAGE, "https://movingvenue.test/events": PAGE },
      completions: [
        reply(candidate(), candidate({ title: "LATE SHOW", startDate: "2026-11-01", dateEvidence: "Sun, Nov 1" })),
        reply(candidateAt(moving, { title: "Moved Show" })),
      ],
    });

    expect(report.identityChurn).toEqual([
      { title: "LATE SHOW", primaryUrl: CALENDAR_URL, was: { title: "Late Show", primaryUrl: CALENDAR_URL } },
      { title: "Moved Show", primaryUrl: "https://movingvenue.test/events", was: { title: "Moved Show", primaryUrl: "https://movingvenue.test/calendar" } },
    ]);
    const markdown = renderReportMarkdown(report);
    expect(markdown).toContain("| Identity churn: title or primary page changed | 2 |");
    expect(markdown).toContain(`- Late Show (${CALENDAR_URL}) is now LATE SHOW (${CALENDAR_URL})`);
  });
});
