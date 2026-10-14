// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Event } from "../../src/dataset";
import type { RunChanges } from "../../src/report";
import { NEW_WITHIN_DAYS, publishedChanges, readRunChanges } from "../src/build/changes";
import { activeEvent } from "./fixtures/dataset";
import { event } from "./fixtures/event";

const RUN_DAY = "2026-10-05";
const LAST_RUN = "2026-10-05T06:30:00-05:00";
const ref = (id: string, title = "A show") => ({ id, title, primaryUrl: "https://www.therecordbar.com/shows" });
const comparison = (over: Partial<RunChanges> = {}): RunChanges => ({ comparedWith: "2026-09-28T06:30:00-05:00", newPicks: [], moved: [], gone: [], ...over });
const raw = (over: Record<string, unknown> = {}) => activeEvent(over) as unknown as Event;

describe("the changes page's groups (#135)", () => {
  it("new picks: the run's new picks that are published, by start", () => {
    const later = event({ id: "evt_00000000000a", start: "2026-10-20", dontMiss: true, whyLine: "Why." });
    const sooner = event({ id: "evt_00000000000b", start: "2026-10-08", dontMiss: true, whyLine: "Why." });
    const changes = publishedChanges({
      events: [],
      published: [later, sooner],
      changes: comparison({ newPicks: [ref(later.id), ref("evt_0000000000ff", "Past by the build"), ref(sooner.id)] }),
      runDay: RUN_DAY,
    });
    expect(changes.comparison?.newPicks).toEqual([sooner, later]);
  });

  it(`new this week: published events first seen in the ${NEW_WITHIN_DAYS} days through the run's day`, () => {
    const firstSeen = (id: string, at: string) => ({ e: raw({ id, firstSeen: at }), out: event({ id }) });
    const rows = [firstSeen("evt_000000000001", "2026-10-05T06:10:00-05:00"), firstSeen("evt_000000000002", "2026-09-29T06:10:00-05:00"), firstSeen("evt_000000000003", "2026-09-28T23:00:00-05:00")];
    const changes = publishedChanges({ events: rows.map((r) => r.e), published: rows.map((r) => r.out), changes: comparison(), runDay: RUN_DAY });
    expect(changes.newThisWeek.map((e) => e.id)).toEqual(["evt_000000000001", "evt_000000000002"]);
  });

  it("moved: published events with the start they had", () => {
    const moved = event({ id: "evt_00000000000a" });
    const changes = publishedChanges({
      events: [],
      published: [moved],
      changes: comparison({ moved: [{ ...ref(moved.id), from: "2026-10-07T19:00:00-05:00" }, { ...ref("evt_0000000000ff"), from: "2026-10-07" }] }),
      runDay: RUN_DAY,
    });
    expect(changes.comparison?.moved).toEqual([{ event: moved, from: "2026-10-07T19:00:00-05:00" }]);
  });

  it("gone: each cancelled or no-longer-listed event's title, venue, date and page, from its expired record", () => {
    const gone = raw({ id: "evt_00000000000a", title: "Gone show", status: "expired", expiryReason: "two-strike", venue: "recordBar" });
    const changes = publishedChanges({
      events: [gone],
      published: [],
      changes: comparison({ gone: [{ ...ref(gone.id, "Gone show"), reason: "two-strike" }, { ...ref("evt_0000000000ff", "Archived show"), reason: "cancelled" }] }),
      runDay: RUN_DAY,
    });
    expect(changes.comparison?.gone).toEqual([
      { title: "Gone show", venue: "recordBar", start: "2026-10-09T19:00:00-05:00", primaryUrl: "https://www.therecordbar.com/shows", reason: "two-strike" },
      { title: "Archived show", primaryUrl: "https://www.therecordbar.com/shows", reason: "cancelled" },
    ]);
  });

  it("a report that records no comparison leaves the run's groups out and keeps new this week", () => {
    const changes = publishedChanges({ events: [raw()], published: [event()], changes: undefined, runDay: "2026-10-03" });
    expect(changes).toEqual({ newThisWeek: [event()] });
  });
});

describe("readRunChanges", () => {
  function runsDir(reports: Record<string, { finishedAt: string; changes?: RunChanges }>) {
    const dir = mkdtempSync(join(tmpdir(), "kc-site-runs-"));
    mkdirSync(join(dir, "runs"));
    for (const [day, r] of Object.entries(reports)) writeFileSync(join(dir, "runs", `${day}.json`), JSON.stringify(report(day, r)));
    return join(dir, "events.json");
  }

  it("reads the changes of the report the dataset's last run wrote", () => {
    expect(readRunChanges(runsDir({ "2026-10-05": { finishedAt: LAST_RUN, changes: comparison() } }), LAST_RUN)).toEqual(comparison());
  });

  it("finds a run that finished past midnight under the day it started", () => {
    const finished = "2026-10-06T00:20:00-05:00";
    expect(readRunChanges(runsDir({ "2026-10-05": { finishedAt: finished, changes: comparison() } }), finished)).toEqual(comparison());
  });

  it("gives nothing for a report from before #135, or when no report is the last run's", () => {
    expect(readRunChanges(runsDir({ "2026-10-05": { finishedAt: LAST_RUN } }), LAST_RUN)).toBeUndefined();
    expect(readRunChanges(runsDir({ "2026-10-05": { finishedAt: "2026-10-05T05:00:00-05:00", changes: comparison() } }), LAST_RUN)).toBeUndefined();
    expect(readRunChanges(runsDir({}), LAST_RUN)).toBeUndefined();
  });
});

/** The smallest report the job's schema reads. */
function report(runDate: string, over: { finishedAt: string; changes?: RunChanges }) {
  return {
    runDate,
    startedAt: `${runDate}T06:00:00-05:00`,
    horizonWeeks: 3,
    counts: { found: 0, new: 0, updated: 0, reverified: 0, heldUnverified: 0, outsideGeography: 0, expired: {} },
    spend: { totalUsd: 0, capUsd: 5, capHit: false, shortfall: { pagesNotExtracted: 0, eventsNotReverified: 0, queriesNotSearched: 0, leadsNotFollowed: 0, eventsNotCurated: 0 } },
    discovery: { enabled: false, queries: 0, aggregatorPages: 0, pagesExtracted: 0, problems: [] },
    curation: { calls: 0, judged: 0, flagged: 0, problems: [] },
    sources: [],
    failingSources: [],
    unmappableNeighborhoods: [],
    promotionSuggestions: [],
    ...over,
  };
}
