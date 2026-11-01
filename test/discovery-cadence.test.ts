import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import { emptyDataset, parseDataset, type Dataset } from "../src/dataset.js";
import type { CompletionResult, SearchResult } from "../src/ports.js";
import type { RunConfig } from "../src/config.js";
import { discoveryQueries } from "../src/discovery.js";
import { renderReportMarkdown } from "../src/report.js";
import { toLocalDate } from "../src/time.js";
import { fakePorts, type CannedPage } from "./fakes/ports.js";
import { testConfig, testPrompts } from "./fakes/config.js";
import { candidateAt, costing, knuckleheads, PAGE, source, week } from "./fakes/fixtures.js";

const PROMOTER_PAGE = "https://promoter.test/shows/big-show";
const PROMOTER = source("Promoter", { urls: [PROMOTER_PAGE], neighborhood: "Westport" });
const lead = (url: string): SearchResult => ({ url, title: "A lead", snippet: "Something on in Kansas City" });

/** The run's one query on this date under the test config. */
const queryOn = (now: Date) => discoveryQueries(testConfig(), toLocalDate(now, "America/Chicago"))[0]!;

/** A run with discovery on under this cadence, the Knuckleheads calendar listing nothing, and these leads for the day's query. */
async function discoverAt(
  now: Date,
  dataset: Dataset,
  {
    cadence,
    leads = [],
    pages = {},
    completions = [],
    searchFails = false,
  }: { cadence: RunConfig["discovery"]["cadence"]; leads?: string[]; pages?: Record<string, CannedPage>; completions?: CompletionResult[]; searchFails?: boolean },
) {
  const fakes = fakePorts(now, {
    pages: { [knuckleheads.urls[0]!]: PAGE, ...pages },
    completions: [costing(0.01), ...completions],
    searches: { [queryOn(now)]: searchFails ? new Error("HTTP 500") : leads.map(lead) },
  });
  const config = testConfig();
  const discovering = { ...config, discovery: { ...config.discovery, enabled: true, cadence } };
  const result = await run({ config: discovering, prompts: testPrompts(), dataset, registry: { sources: [knuckleheads] }, ports: fakes.ports });
  expect(parseDataset(result.dataset, discovering)).toEqual(result.dataset);
  return { ...result, calls: fakes.calls };
}

const searched = (calls: string[]) => calls.filter((c) => c.startsWith("search:"));

describe("discovery cadence (#255)", () => {
  it("monthly: the lane runs in a month's first run and not its second, and runs again in the next month's first", async () => {
    // week(1) is Friday 2026-10-02, week(2) 2026-10-09, week(6) 2026-11-06.
    const first = await discoverAt(week(1), emptyDataset(), { cadence: "monthly" });
    expect(searched(first.calls)).toEqual([`search:${queryOn(week(1))}`]);
    expect(first.report.discovery).toMatchObject({ enabled: true });
    expect(first.dataset.discoveryLastRan).toBe("2026-10-02");

    const second = await discoverAt(week(2), first.dataset, { cadence: "monthly" });
    expect(searched(second.calls)).toEqual([]);
    expect(second.report.discovery).toMatchObject({ enabled: false, notRun: { reason: "cadence", lastRan: "2026-10-02" } });
    expect(second.dataset.discoveryLastRan).toBe("2026-10-02");
    expect(renderReportMarkdown(second.report)).toContain("Not run: the lane runs in a month's first run, and last ran 2026-10-02.");

    const november = await discoverAt(week(6), second.dataset, { cadence: "monthly" });
    expect(searched(november.calls)).toEqual([`search:${queryOn(week(6))}`]);
    expect(november.dataset.discoveryLastRan).toBe("2026-11-06");
  });

  it("a lane that made no search has not had its month: the next run tries again", async () => {
    const failed = await discoverAt(week(1), emptyDataset(), { cadence: "monthly", searchFails: true });
    expect(failed.report.discovery.problems).toHaveLength(1);
    expect(failed.dataset.discoveryLastRan).toBeUndefined();

    const retried = await discoverAt(week(2), failed.dataset, { cadence: "monthly" });
    expect(searched(retried.calls)).toEqual([`search:${queryOn(week(2))}`]);
    expect(retried.dataset.discoveryLastRan).toBe("2026-10-09");
  });

  it("a run the lane sits out still lists the hosts already suggested, with their counts", async () => {
    const first = await discoverAt(week(1), emptyDataset(), {
      cadence: "monthly",
      leads: [PROMOTER_PAGE],
      pages: { [PROMOTER_PAGE]: PAGE },
      completions: [costing(0.01, candidateAt(PROMOTER, { title: "Big Show", venue: "The Truman" }))],
    });
    const dataset = { ...first.dataset, discoveryState: { "promoter.test": { runsSeen: 4, lastSeen: "2026-10-02T22:15:00-05:00" } } };

    const quiet = await discoverAt(week(2), dataset, { cadence: "monthly" });

    expect(quiet.report.discovery.notRun).toEqual({ reason: "cadence", lastRan: "2026-10-02" });
    expect(quiet.report.promotionSuggestions).toEqual([{ host: "promoter.test", runsSeen: 4, exampleUrl: PROMOTER_PAGE, heldEvents: 1 }]);
    expect(quiet.dataset.discoveryState).toEqual(dataset.discoveryState);
  });

  it("weekly: the lane runs every run", async () => {
    const first = await discoverAt(week(1), emptyDataset(), { cadence: "weekly" });
    const second = await discoverAt(week(2), first.dataset, { cadence: "weekly" });
    expect(searched(second.calls)).toEqual([`search:${queryOn(week(2))}`]);
    expect(second.dataset.discoveryLastRan).toBe("2026-10-09");
  });

  it("a run with discovery off says so, and leaves the lane's last run date as it was", async () => {
    const dataset = { ...emptyDataset(), discoveryLastRan: "2026-09-25" };
    const fakes = fakePorts(week(1), { pages: { [knuckleheads.urls[0]!]: PAGE }, completions: [costing(0.01)] });
    const result = await run({ config: testConfig(), prompts: testPrompts(), dataset, registry: { sources: [knuckleheads] }, ports: fakes.ports });
    expect(result.report.discovery).toMatchObject({ enabled: false, notRun: { reason: "off" } });
    expect(result.dataset.discoveryLastRan).toBe("2026-09-25");
    expect(renderReportMarkdown(result.report)).toContain("Not run: discovery is off for this run.");
  });
});

describe("leads on hosts already suggested for promotion (#255)", () => {
  it("are not fetched or extracted; the suggestion keeps its count and the report counts the leads", async () => {
    const seen = { runsSeen: 3, lastSeen: "2026-09-25T06:17:00-05:00" };
    const held = await discoverAt(week(1), emptyDataset(), {
      cadence: "weekly",
      leads: [PROMOTER_PAGE],
      pages: { [PROMOTER_PAGE]: PAGE },
      completions: [costing(0.01, candidateAt(PROMOTER, { title: "Big Show", venue: "The Truman" }))],
    });
    const dataset = { ...held.dataset, discoveryState: { "promoter.test": seen } };
    const other = "https://promoter.test/shows/other-show";

    const { calls, report, dataset: after } = await discoverAt(week(2), dataset, { cadence: "weekly", leads: [PROMOTER_PAGE, other] });

    expect(calls.filter((c) => c.includes("promoter.test"))).toEqual([]);
    expect(calls.filter((c) => c.startsWith("model:test/extraction"))).toHaveLength(1);
    expect(report.discovery.leadsOnSuggestedHosts).toBe(2);
    expect(report.promotionSuggestions).toEqual([{ host: "promoter.test", runsSeen: 3, exampleUrl: PROMOTER_PAGE, heldEvents: 1 }]);
    expect(after.discoveryState["promoter.test"]).toEqual(seen);
    expect(renderReportMarkdown(report)).toContain("2 leads skipped on hosts already suggested for promotion.");
  });

  it("a lead whose redirects end on a suggested host is not extracted, and counts with them", async () => {
    const shortLink = "https://short.test/abc";
    const dataset = { ...emptyDataset(), discoveryState: { "promoter.test": { runsSeen: 2, lastSeen: "2026-09-25T06:17:00-05:00" } } };

    const { calls, report } = await discoverAt(week(1), dataset, { cadence: "weekly", leads: [shortLink], pages: { [shortLink]: { ...PAGE, finalUrl: PROMOTER_PAGE } } });

    expect(calls.filter((c) => c.startsWith("model:test/extraction"))).toHaveLength(1);
    expect(report.discovery).toMatchObject({ pagesExtracted: 0, leadsOnSuggestedHosts: 1 });
  });

  it("a held event on a suggested host does not age toward stale, since no lane could sight it", async () => {
    const held = await discoverAt(week(1), emptyDataset(), {
      cadence: "weekly",
      leads: [PROMOTER_PAGE],
      pages: { [PROMOTER_PAGE]: PAGE },
      completions: [costing(0.01, candidateAt(PROMOTER, { title: "Big Show", venue: "The Truman" }))],
    });
    // Never verified, as a reading before the rule could leave it: only such a record ages toward stale (#82).
    const neverVerified = held.dataset.events.map(({ lastVerified: _, ...e }) => e);
    let dataset: Dataset = { ...held.dataset, events: neverVerified, discoveryState: { "promoter.test": { runsSeen: 2, lastSeen: "2026-09-25T06:17:00-05:00" } } };
    // Four runs with the lane on would make it stale; the show is on Oct 31, after week(5).
    for (const n of [2, 3, 4, 5]) dataset = (await discoverAt(week(n), dataset, { cadence: "weekly" })).dataset;

    expect(dataset.events).toHaveLength(1);
    expect(dataset.events[0]).toMatchObject({ title: "Big Show", heldForPromotion: true });
    expect(dataset.events[0]!.runsUnsighted).toBeUndefined();
  });
});
