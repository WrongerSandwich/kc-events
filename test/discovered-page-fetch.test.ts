import { describe, expect, it } from "vitest";
import { emptyDataset, type Event } from "../src/dataset.js";
import type { Source } from "../src/registry.js";
import type { ScriptedReply } from "./fakes/ports.js";
import { candidateAt, PAGE, reply, source, storedEvent, WEEK_1 } from "./fakes/fixtures.js";
import { testConfig } from "./fakes/config.js";
import { runWith } from "./fakes/run.js";

/**
 * A page discovery found on an active registry source's host is fetched that source's way (#287): a
 * site that answers the plain fetcher 406, which its source meets with `fetch: browser` (#58), is met
 * the same way whichever lane found the event. On any other host a discovered page is fetched plainly.
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

/**
 * One run over the stadium's source, whose list reads as listing nothing, and a dataset holding the one
 * discovered game, on a primary page that links its own page.
 */
const runOver = (primaryUrl: string, ownUrl: string) =>
  runWith(WEEK_1, { ...emptyDataset(), events: [discovered(primaryUrl, ownUrl)] }, {
    sources: [stadium],
    pages: { [LIST_URL]: PAGE, [primaryUrl]: { status: 200, body: `<html><body><a href="${ownUrl}">49ers vs Chiefs</a></body></html>` }, [ownUrl]: PAGE },
    completions: [reply(), stillListed, ownRead],
    config,
  });

describe("a discovered event on a browser-fetched source's host (#287)", () => {
  it("is re-verified through the browser, waiting for the source's listing", async () => {
    const { calls, dataset } = await runOver(HOME_URL, OWN_URL);

    expect(calls).toContain(`browser:${HOME_URL} waiting for .event-card`);
    expect(calls).not.toContain(`fetch:${HOME_URL}`);
    expect(dataset.events[0]).toMatchObject({ status: "active", verificationFailures: 0, consecutiveOutages: 0, lead: { lane: "discovery" } });
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
});
