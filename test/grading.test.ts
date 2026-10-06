import { describe, expect, it } from "vitest";
import { emptyDataset, type Dataset, type Event } from "../src/dataset.js";
import { renderGrading } from "../src/grading.js";
import type { RunReport } from "../src/report.js";

/** A milestone run's report: 3-week horizon, 5 USD cap, a little under a dollar spent. */
function report(overrides: Partial<RunReport> = {}): RunReport {
  return {
    runDate: "2026-10-03",
    startedAt: "2026-10-03T16:00:00-05:00",
    finishedAt: "2026-10-03T16:04:00-05:00",
    horizonWeeks: 3,
    counts: { found: 40, new: 40, updated: 0, reverified: 0, heldUnverified: 2, heldThroughOutage: 0, beyondHorizonUnstruck: 0, unverifiedByOutageLimit: 0, unverifiedByUncitableReading: 0, outsideGeography: 1, expired: { past: 0, "two-strike": 0, cancelled: 0, "index-page": 0, duplicate: 0 } },
    spend: { totalUsd: 0.9, capUsd: 5, capHit: false, shortfall: { pagesNotExtracted: 0, eventsNotReverified: 0, queriesNotSearched: 0, leadsNotFollowed: 0, eventsNotCurated: 0 } },
    discovery: { enabled: true, queries: 10, aggregatorPages: 4, pagesExtracted: 12, problems: [] },
    reverification: { problems: [] },
    curation: { calls: 2, judged: 38, flagged: 5, problems: [] },
    sources: [],
    failingSources: [],
    offListNeighborhoods: [],
    unmappableNeighborhoods: [],
    promotionSuggestions: [],
    outageLimited: [],
    uncitableReadings: [],
    ...overrides,
  };
}

function active(overrides: Partial<Event> = {}): Event {
  return {
    id: "ev1",
    title: "Big Show",
    start: "2026-10-17T20:00:00-05:00",
    venue: "recordBar",
    neighborhood: "Crossroads",
    primaryUrl: "https://www.therecordbar.com/shows/big-show",
    kind: "music",
    recurrence: "one-off",
    dontMiss: false,
    firstSeen: "2026-10-03T16:00:00-05:00",
    lastVerified: "2026-10-03T16:00:00-05:00",
    lastChanged: "2026-10-03T16:00:00-05:00",
    status: "active",
    verificationFailures: 0,
    consecutiveOutages: 0,
    lead: { lane: "registry", source: "recordBar" },
    evidence: { date: "Sat, Oct 17 · Doors 7:00 PM · Show 8:00 PM", venue: "recordBar, 1520 Grand Blvd" },
    ...overrides,
  };
}

function dataset(events: Event[]): Dataset {
  return { ...emptyDataset(), generatedAt: "2026-10-03T16:04:00-05:00", lastSuccessfulRun: "2026-10-03T16:04:00-05:00", events };
}

describe("the milestone grading document", () => {
  it("has the four counts as headings in order, with counts three and four filled from the report", () => {
    const doc = renderGrading({ report: report(), dataset: dataset([active()]) });

    const headings = doc.split("\n").filter((line) => line.startsWith("## "));
    expect(headings).toEqual([
      "## 1. Found and would propose",
      "## 2. Missed that friends knew about",
      "## 3. Wrong or unverifiable dates and venues",
      "## 4. Cost per run, extrapolated monthly",
      "## Result",
    ]);
    // Count four: 0.90 USD a run, weekly, is 52/12 runs a month: 3.90 USD, under the 15 USD pass line.
    expect(doc).toContain("0.9000 USD");
    expect(doc).toContain("3.90 USD a month");
    expect(doc).toContain("15 USD");
    expect(doc).toContain("This was a first run");
    expect(doc).toContain("10 Tavily searches");
    expect(doc).toMatch(/Count four: \*\*pass\*\*/);
  });

  it("fills count three with every unverified event and why, and an audit table of every active reading", () => {
    const noVenue = active({
      id: "ev2",
      title: "Mystery Night",
      status: "unverified",
      venue: undefined,
      lastVerified: undefined,
      primaryUrl: "https://www.therecordbar.com/shows/mystery",
      evidence: { date: "Fri, Oct 23" },
    });
    const pageNotFetched = active({
      id: "ev3",
      title: "Offsite Gig",
      status: "unverified",
      lastVerified: undefined,
      primaryUrl: "https://tickets.example.com/offsite-gig",
    });
    const doc = renderGrading({ report: report(), dataset: dataset([active(), noVenue, pageNotFetched]) });

    const countThree = doc.slice(doc.indexOf("## 3."), doc.indexOf("## 4."));
    expect(countThree).toContain("Count three: **2 unverifiable**");
    expect(countThree).toContain("2 held unverified");
    expect(countThree).toContain("| Mystery Night | https://www.therecordbar.com/shows/mystery | no venue could be cited |");
    expect(countThree).toContain("| Offsite Gig | https://tickets.example.com/offsite-gig | primary page not fetched this run |");
    // Every active reading is in the audit table with what was read and the text it was read from.
    expect(countThree).toContain(
      "| Big Show | 2026-10-17 20:00 | recordBar | Sat, Oct 17 · Doors 7:00 PM · Show 8:00 PM | recordBar, 1520 Grand Blvd | https://www.therecordbar.com/shows/big-show |",
    );
    expect(countThree).toContain("1 active");
  });

  it("explains a once-verified unverified event as hidden since, not as a page never fetched", () => {
    const hidden = active({ id: "ev7", title: "Wizard", status: "unverified", primaryUrl: "https://kccrossroads.test/wizard" });
    const doc = renderGrading({ report: report(), dataset: dataset([hidden]) });

    expect(doc).toContain("| Wizard | https://kccrossroads.test/wizard | verified before; since hidden by an outage limit or an uncitable re-reading |");
  });

  it("flags an active reading whose evidence does not carry its date or venue", () => {
    const dayMismatch = active({ id: "ev4", title: "Shifted Show", start: "2026-10-18", evidence: { date: "Sat, Oct 17 · Doors 7:00 PM", venue: "recordBar" } });
    const venueMismatch = active({ id: "ev5", title: "Elsewhere", venue: "The Truman", evidence: { date: "Oct 17", venue: "recordBar, 1520 Grand Blvd" } });
    const beyondHorizon = active({ id: "ev6", title: "Far Out", start: "2026-12-20", evidence: { date: "Dec 20", venue: "recordBar" } });
    const fine = active();
    const doc = renderGrading({ report: report(), dataset: dataset([fine, dayMismatch, venueMismatch, beyondHorizon]) });

    const flagged = doc.slice(doc.indexOf("### Flagged for checking"), doc.indexOf("### Every active reading"));
    expect(flagged).toContain("Shifted Show: the date evidence does not mention day 18");
    expect(flagged).toContain("Elsewhere: the venue evidence does not mention \"The Truman\"");
    expect(flagged).toContain("Far Out: starts 2026-12-20, after the horizon ends on 2026-10-24");
    expect(flagged).not.toContain("Big Show");
  });

  it("keeps what Evan wrote when re-rendered after a repeated run, and refreshes the filled counts", () => {
    const first = renderGrading({ report: report(), dataset: dataset([active()]) });
    const filledIn = first
      .replace("## 1. Found and would propose\n", "## 1. Found and would propose\n\nThree things I did not know about.\n")
      .replace("## Result\n", "## Result\n\nPass.\n")
      .replace("### Wrong dates or venues found\n", "### Wrong dates or venues found\n\nOne doors-versus-show slip, fixed in the rules.\n");
    expect(filledIn).not.toEqual(first);

    const rerun = report({ runDate: "2026-10-04", spend: { ...report().spend, totalUsd: 1.2 } });
    const second = renderGrading({ report: rerun, dataset: dataset([active(), active({ id: "ev7", title: "Second Show" })]), existing: filledIn });

    expect(second).toContain("Three things I did not know about.");
    expect(second).toContain("One doors-versus-show slip, fixed in the rules.");
    expect(second).toContain("\n\nPass.\n");
    expect(second).toContain("Run 2026-10-04");
    expect(second).toContain("1.2000 USD");
    expect(second).toContain("| Second Show |");
    expect(second).not.toContain("0.9000 USD");
  });

  it("refuses a report that is not a milestone run", () => {
    expect(() => renderGrading({ report: report({ horizonWeeks: 8 }), dataset: dataset([]) })).toThrow(/horizon 8 weeks.*milestone run has 3/);
    expect(() => renderGrading({ report: report({ spend: { ...report().spend, capUsd: 10 } }), dataset: dataset([]) })).toThrow(/cap 10 USD.*milestone run has 5/);
  });
});
