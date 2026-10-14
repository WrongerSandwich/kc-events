import { describe, expect, it } from "vitest";
import { runChanges } from "../src/changes.js";
import { emptyDataset, type Event } from "../src/dataset.js";
import { parseRunReport, renderReportMarkdown } from "../src/report.js";
import { runWith } from "./fakes/run.js";
import { candidateAt, knuckleheads, PAGE, reply, WEEK_1_ISO, WEEK_2 } from "./fakes/fixtures.js";

const CALENDAR_URL = knuckleheads.urls[0]!;

let nextId = 0;
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
    evidence: { date: "Sat, Oct 31 · Show 8:00 PM", venue: "Knuckleheads, 1 Main St" },
    ...overrides,
  };
}

const TODAY = "2026-10-09";
const ref = (e: Event) => ({ id: e.id, title: e.title, primaryUrl: e.primaryUrl });

/** What the site's changes page reads (#135): the run's difference from the dataset it started from. */
describe("runChanges", () => {
  it("names the run it compares with, or none on the first run", () => {
    expect(runChanges([], [], WEEK_1_ISO, TODAY).comparedWith).toBe(WEEK_1_ISO);
    expect(runChanges([], [], null, TODAY).comparedWith).toBeNull();
  });

  it("a new pick is an active flagged event that was not flagged before, new or stored", () => {
    const turned = stored("Turned");
    const kept = stored("Kept", { dontMiss: true, whyLine: "Why." });
    const fresh = stored("Fresh", { dontMiss: true, whyLine: "Why." });
    const hidden = stored("Hidden", { dontMiss: true, whyLine: "Why.", status: "unverified" });
    const changes = runChanges([turned, kept], [{ ...turned, dontMiss: true, whyLine: "Why." }, kept, fresh, hidden], WEEK_1_ISO, TODAY);
    expect(changes.newPicks).toEqual([ref(turned), ref(fresh)]);
  });

  it("a move is an event active before and now whose start is another day or another time", () => {
    const day = stored("Day");
    const time = stored("Time");
    const timeAdded = stored("Time added", { start: "2026-10-31" });
    const wasHidden = stored("Was hidden", { status: "unverified" });
    const same = stored("Same");
    const changes = runChanges(
      [day, time, timeAdded, wasHidden, same],
      [
        { ...day, start: "2026-11-01T20:00:00-05:00" },
        { ...time, start: "2026-10-31T19:00:00-05:00" },
        { ...timeAdded, start: "2026-10-31T19:00:00-05:00" },
        { ...wasHidden, status: "active", start: "2026-11-02T20:00:00-05:00" },
        same,
      ],
      WEEK_1_ISO,
      TODAY,
    );
    expect(changes.moved).toEqual([
      { ...ref(day), from: "2026-10-31T20:00:00-05:00" },
      { ...ref(time), from: "2026-10-31T20:00:00-05:00" },
    ]);
  });

  it("a start that had passed by the run's day giving way to a later one is the next date read, not a move", () => {
    const rolled = stored("Rolled", { start: "2026-10-04T10:00:00-05:00" });
    const today = stored("Today", { start: "2026-10-09T10:00:00-05:00" });
    const changes = runChanges(
      [rolled, today],
      [
        { ...rolled, start: "2026-10-10T10:00:00-05:00" },
        { ...today, start: "2026-10-10T10:00:00-05:00" },
      ],
      WEEK_1_ISO,
      TODAY,
    );
    expect(changes.moved).toEqual([{ ...ref(today), from: "2026-10-09T10:00:00-05:00" }]);
  });

  it("gone is an event active before that expired this run as cancelled or no longer listed", () => {
    const cancelled = stored("Cancelled");
    const unlisted = stored("Unlisted");
    const past = stored("Past");
    const duplicate = stored("Duplicate");
    const neverShown = stored("Never shown", { status: "unverified" });
    const longGone = stored("Long gone", { status: "expired", expiryReason: "cancelled" });
    const expire = (e: Event, expiryReason: Event["expiryReason"]): Event => ({ ...e, status: "expired", expiryReason });
    const changes = runChanges(
      [cancelled, unlisted, past, duplicate, neverShown, longGone],
      [expire(cancelled, "cancelled"), expire(unlisted, "two-strike"), expire(past, "past"), expire(duplicate, "duplicate"), expire(neverShown, "cancelled"), longGone],
      WEEK_1_ISO,
      TODAY,
    );
    expect(changes.gone).toEqual([
      { ...ref(cancelled), reason: "cancelled" },
      { ...ref(unlisted), reason: "two-strike" },
    ]);
  });

  it("a run writes them to its report, and the Markdown lists them", async () => {
    const moving = stored("Big Show", { start: "2026-10-30T20:00:00-05:00", evidence: { date: "Fri, Oct 30", venue: "Knuckleheads" } });
    const dataset = { ...emptyDataset(), lastSuccessfulRun: WEEK_1_ISO, events: [moving] };
    const { report } = await runWith(WEEK_2, dataset, {
      sources: [knuckleheads],
      pages: { [CALENDAR_URL]: PAGE },
      completions: [reply(candidateAt(knuckleheads))],
    });

    expect(report.changes).toEqual({ comparedWith: WEEK_1_ISO, newPicks: [], moved: [{ ...ref(moving), from: "2026-10-30T20:00:00-05:00" }], gone: [] });
    expect(parseRunReport(JSON.parse(JSON.stringify(report)))).toEqual(report);
    const markdown = renderReportMarkdown(report);
    expect(markdown).toContain(`## Changes since the run of ${WEEK_1_ISO}`);
    expect(markdown).toContain(`- Big Show (${CALENDAR_URL}), from 2026-10-30T20:00:00-05:00`);
  });

  it("a report written before #135 parses with no changes", () => {
    const { changes: _, ...older } = minimalReport();
    expect(parseRunReport(older).changes).toBeUndefined();
    expect(parseRunReport(minimalReport()).changes).toEqual({ comparedWith: null, newPicks: [], moved: [], gone: [] });
  });
});

function minimalReport() {
  return {
    runDate: "2026-10-12",
    startedAt: WEEK_1_ISO,
    finishedAt: WEEK_1_ISO,
    horizonWeeks: 3,
    counts: { found: 0, new: 0, updated: 0, reverified: 0, heldUnverified: 0, outsideGeography: 0, expired: {} },
    spend: { totalUsd: 0, capUsd: 5, capHit: false, shortfall: { pagesNotExtracted: 0, eventsNotReverified: 0, queriesNotSearched: 0, leadsNotFollowed: 0, eventsNotCurated: 0 } },
    discovery: { enabled: false, queries: 0, aggregatorPages: 0, pagesExtracted: 0, problems: [] },
    curation: { calls: 0, judged: 0, flagged: 0, problems: [] },
    sources: [],
    failingSources: [],
    unmappableNeighborhoods: [],
    promotionSuggestions: [],
    changes: { comparedWith: null, newPicks: [], moved: [], gone: [] },
  };
}
