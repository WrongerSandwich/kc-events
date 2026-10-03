import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import { emptyDataset, parseDataset, type Dataset } from "../src/dataset.js";
import type { CompletionResult, SearchResult } from "../src/ports.js";
import type { Source } from "../src/registry.js";
import type { RunConfig } from "../src/config.js";
import { fakePorts, type CannedPage } from "./fakes/ports.js";
import { testConfig, testPrompts } from "./fakes/config.js";
import { candidateAt, costing, PAGE, source, WEEK_1, WEEK_1_ISO, WEEK_2, WEEK_3 } from "./fakes/fixtures.js";
import { renderReportMarkdown } from "../src/report.js";
import { discoveryQueries } from "../src/discovery.js";

/** The one query the test config makes: its only kind besides "other", the place, and the horizon's months. */
const QUERY = "music events in Kansas City, October to November 2026";
/** The same query a week later, when the horizon reaches into December. */
const LATER_QUERY = "music events in Kansas City, October to December 2026";

const PROMOTER_PAGE = "https://promoter.test/shows/big-show";
/** A source standing in for the promoter's page, so candidateAt cites it. */
const PROMOTER = source("Promoter", { urls: [PROMOTER_PAGE], neighborhood: "Westport" });

const lead = (url: string, title = "A lead"): SearchResult => ({ url, title, snippet: "Something on in Kansas City" });

async function discoverAt(
  now: Date,
  dataset: Dataset,
  {
    sources = [],
    pages = {},
    completions = [],
    searches = {},
    discovery = {},
    spendCapUsd = 5,
  }: {
    sources?: Source[];
    pages?: Record<string, CannedPage>;
    completions?: CompletionResult[];
    searches?: Record<string, SearchResult[] | Error>;
    discovery?: Partial<RunConfig["discovery"]>;
    spendCapUsd?: number;
  },
) {
  const fakes = fakePorts(now, { pages, completions, searches });
  const config = testConfig({ spendCapUsd });
  const result = await run({
    config: { ...config, discovery: { ...config.discovery, enabled: true, aggregatorHosts: ["listings.test"], ...discovery } },
    prompts: testPrompts(),
    dataset,
    registry: { sources },
    ports: fakes.ports,
  });
  expect(parseDataset(result.dataset)).toEqual(result.dataset);
  return { ...result, calls: fakes.calls, requests: fakes.requests };
}

describe("discovery lane", () => {
  it("a lead to a primary page yields an active event whose lead is the discovery query", async () => {
    const { dataset, report, requests } = await discoverAt(WEEK_1, emptyDataset(), {
      searches: { [QUERY]: [lead(PROMOTER_PAGE)] },
      pages: { [PROMOTER_PAGE]: PAGE },
      completions: [costing(0.01, candidateAt(PROMOTER, { title: "Big Show", venue: "The Truman" }))],
    });

    expect(dataset.events).toHaveLength(1);
    expect(dataset.events[0]).toMatchObject({
      title: "Big Show",
      venue: "The Truman",
      primaryUrl: PROMOTER_PAGE,
      status: "active",
      lastVerified: WEEK_1_ISO,
      lead: { lane: "discovery", query: QUERY },
    });
    expect(report.counts).toMatchObject({ found: 1, new: 1 });
    expect(requests[0]!.messages[0]!.content).toContain("TEST EXTRACTION RULES");
    expect(requests[0]!.messages[1]!.content).toContain(PROMOTER_PAGE);
  });

  it("an aggregator result yields no event from its own page; its outbound links are followed instead", async () => {
    const listing = "https://www.listings.test/kc/this-week";
    const { dataset, report, requests, calls } = await discoverAt(WEEK_1, emptyDataset(), {
      searches: { [QUERY]: [lead(listing)] },
      pages: {
        [listing]: {
          status: 200,
          body: `<html><body>
            <h2>Big Show at The Truman, Oct 31</h2>
            <a href="/kc/event/123">Details</a>
            <a href="https://facebook.com/listings">Follow us</a>
            <a href="${PROMOTER_PAGE}">Big Show tickets</a>
          </body></html>`,
        },
        [PROMOTER_PAGE]: PAGE,
      },
      completions: [costing(0.01, candidateAt(PROMOTER, { title: "Big Show", venue: "The Truman" }))],
    });

    expect(calls).toEqual([`search:${QUERY}`, `fetch:${listing}`, `fetch:${PROMOTER_PAGE}`, "model:test/extraction", "model:test/curation"]);
    const extractions = requests.filter((r) => r.model === "test/extraction");
    expect(extractions).toHaveLength(1);
    expect(extractions[0]!.messages[1]!.content).toContain(`Page URL: ${PROMOTER_PAGE}`);
    expect(extractions[0]!.messages[1]!.content).not.toContain("listings.test");
    expect(dataset.events.map((e) => [e.title, e.primaryUrl, e.lead])).toEqual([["Big Show", PROMOTER_PAGE, { lane: "discovery", query: QUERY }]]);
    expect(report.discovery).toMatchObject({ queries: 1, aggregatorPages: 1, pagesExtracted: 1 });
  });

  it("a candidate citing an aggregator page as its primary page is held unverified", async () => {
    const { dataset } = await discoverAt(WEEK_1, emptyDataset(), {
      searches: { [QUERY]: [lead(PROMOTER_PAGE)] },
      pages: { [PROMOTER_PAGE]: PAGE },
      completions: [costing(0.01, candidateAt(PROMOTER, { primaryUrl: "https://listings.test/kc/event/123" }))],
    });

    expect(dataset.events.map((e) => [e.primaryUrl, e.status])).toEqual([["https://listings.test/kc/event/123", "unverified"]]);
  });

  it("an event found by both lanes is one record, keeping its registry lead", async () => {
    const venue = source("The Truman", { neighborhood: "Westport" });
    const { dataset, report } = await discoverAt(WEEK_1, emptyDataset(), {
      sources: [venue],
      searches: { [QUERY]: [lead(PROMOTER_PAGE), lead(venue.urls[0]!)] },
      pages: { [venue.urls[0]!]: PAGE, [PROMOTER_PAGE]: PAGE },
      completions: [
        costing(0.01, candidateAt(venue, { title: "Big Show" })),
        costing(0.01, candidateAt(PROMOTER, { title: "BIG SHOW!", venue: "The Truman" })),
      ],
    });

    expect(dataset.events).toHaveLength(1);
    expect(dataset.events[0]).toMatchObject({ title: "Big Show", lead: { lane: "registry", source: "The Truman" } });
    expect(report.counts).toMatchObject({ found: 1, new: 1 });
    // The venue's calendar came back as a search result too; the registry lane had already read it.
    expect(report.discovery.pagesExtracted).toBe(1);
  });

  it("a discovery host seen in two runs is a promotion suggestion, never a registry source", async () => {
    const otherShow = "https://promoter.test/shows/other-show";
    const first = await discoverAt(WEEK_1, emptyDataset(), {
      searches: { [QUERY]: [lead(PROMOTER_PAGE)] },
      pages: { [PROMOTER_PAGE]: PAGE },
      completions: [costing(0.01, candidateAt(PROMOTER, { title: "Big Show" }))],
    });
    expect(first.report.promotionSuggestions).toEqual([]);

    const second = await discoverAt(WEEK_2, first.dataset, {
      searches: { [LATER_QUERY]: [lead(otherShow)] },
      pages: { [otherShow]: PAGE, [PROMOTER_PAGE]: PAGE },
      completions: [
        costing(0.01, candidateAt(PROMOTER, { title: "Other Show", primaryUrl: otherShow })),
        // Re-verification of the first run's event against its own page.
        costing(0.01, candidateAt(PROMOTER, { title: "Big Show" })),
      ],
    });

    expect(second.report.promotionSuggestions).toEqual([{ host: "promoter.test", runsSeen: 2, exampleUrl: otherShow }]);
    expect(renderReportMarkdown(second.report)).toContain(`promoter.test: events found in 2 runs, e.g. ${otherShow}`);
  });

  it("a host seen twice in one run is not yet a promotion suggestion", async () => {
    const otherShow = "https://promoter.test/shows/other-show";
    const { report } = await discoverAt(WEEK_1, emptyDataset(), {
      searches: { [QUERY]: [lead(PROMOTER_PAGE), lead(otherShow)] },
      pages: { [PROMOTER_PAGE]: PAGE, [otherShow]: PAGE },
      completions: [
        costing(0.01, candidateAt(PROMOTER, { title: "Big Show" })),
        costing(0.01, candidateAt(PROMOTER, { title: "Other Show", primaryUrl: otherShow })),
      ],
    });

    expect(report.promotionSuggestions).toEqual([]);
  });

  it("a host the registry already checks is never suggested", async () => {
    const venue = source("The Truman");
    const showPage = "https://thetruman.test/shows/big-show";
    let dataset = emptyDataset();
    for (const [now, query] of [[WEEK_1, QUERY], [WEEK_2, LATER_QUERY]] as const) {
      ({ dataset } = await discoverAt(now, dataset, {
        sources: [venue],
        searches: { [query]: [lead(showPage)] },
        pages: { [venue.urls[0]!]: PAGE, [showPage]: PAGE },
        completions: [costing(0.01), costing(0.01, candidateAt(venue, { primaryUrl: showPage }))],
      }));
    }
    const { report } = await discoverAt(WEEK_3, dataset, {
      sources: [venue],
      searches: { [LATER_QUERY]: [lead(showPage)] },
      pages: { [venue.urls[0]!]: PAGE, [showPage]: PAGE },
      completions: [costing(0.01), costing(0.01, candidateAt(venue, { primaryUrl: showPage }))],
    });

    expect(report.discovery.pagesExtracted).toBe(1);
    expect(report.promotionSuggestions).toEqual([]);
  });

  it("a ticketing platform is followed as a primary page but never suggested for promotion", async () => {
    const ticketPage = (n: number) => `https://www.tickets.test/e/show-${n}`;
    const first = await discoverAt(WEEK_1, emptyDataset(), {
      searches: { [QUERY]: [lead(ticketPage(1))] },
      pages: { [ticketPage(1)]: PAGE },
      completions: [costing(0.01, candidateAt(PROMOTER, { title: "Show 1", primaryUrl: ticketPage(1) }))],
      discovery: { platformHosts: ["tickets.test"] },
    });
    const second = await discoverAt(WEEK_2, first.dataset, {
      searches: { [LATER_QUERY]: [lead(ticketPage(2))] },
      pages: { [ticketPage(1)]: PAGE, [ticketPage(2)]: PAGE },
      completions: [
        costing(0.01, candidateAt(PROMOTER, { title: "Show 2", primaryUrl: ticketPage(2) })),
        costing(0.01, candidateAt(PROMOTER, { title: "Show 1", primaryUrl: ticketPage(1) })),
      ],
      discovery: { platformHosts: ["tickets.test"] },
    });

    expect(second.dataset.events.map((e) => [e.title, e.status])).toEqual([
      ["Show 1", "active"],
      ["Show 2", "active"],
    ]);
    expect(second.report.promotionSuggestions).toEqual([]);
  });

  it("an active event whose primary page is on an aggregator is struck on re-verification, never extracted", async () => {
    const listingPage = "https://listings.test/kc/event/123";
    const known = (await discoverAt(WEEK_1, emptyDataset(), {
      searches: { [QUERY]: [lead(PROMOTER_PAGE)] },
      pages: { [PROMOTER_PAGE]: PAGE },
      completions: [costing(0.01, candidateAt(PROMOTER))],
    })).dataset;
    // An event made active by some earlier rule, now pointing at an aggregator page.
    const dataset = { ...known, events: known.events.map((e) => ({ ...e, primaryUrl: listingPage })) };

    const { calls, dataset: after } = await discoverAt(WEEK_2, dataset, { pages: { [listingPage]: PAGE } });

    expect(calls.filter((c) => c.startsWith("model:") || c.startsWith("fetch:"))).toEqual([]);
    expect(after.events[0]).toMatchObject({ status: "active", verificationFailures: 1 });
  });

  it("a lead robots.txt disallows is not extracted, and the report says why", async () => {
    const { calls, dataset, report } = await discoverAt(WEEK_1, emptyDataset(), {
      searches: { [QUERY]: [lead(PROMOTER_PAGE)] },
      pages: { [PROMOTER_PAGE]: "robots-blocked" },
    });

    expect(calls).toEqual([`search:${QUERY}`, `robots-blocked:${PROMOTER_PAGE}`]);
    expect(dataset.events).toEqual([]);
    expect(report.discovery.problems).toEqual([`robots.txt disallows ${PROMOTER_PAGE}`]);
  });

  it("a failed search is reported and the run goes on", async () => {
    const { report } = await discoverAt(WEEK_1, emptyDataset(), { searches: { [QUERY]: new Error("Tavily HTTP 432") } });

    expect(report.discovery).toMatchObject({ queries: 0, problems: [`search "${QUERY}" failed: Tavily HTTP 432`] });
  });

  it("once the spend cap is reached, no lead is fetched and no search is made, and the shortfall says so", async () => {
    const venue = source("The Truman");
    const { calls, report } = await discoverAt(WEEK_1, emptyDataset(), {
      sources: [venue],
      searches: { [QUERY]: [lead(PROMOTER_PAGE)] },
      pages: { [venue.urls[0]!]: PAGE, [PROMOTER_PAGE]: PAGE },
      completions: [costing(0.06, candidateAt(venue))],
      spendCapUsd: 0.05,
    });

    expect(calls.some((c) => c.startsWith("search:"))).toBe(false);
    expect(calls).not.toContain(`fetch:${PROMOTER_PAGE}`);
    expect(report.spend).toMatchObject({ capHit: true, shortfall: { queriesNotSearched: 1, leadsNotFollowed: 0 } });
  });

  it("when the cap is reached mid-lane, the leads still to go are not fetched and are counted", async () => {
    const otherShow = "https://promoter.test/shows/other-show";
    const { calls, dataset, report } = await discoverAt(WEEK_1, emptyDataset(), {
      searches: { [QUERY]: [lead(PROMOTER_PAGE), lead(otherShow)] },
      pages: { [PROMOTER_PAGE]: PAGE, [otherShow]: PAGE },
      completions: [costing(0.06, candidateAt(PROMOTER))],
      spendCapUsd: 0.05,
    });

    expect(calls).not.toContain(`fetch:${otherShow}`);
    expect(dataset.events).toHaveLength(1);
    expect(report.spend).toMatchObject({ capHit: true, shortfall: { queriesNotSearched: 0, leadsNotFollowed: 1 } });
  });

  it("is off unless the config enables it", async () => {
    const fakes = fakePorts(WEEK_1, { searches: { [QUERY]: [lead(PROMOTER_PAGE)] } });
    const { report } = await run({ config: testConfig(), prompts: testPrompts(), dataset: emptyDataset(), registry: { sources: [] }, ports: fakes.ports });

    expect(fakes.calls).toEqual([]);
    expect(report.discovery.enabled).toBe(false);
  });
});

describe("discovery queries", () => {
  it("are one per kind but other, naming the place and the months the horizon covers", () => {
    const config = testConfig({ kinds: ["music", "theater/dance", "other"], horizonWeeks: 8 });
    expect(discoveryQueries(config, "2026-12-01")).toEqual([
      "music events in Kansas City, December 2026 to January 2027",
      "theater and dance events in Kansas City, December 2026 to January 2027",
    ]);
    expect(discoveryQueries({ ...config, horizonWeeks: 2 }, "2026-10-02")).toEqual([
      "music events in Kansas City, October 2026",
      "theater and dance events in Kansas City, October 2026",
    ]);
  });
});
