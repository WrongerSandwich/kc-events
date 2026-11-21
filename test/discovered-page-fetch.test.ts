import { describe, expect, it } from "vitest";
import { emptyDataset, type Event } from "../src/dataset.js";
import type { Source } from "../src/registry.js";
import type { CannedPage, ScriptedReply } from "./fakes/ports.js";
import { candidateAt, PAGE, reply, source, storedEvent, WEEK_1 } from "./fakes/fixtures.js";
import { testConfig } from "./fakes/config.js";
import { runWith } from "./fakes/run.js";

/**
 * A page discovery found on an active registry source's host is fetched that source's way (#287): a
 * site that answers the plain fetcher 406, which its source meets with `fetch: browser` (#58), is met
 * the same way whichever lane found the event. Only the source's listing pages wait for the list's
 * selector; any other page there waits as an own page does. On any other host, a ticketing platform's
 * included, a discovered page is fetched plainly.
 */

/** The stadium's source: its list is fetched through the browser, waiting for a rendered listing; its own pages wait for their own mark. */
const stadium: Source = { ...source("Arrowhead Stadium"), fetch: "browser", waitFor: ".event-card", eventPageWaitFor: ".game-info" };
const LIST_URL = stadium.urls[0]!;
/** The stadium's home page, which discovery found the game on, under the www form of the source's host. */
const HOME_URL = "https://www.arrowheadstadium.test/";
const OWN_URL = "https://www.arrowheadstadium.test/events/49ers-vs-chiefs";
/** A ticketing platform's page: admitted (ADR 0012), but no registry source's host. */
const TICKETS_URL = "https://tickets.test/event/49ers-vs-chiefs";
const TICKETS_OWN_URL = "https://tickets.test/event/49ers-vs-chiefs/details";

const DATE_QUOTE = "Sun, Oct 11 · 3:25 PM";
const VENUE_QUOTE = "Arrowhead Stadium, 1 Arrowhead Dr";

/** The game as the dataset stores it: found by discovery, active, on the given primary and own pages. */
const discovered = (primaryUrl: string, eventUrl: string): Event =>
  storedEvent("49ers vs Chiefs", {
    start: "2026-10-11T15:25:00-05:00",
    venue: "Arrowhead Stadium",
    primaryUrl,
    eventUrl,
    lead: { lane: "discovery", query: "sports in Kansas City" },
    evidence: { date: DATE_QUOTE, venue: VENUE_QUOTE },
  });

/** The re-read primary page's reading: it still lists the game, linking its own page as link 1. */
const stillListed = reply(candidateAt(stadium, { title: "49ers vs Chiefs", startDate: "2026-10-11", startTime: "15:25", eventLink: 1, dateEvidence: DATE_QUOTE, venueEvidence: VENUE_QUOTE }));

/** The own page's reading: the same date, and nothing more. */
const ownRead: ScriptedReply = {
  value: { date: "2026-10-11", time: null, timeEvidence: null, price: null, priceEvidence: null, ages: null, agesEvidence: null, days: null, daysEvidence: null, daysLink: null, description: null },
  costUsd: 0.002,
};

const config = (() => {
  const base = testConfig({ ownPageReadsPerRun: 150 });
  return { ...base, discovery: { ...base.discovery, platformHosts: [...base.discovery.platformHosts, "tickets.test"] } };
})();

/** A primary page that links the game's own page. */
const linking = (ownUrl: string): CannedPage => ({ status: 200, body: `<html><body><a href="${ownUrl}">49ers vs Chiefs</a></body></html>` });

/**
 * One weekly run over the given sources, the stadium's by default, whose lists read as listing nothing,
 * and a dataset holding the one discovered game, on a primary page that links its own page.
 */
const runOver = (primaryUrl: string, ownUrl: string, sources: Source[] = [stadium]) =>
  runWith(WEEK_1, { ...emptyDataset(), events: [discovered(primaryUrl, ownUrl)] }, {
    sources,
    pages: { ...Object.fromEntries(sources.map((s) => [s.urls[0]!, PAGE])), [primaryUrl]: linking(ownUrl), [ownUrl]: PAGE },
    completions: [...sources.map(() => reply()), stillListed, ownRead],
    config,
  });

/** One midweek pass (#253), which reads no list, so a discovered page that is the source's own list is re-verified here. */
const midweekOver = (primaryUrl: string, sources: Source[] = [stadium]) =>
  runWith(WEEK_1, { ...emptyDataset(), events: [discovered(primaryUrl, OWN_URL)] }, {
    sources,
    pages: { [primaryUrl]: linking(OWN_URL) },
    completions: [stillListed],
    config,
    reverifyOnly: { days: 10 },
  });

describe("a discovered event on a browser-fetched source's host (#287)", () => {
  it("is re-verified through the browser, a page other than the source's list waiting as its own pages do, never for the list's selector", async () => {
    const { calls, dataset } = await runOver(HOME_URL, OWN_URL);

    expect(calls).toContain(`browser:${HOME_URL} waiting for .game-info`);
    expect(calls).not.toContain(`browser:${HOME_URL} waiting for .event-card`);
    expect(calls).not.toContain(`fetch:${HOME_URL}`);
    expect(dataset.events[0]).toMatchObject({ status: "active", verificationFailures: 0, consecutiveOutages: 0, lead: { lane: "discovery" } });
  });

  it("is re-verified on such a page waiting for the network to go quiet when the source sets no own-page mark", async () => {
    const { eventPageWaitFor: _, ...quiet } = stadium;
    const { calls } = await midweekOver(HOME_URL, [quiet]);

    expect(calls.filter((c) => c.includes(HOME_URL))).toEqual([`browser:${HOME_URL}`]);
  });

  it("is re-verified on the source's own list page waiting for the list's selector", async () => {
    const { calls, dataset } = await midweekOver(LIST_URL);

    expect(calls).toContain(`browser:${LIST_URL} waiting for .event-card`);
    expect(calls.filter((c) => c.includes(LIST_URL))).toEqual([`browser:${LIST_URL} waiting for .event-card`]);
    expect(dataset.events[0]).toMatchObject({ status: "active", verificationFailures: 0, consecutiveOutages: 0 });
  });

  it("has its own page read through the browser, waiting for the source's own-page mark", async () => {
    const { calls, dataset } = await runOver(HOME_URL, OWN_URL);

    expect(calls).toContain(`browser:${OWN_URL} waiting for .game-info`);
    expect(calls).not.toContain(`fetch:${OWN_URL}`);
    expect(dataset.events[0]!.ownPageRead).toMatchObject({ page: OWN_URL });
  });
});

describe("a discovered event on a host no registry source is on", () => {
  it("is re-verified and has its own page read plainly", async () => {
    const { calls, dataset } = await runOver(TICKETS_URL, TICKETS_OWN_URL);

    expect(calls).toContain(`fetch:${TICKETS_URL}`);
    expect(calls).toContain(`fetch:${TICKETS_OWN_URL}`);
    expect(calls.filter((c) => c.includes("tickets.test") && c.startsWith("browser"))).toEqual([]);
    expect(dataset.events[0]).toMatchObject({ status: "active", verificationFailures: 0, ownPageRead: { page: TICKETS_OWN_URL } });
  });

  it("is fetched plainly on a ticketing platform even when a browser source's page is on the platform: the platform is no one source", async () => {
    const onPlatform: Source = { ...source("Platform Venue"), urls: ["https://tickets.test/venue/platform-venue"], fetch: "browser", waitFor: ".listing", eventPageWaitFor: ".show" };
    const { calls } = await runOver(TICKETS_URL, TICKETS_OWN_URL, [stadium, onPlatform]);

    expect(calls).toContain("browser:https://tickets.test/venue/platform-venue waiting for .listing");
    expect(calls).toContain(`fetch:${TICKETS_URL}`);
    expect(calls).toContain(`fetch:${TICKETS_OWN_URL}`);
    expect(calls.filter((c) => c.includes("49ers-vs-chiefs") && c.startsWith("browser"))).toEqual([]);
  });
});
