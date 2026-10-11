import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import { emptyDataset, parseDataset, type Dataset, type Event } from "../src/dataset.js";
import type { CompletionResult, SearchResult } from "../src/ports.js";
import type { RunConfig } from "../src/config.js";
import type { Source } from "../src/registry.js";
import { renderReportMarkdown } from "../src/report.js";
import { fakePorts, type CannedPage } from "./fakes/ports.js";
import { testConfig, testPrompts } from "./fakes/config.js";
import { candidateAt, costing, PAGE, reply, source, week, weekIso, WEEK_1, WEEK_1_ISO, WEEK_2, WEEK_2_ISO, WEEK_3, WEEK_3_ISO } from "./fakes/fixtures.js";
import { runWith } from "./fakes/run.js";

/** The one query the test config makes in week 1, and the same query a week later, when the horizon reaches December. */
const QUERY = "music events in Kansas City, October to November 2026";
const LATER_QUERY = "music events in Kansas City, October to December 2026";

/** A winery's own event page, found by search: a host no registry source is on. */
const WINERY_PAGE = "https://winery.test/events/big-show";
/** The winery as a source, so candidateAt cites its venue; it is in the registry only once promoted. */
const WINERY = source("Winery", { urls: ["https://winery.test/calendar"] });
/** An aggregator page a search can land on. */
const LISTING = "https://www.listings.test/kc/this-week";

const lead = (url: string): SearchResult => ({ url, title: "A lead", snippet: "Something on in Kansas City" });

interface DiscoverOptions {
  sources?: Source[];
  pages?: Record<string, CannedPage>;
  completions?: CompletionResult[];
  searches?: Record<string, SearchResult[] | Error>;
  discovery?: Partial<RunConfig["discovery"]>;
}

/** One run with discovery on and listings.test an aggregator. */
async function discoverAt(now: Date, dataset: Dataset, { sources = [], pages = {}, completions = [], searches = {}, discovery = {} }: DiscoverOptions) {
  const fakes = fakePorts(now, { pages, completions, searches });
  const config = testConfig();
  const discovering = { ...config, discovery: { ...config.discovery, enabled: true, aggregatorHosts: ["listings.test"], ...discovery } };
  const result = await run({ config: discovering, prompts: testPrompts(), dataset, registry: { sources }, ports: fakes.ports });
  expect(parseDataset(result.dataset, discovering)).toEqual(result.dataset);
  return { ...result, calls: fakes.calls, requests: fakes.requests };
}

/** The first run: the search finds the winery's page, which lists the Big Show, cited in full. */
const findBigShow = (now = WEEK_1, dataset = emptyDataset()) =>
  discoverAt(now, dataset, {
    searches: { [QUERY]: [lead(WINERY_PAGE)] },
    pages: { [WINERY_PAGE]: PAGE },
    completions: [costing(0.01, candidateAt(WINERY))],
  });

const only = (dataset: Dataset): Event => {
  expect(dataset.events).toHaveLength(1);
  return dataset.events[0]!;
};

describe("a discovered host's events are held until the host is promoted (ADR 0012)", () => {
  it("a sighting from a host no registry source is on is stored unverified and held, with its reading, and counted by host", async () => {
    const { dataset, report, calls } = await findBigShow();

    expect(only(dataset)).toMatchObject({
      title: "Big Show",
      primaryUrl: WINERY_PAGE,
      status: "unverified",
      heldForPromotion: true,
      venue: "Winery",
      lastVerified: WEEK_1_ISO,
      lead: { lane: "discovery", query: QUERY },
    });
    expect(report.counts).toMatchObject({ found: 1, new: 1, heldForPromotion: 1, releasedForPromotion: 0 });
    expect(report.heldForPromotion).toEqual([{ host: "winery.test", events: 1 }]);
    expect(report.releasedForPromotion).toEqual([]);
    expect(renderReportMarkdown(report)).toContain("winery.test: 1 event held");
    // Held, so never curated.
    expect(calls).not.toContain("model:test/curation");
  });

  it("a page on a registry source's host, a subdomain of one, or a ticketing platform is not held", async () => {
    const venue = source("The Truman");
    const onVenue = "https://thetruman.test/shows/big-show";
    const onTickets = "https://tickets.thetruman.test/e/other-show";
    const onPlatform = "https://www.tickets.test/e/third-show";
    const { dataset, report } = await discoverAt(WEEK_1, emptyDataset(), {
      sources: [venue],
      searches: { [QUERY]: [lead(onVenue), lead(onTickets), lead(onPlatform)] },
      pages: { [venue.urls[0]!]: PAGE, [onVenue]: PAGE, [onTickets]: PAGE, [onPlatform]: PAGE },
      completions: [
        costing(0.01),
        costing(0.01, candidateAt(venue, { title: "Big Show" })),
        costing(0.01, candidateAt(venue, { title: "Other Show" })),
        costing(0.01, candidateAt(venue, { title: "Third Show" })),
      ],
      discovery: { platformHosts: ["tickets.test"] },
    });

    expect(dataset.events.map((e) => [e.title, e.status, e.heldForPromotion])).toEqual([
      ["Big Show", "active", undefined],
      ["Other Show", "active", undefined],
      ["Third Show", "active", undefined],
    ]);
    expect(report.counts.heldForPromotion).toBe(0);
    expect(report.heldForPromotion).toEqual([]);
  });

  it("on the first run with the rule, every discovery-led event on such a host is held, active or unverified; a registry-led event on a host its source moved to is not", async () => {
    // Three events read before the rule: two by discovery from the winery, one by the registry lane from a calendar that has since moved hosts.
    const knuckleheads = source("Knuckleheads");
    const calendar = knuckleheads.urls[0]!;
    const before = await runWith(WEEK_1, emptyDataset(), {
      sources: [knuckleheads],
      pages: { [calendar]: PAGE },
      completions: [reply(candidateAt(knuckleheads, { title: "Big Show" }), candidateAt(knuckleheads, { title: "Tasting", venue: null, venueEvidence: null }), candidateAt(knuckleheads, { title: "Moved Show" }))],
    });
    const [bigShow, tasting, movedShow] = before.dataset.events as [Event, Event, Event];
    expect([bigShow.status, tasting.status]).toEqual(["active", "unverified"]);
    const found = (e: Event, primaryUrl: string): Event => ({ ...e, primaryUrl, lead: { lane: "discovery", query: QUERY } });
    const MOVED_CALENDAR = "https://moved.test/calendar";
    const stored: Dataset = {
      ...before.dataset,
      events: [found(bigShow, WINERY_PAGE), found(tasting, "https://winery.test/events/tasting"), { ...movedShow, primaryUrl: MOVED_CALENDAR }],
    };

    const { dataset, report, calls } = await discoverAt(WEEK_2, stored, {
      sources: [{ ...knuckleheads, urls: [MOVED_CALENDAR] }],
      pages: { [MOVED_CALENDAR]: PAGE },
      completions: [reply(candidateAt(knuckleheads, { title: "Moved Show" }))],
    });

    expect(dataset.events.map((e) => [e.title, e.status, e.heldForPromotion])).toEqual([
      ["Big Show", "unverified", true],
      ["Tasting", "unverified", true],
      ["Moved Show", "active", undefined],
    ]);
    // Held, so neither winery page is fetched; the registry-led event is read as ever.
    expect(calls.filter((c) => c.startsWith("fetch:"))).toEqual([`fetch:${MOVED_CALENDAR}`]);
    expect(report.counts).toMatchObject({ heldForPromotion: 2, releasedForPromotion: 0 });
    expect(report.heldForPromotion).toEqual([{ host: "winery.test", events: 2 }]);
    // The held active event changed status, so its last-changed moves; its reading and first-seen stay.
    expect(dataset.events[0]).toMatchObject({ lastChanged: WEEK_2_ISO, firstSeen: WEEK_1_ISO, lastVerified: WEEK_1_ISO, evidence: bigShow.evidence });
  });

  it("a held event is not re-read on later runs, and expires past when its date passes", async () => {
    const first = await findBigShow();

    // Nothing found this week: the held event is neither fetched nor sent to the model.
    const second = await discoverAt(WEEK_2, first.dataset, { searches: { [LATER_QUERY]: [] } });
    expect(second.calls).toEqual([`search:${LATER_QUERY}`]);
    expect(second.dataset.events).toEqual(first.dataset.events);
    expect(second.report.counts).toMatchObject({ heldForPromotion: 0, reverified: 0 });

    // The run after the show's date (October 31): past like any event, and held no longer.
    const later = await discoverAt(week(6), second.dataset, {});
    expect(only(later.dataset)).toMatchObject({ status: "expired", expiryReason: "past", lastChanged: weekIso(6) });
    expect(only(later.dataset)).not.toHaveProperty("heldForPromotion");
    expect(later.report.counts.expired.past).toBe(1);
  });

  it("found, held, re-found and still held, promoted, released, verified: the whole arc at the run seam", async () => {
    const first = await findBigShow();
    expect(only(first.dataset)).toMatchObject({ status: "unverified", heldForPromotion: true });
    expect(first.report.promotionSuggestions).toEqual([]);

    // Week 2: the search ranks the page again. Discovery reads it (the host has now yielded events in two runs,
    // so promotion is suggested, naming what it would release); the reading is refreshed, but the event stays held.
    const second = await discoverAt(WEEK_2, first.dataset, {
      searches: { [LATER_QUERY]: [lead(WINERY_PAGE)] },
      pages: { [WINERY_PAGE]: PAGE },
      completions: [costing(0.01, candidateAt(WINERY, { description: "Three bands in the barrel room." }))],
    });
    expect(second.calls.filter((c) => c.startsWith("fetch:"))).toEqual([`fetch:${WINERY_PAGE}`]);
    expect(only(second.dataset)).toMatchObject({
      id: only(first.dataset).id,
      status: "unverified",
      heldForPromotion: true,
      description: "Three bands in the barrel room.",
      lastVerified: WEEK_2_ISO,
    });
    expect(second.report.counts).toMatchObject({ found: 1, new: 0, heldForPromotion: 0 });
    expect(second.report.promotionSuggestions).toEqual([{ host: "winery.test", runsSeen: 2, exampleUrl: WINERY_PAGE, heldEvents: 1 }]);
    expect(renderReportMarkdown(second.report)).toContain(`winery.test: events found in 2 runs, 1 held event promotion would release, e.g. ${WINERY_PAGE}`);

    // Week 3: Evan promotes the host by adding the winery's calendar to the registry. The calendar lists nothing
    // this week; the released event is re-verified against its own page, which still lists it.
    const third = await discoverAt(WEEK_3, second.dataset, {
      sources: [WINERY],
      searches: { [LATER_QUERY]: [] },
      pages: { [WINERY.urls[0]!]: PAGE, [WINERY_PAGE]: PAGE },
      completions: [costing(0.01), costing(0.01, candidateAt(WINERY))],
    });
    expect(third.calls.filter((c) => c.startsWith("fetch:"))).toEqual([`fetch:${WINERY.urls[0]}`, `fetch:${WINERY_PAGE}`]);
    expect(only(third.dataset)).toMatchObject({
      id: only(first.dataset).id,
      status: "active",
      lastVerified: WEEK_3_ISO,
      lastChanged: WEEK_3_ISO,
      lead: { lane: "discovery", query: QUERY },
    });
    expect(only(third.dataset)).not.toHaveProperty("heldForPromotion");
    expect(third.report.counts).toMatchObject({ reverified: 1, heldForPromotion: 0, releasedForPromotion: 1 });
    expect(third.report.releasedForPromotion).toEqual([{ host: "winery.test", events: 1 }]);
    expect(renderReportMarkdown(third.report)).toContain("winery.test: 1 event released");
    expect(third.report.promotionSuggestions).toEqual([]);
    // Verified at last, so curated at last.
    expect(third.calls).toContain("model:test/curation");
  });

  it("a released event whose page the promoted source now reads is refreshed from it in the same run", async () => {
    const first = await findBigShow();

    // The registry source's URL is the very page discovery found.
    const promoted = source("Winery", { urls: [WINERY_PAGE] });
    const second = await discoverAt(WEEK_2, first.dataset, {
      sources: [promoted],
      searches: { [LATER_QUERY]: [] },
      pages: { [WINERY_PAGE]: PAGE },
      completions: [costing(0.01, candidateAt(promoted))],
    });

    expect(second.calls.filter((c) => c.startsWith("fetch:"))).toEqual([`fetch:${WINERY_PAGE}`]);
    expect(only(second.dataset)).toMatchObject({ id: only(first.dataset).id, status: "active", lastVerified: WEEK_2_ISO });
    expect(only(second.dataset)).not.toHaveProperty("heldForPromotion");
    expect(second.report.counts).toMatchObject({ found: 1, updated: 1, releasedForPromotion: 1 });
  });

  it("discovery never follows a host the registry excludes, as a search result or a link off an index page, and the report counts the leads", async () => {
    const starlight: Source = { ...source("Starlight", { urls: ["https://starlight.test/calendar"] }), status: "excluded", reason: "robots.txt disallows" };
    const onStarlight = "https://starlight.test/shows/big-show";
    const onStarlightTickets = "https://www.tickets.starlight.test/e/other-show";
    const { dataset, report, calls } = await discoverAt(WEEK_1, emptyDataset(), {
      sources: [starlight],
      searches: { [QUERY]: [lead(onStarlight), lead(LISTING)] },
      pages: {
        [LISTING]: { status: 200, body: `<html><body><a href="${onStarlightTickets}">Other Show</a><a href="${WINERY_PAGE}">Big Show</a></body></html>` },
        [WINERY_PAGE]: PAGE,
      },
      completions: [costing(0.01, candidateAt(WINERY))],
    });

    expect(calls.filter((c) => c.startsWith("fetch:"))).toEqual([`fetch:${LISTING}`, `fetch:${WINERY_PAGE}`]);
    expect(dataset.events.map((e) => e.primaryUrl)).toEqual([WINERY_PAGE]);
    expect(report.discovery.leadsOnExcludedSources).toEqual([{ source: "Starlight", reason: "robots.txt disallows", leads: 2 }]);
    expect(renderReportMarkdown(report)).toContain("2 leads not followed: Starlight is excluded (robots.txt disallows)");
    // The cap cut nothing.
    expect(report.spend).toMatchObject({ capHit: false, shortfall: { leadsNotFollowed: 0 } });
  });
});
