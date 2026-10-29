import { describe, expect, it } from "vitest";
import type { RunConfig } from "../src/config.js";
import { discoveryQueries } from "../src/discovery.js";
import { toLocalDate } from "../src/time.js";
import { emptyDataset, type Dataset, type Event } from "../src/dataset.js";
import type { CompletionResult, SearchResult } from "../src/ports.js";
import type { Source } from "../src/registry.js";
import { renderReportMarkdown } from "../src/report.js";
import type { CannedPage } from "./fakes/ports.js";
import { testConfig } from "./fakes/config.js";
import { candidateAt, knuckleheads, PAGE, reply, source, WEEK_1, WEEK_1_ISO, WEEK_2, WEEK_2_ISO } from "./fakes/fixtures.js";
import { runWith } from "./fakes/run.js";

/** The one query the test config makes for a run at `now`: its only kind besides "other", the place, and the horizon's months. */
const queryAt = (config: RunConfig, now: Date) => discoveryQueries(config, toLocalDate(now, config.timezone))[0]!;
const CALENDAR_URL = knuckleheads.urls[0]!;
/** A page on the venue's own site that is not its calendar: its ticketing subdomain. */
const TICKETS_URL = "https://tickets.knuckleheads.test/e/big-show";
/** A page the search ranked, on a site that is nobody's source. */
const ELSEWHERE_URL = "https://kc-shows.test/this-week";
/** A promoter's page found by discovery, which an event cites as its primary page, and another page on that site. */
const PROMOTER_URL = "https://promoter.test/shows/big-show";
const PROMOTER_OTHER_URL = "https://promoter.test/shows/big-show-moved";
/** The promoter's calendar, in the registry: its host is promoted, so what discovery finds there is published rather than held (ADR 0012). */
const promoter = source("Promoter", { urls: ["https://promoter.test/calendar"], neighborhood: "Westport" });
const PROMOTER_CALENDAR = promoter.urls[0]!;
/** An organizer's page on a ticketing platform the config lists, and another organizer's page there. */
const PLATFORM_URL = "https://www.tickets.test/e/big-show";
const PLATFORM_OTHER_URL = "https://www.tickets.test/e/big-show-by-someone-else";

const lead = (url: string): SearchResult => ({ url, title: "A lead", snippet: "Something on in Kansas City" });
/** A candidate for the Big Show at Knuckleheads on a page at `url`, far enough out not to be past. */
const at = (url: string, overrides: Record<string, unknown> = {}) =>
  candidateAt(source("Knuckleheads", { urls: [url], neighborhood: "East Bottoms" }), { startDate: "2026-12-12", dateEvidence: "Sat, Dec 12 · Show 8:00 PM", ...overrides });

/** One run with discovery on and tickets.test a ticketing platform: the registry lane over `sources`, then one search whose results are `leads`. */
function runAt(
  now: Date,
  dataset: Dataset,
  { sources = [], leads = [], pages, completions }: { sources?: Source[]; leads?: string[]; pages: Record<string, CannedPage>; completions: CompletionResult[] },
) {
  const base = testConfig();
  const config = { ...base, discovery: { ...base.discovery, enabled: true, platformHosts: [...base.discovery.platformHosts, "tickets.test"] } };
  return runWith(now, dataset, { sources, pages, completions, config, searches: { [queryAt(config, now)]: leads.map(lead) } });
}

const only = (dataset: Dataset): Event => {
  expect(dataset.events).toHaveLength(1);
  return dataset.events[0]!;
};

/** The first run: Knuckleheads' calendar lists the Big Show, verified. */
const seen = () => runWith(WEEK_1, emptyDataset(), { sources: [knuckleheads], pages: { [CALENDAR_URL]: PAGE }, completions: [reply(at(CALENDAR_URL))] });
/** The first run for a discovery-sourced event: the promoter's page, found by search, lists the Big Show; its calendar in the registry lists nothing. */
const discovered = () =>
  runAt(WEEK_1, emptyDataset(), { sources: [promoter], leads: [PROMOTER_URL], pages: { [PROMOTER_CALENDAR]: PAGE, [PROMOTER_URL]: PAGE }, completions: [reply(), reply(at(PROMOTER_URL))] });

describe("a cancellation counts only from a page that speaks for the event", () => {
  it("a discovered page off the event's site saying cancelled leaves the event as it was, after the registry lane verified it, and the report says who said so", async () => {
    const first = await seen();

    const second = await runAt(WEEK_2, first.dataset, {
      sources: [knuckleheads],
      leads: [ELSEWHERE_URL],
      pages: { [CALENDAR_URL]: PAGE, [ELSEWHERE_URL]: PAGE },
      completions: [reply(at(CALENDAR_URL)), reply(at(ELSEWHERE_URL, { notice: "cancelled" }))],
    });

    expect(only(second.dataset)).toMatchObject({ id: first.dataset.events[0]!.id, status: "active", lastVerified: WEEK_2_ISO });
    expect(second.report.counts.expired.cancelled).toBe(0);
    expect(second.report.cancellationsFromElsewhere).toEqual([{ title: "Big Show", primaryUrl: CALENDAR_URL, reportedBy: ELSEWHERE_URL }]);
    expect(renderReportMarkdown(second.report)).toContain(`## Cancellations from elsewhere\n\n- ${ELSEWHERE_URL} says Big Show (${CALENDAR_URL}) is cancelled; the event was left as it was`);
  });

  it("when no page of its own was read this run, the event goes to re-verification, which decides", async () => {
    const first = await seen();

    // No registry source this run: only the search finds the page saying cancelled, then re-verification reads the calendar.
    const second = await runAt(WEEK_2, first.dataset, {
      leads: [ELSEWHERE_URL],
      pages: { [ELSEWHERE_URL]: PAGE, [CALENDAR_URL]: PAGE },
      completions: [reply(at(ELSEWHERE_URL, { notice: "cancelled" })), reply(at(CALENDAR_URL))],
    });

    expect(second.calls).toContain(`fetch:${CALENDAR_URL}`);
    expect(only(second.dataset)).toMatchObject({ status: "active", lastVerified: WEEK_2_ISO });
    expect(second.report.counts).toMatchObject({ found: 0, reverified: 1 });
    expect(second.report.cancellationsFromElsewhere).toHaveLength(1);
  });

  it("a page on the event's own site, its ticketing subdomain, can cancel it", async () => {
    const first = await seen();

    const second = await runAt(WEEK_2, first.dataset, {
      leads: [TICKETS_URL],
      pages: { [TICKETS_URL]: PAGE },
      completions: [reply(at(TICKETS_URL, { notice: "cancelled" }))],
    });

    expect(only(second.dataset)).toMatchObject({ status: "expired", expiryReason: "cancelled" });
    expect(second.report.cancellationsFromElsewhere).toEqual([]);
  });

  it("a ticketing platform is no one's site: another organizer's page there cannot cancel an event whose primary page is on it", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), { leads: [PLATFORM_URL], pages: { [PLATFORM_URL]: PAGE }, completions: [reply(at(PLATFORM_URL))] });

    // The other page says cancelled; re-verification then reads the event's own page, which still lists it.
    const second = await runAt(WEEK_2, first.dataset, {
      leads: [PLATFORM_OTHER_URL],
      pages: { [PLATFORM_OTHER_URL]: PAGE, [PLATFORM_URL]: PAGE },
      completions: [reply(at(PLATFORM_OTHER_URL, { notice: "cancelled" })), reply(at(PLATFORM_URL))],
    });

    expect(only(second.dataset)).toMatchObject({ id: first.dataset.events[0]!.id, status: "active", primaryUrl: PLATFORM_URL, lastVerified: WEEK_2_ISO });
    expect(second.report.cancellationsFromElsewhere).toEqual([{ title: "Big Show", primaryUrl: PLATFORM_URL, reportedBy: PLATFORM_OTHER_URL }]);
  });

  it("a registry source's page on another site can cancel it: a person admitted that source", async () => {
    const first = await discovered();
    const presenter = source("Presenter", { urls: ["https://presenter.test/season"], neighborhood: "Westport" });

    const second = await runAt(WEEK_2, first.dataset, {
      sources: [promoter, presenter],
      pages: { [PROMOTER_CALENDAR]: PAGE, [presenter.urls[0]!]: PAGE },
      completions: [reply(), reply(at(presenter.urls[0]!, { notice: "cancelled" }))],
    });

    expect(only(second.dataset)).toMatchObject({ status: "expired", expiryReason: "cancelled" });
  });
});

describe("a verified sighting refreshes a known event only from a page that speaks for it", () => {
  /** The dataset with its one event carrying a strike and an outage, to see them cleared. */
  const struck = (dataset: Dataset): Dataset => ({ ...dataset, events: dataset.events.map((e) => ({ ...e, verificationFailures: 1, consecutiveOutages: 1 })) });

  it("a discovered page off the event's site says nothing about it (#78): its own page is re-read, and decides its strikes", async () => {
    const first = await discovered();

    // The other page still lists the show; the event's own page is gone, so its second strike expires it.
    const second = await runAt(WEEK_2, struck(first.dataset), {
      sources: [promoter],
      leads: [ELSEWHERE_URL],
      pages: { [PROMOTER_CALENDAR]: PAGE, [ELSEWHERE_URL]: PAGE, [PROMOTER_URL]: { status: 404, body: "Not Found" } },
      completions: [reply(), reply(at(ELSEWHERE_URL, { startDate: "2026-12-13", dateEvidence: "Sun, Dec 13", venue: "Knuckleheads Saloon", description: "A description from elsewhere." }))],
    });

    expect(second.calls).toContain(`fetch:${PROMOTER_URL}`);
    expect(only(second.dataset)).toMatchObject({ status: "expired", expiryReason: "two-strike", verificationFailures: 2, start: first.dataset.events[0]!.start });
    expect(second.report.counts).toMatchObject({ found: 0, new: 0, updated: 0 });
  });

  it("a discovered page off the event's site clears nothing: its own page, listing it, does", async () => {
    const first = await discovered();

    const second = await runAt(WEEK_2, struck(first.dataset), {
      sources: [promoter],
      leads: [ELSEWHERE_URL],
      pages: { [PROMOTER_CALENDAR]: PAGE, [ELSEWHERE_URL]: PAGE, [PROMOTER_URL]: PAGE },
      completions: [reply(), reply(at(ELSEWHERE_URL)), reply(at(PROMOTER_URL))],
    });

    expect(only(second.dataset)).toEqual({ ...first.dataset.events[0], verificationFailures: 0, consecutiveOutages: 0, lastVerified: WEEK_2_ISO });
    expect(second.report.counts).toMatchObject({ found: 0, reverified: 1 });
  });

  it("a page on the event's own site refreshes it, moving its primary page and reading there", async () => {
    const first = await discovered();

    const second = await runAt(WEEK_2, first.dataset, {
      sources: [promoter],
      leads: [PROMOTER_OTHER_URL],
      pages: { [PROMOTER_CALENDAR]: PAGE, [PROMOTER_OTHER_URL]: PAGE },
      completions: [reply(), reply(at(PROMOTER_OTHER_URL, { startDate: "2026-12-13", dateEvidence: "Sun, Dec 13" }))],
    });

    expect(only(second.dataset)).toMatchObject({
      id: first.dataset.events[0]!.id,
      primaryUrl: PROMOTER_OTHER_URL,
      start: "2026-12-13T20:00:00-06:00",
      lastVerified: WEEK_2_ISO,
      lastChanged: WEEK_2_ISO,
    });
    expect(second.report.counts).toMatchObject({ updated: 1 });
  });

  it("a registry source's page on another site refreshes it", async () => {
    const first = await discovered();

    const second = await runAt(WEEK_2, first.dataset, {
      sources: [promoter, knuckleheads],
      pages: { [PROMOTER_CALENDAR]: PAGE, [CALENDAR_URL]: PAGE },
      completions: [reply(), reply(at(CALENDAR_URL, { startDate: "2026-12-13", dateEvidence: "Sun, Dec 13" }))],
    });

    expect(only(second.dataset)).toMatchObject({ id: first.dataset.events[0]!.id, primaryUrl: CALENDAR_URL, start: "2026-12-13T20:00:00-06:00", lead: { lane: "discovery" } });
  });

  it("a confirming page does not stand in for a verified reading: the event's own site can still refresh it later in the run", async () => {
    const first = await discovered();

    const second = await runAt(WEEK_2, first.dataset, {
      sources: [promoter],
      leads: [ELSEWHERE_URL, PROMOTER_OTHER_URL],
      pages: { [PROMOTER_CALENDAR]: PAGE, [ELSEWHERE_URL]: PAGE, [PROMOTER_OTHER_URL]: PAGE },
      completions: [reply(), reply(at(ELSEWHERE_URL)), reply(at(PROMOTER_OTHER_URL, { startDate: "2026-12-13", dateEvidence: "Sun, Dec 13" }))],
    });

    expect(only(second.dataset)).toMatchObject({ primaryUrl: PROMOTER_OTHER_URL, start: "2026-12-13T20:00:00-06:00" });
  });
});

describe("the stored title across a re-reading", () => {
  const titled = (title: string, now = WEEK_1, dataset = emptyDataset()) =>
    runWith(now, dataset, { sources: [knuckleheads], pages: { [CALENDAR_URL]: PAGE }, completions: [reply(at(CALENDAR_URL, { title }))] });

  it("is kept when the new one is the stored title cut short", async () => {
    const first = await titled("At the Heart of Kansas City / Conservatory Orchestra and Choirs");
    const second = await titled("At the Heart of Kansas City", WEEK_2, first.dataset);
    expect(only(second.dataset)).toMatchObject({ id: first.dataset.events[0]!.id, title: "At the Heart of Kansas City / Conservatory Orchestra and Choirs", lastVerified: WEEK_2_ISO });
  });

  it("is kept when the new one has a series name in front of it, or lacks the stored one's", async () => {
    const bare = await titled("The Wars Before the War");
    const prefixed = await titled("Pershing Lecture Series | The Wars Before the War", WEEK_2, bare.dataset);
    expect(only(prefixed.dataset)).toMatchObject({ title: "The Wars Before the War" });

    const first = await titled("Pershing Lecture Series | The Wars Before the War");
    const second = await titled("The Wars Before the War", WEEK_2, first.dataset);
    expect(only(second.dataset)).toMatchObject({ title: "Pershing Lecture Series | The Wars Before the War" });
  });

  // The 2026-10-26 run's KC Bonzo Blowout (#246): a second reading dropped "6th Annual" and started a second record.
  it("is kept when the new one drops an annual's count in front, or adds it", async () => {
    const first = await titled("6th Annual KC Bonzo Blowout");
    const second = await titled("KC Bonzo Blowout", WEEK_2, first.dataset);
    expect(only(second.dataset)).toMatchObject({ id: first.dataset.events[0]!.id, title: "6th Annual KC Bonzo Blowout", lastVerified: WEEK_2_ISO });

    const bare = await titled("KC Bonzo Blowout");
    const counted = await titled("The 6th Annual KC Bonzo Blowout", WEEK_2, bare.dataset);
    expect(only(counted.dataset)).toMatchObject({ id: bare.dataset.events[0]!.id, title: "KC Bonzo Blowout" });
  });

  // The title rules (#196) strip a venue and a sponsor and take the act over a bare presenter; a stored
  // form from before them gives way to the reading they make, whichever form came first (#217).
  it("takes the stored title without the venue behind it, and keeps it so", async () => {
    const first = await titled("The Berlin Wall. A World Divided. Exhibition at Knuckleheads Saloon");
    const second = await titled("The Berlin Wall. A World Divided.", WEEK_2, first.dataset);
    expect(only(second.dataset)).toMatchObject({ id: first.dataset.events[0]!.id, title: "The Berlin Wall. A World Divided.", lastChanged: WEEK_2_ISO });

    const third = await titled("The Berlin Wall. A World Divided. Exhibition at Knuckleheads Saloon", WEEK_2, second.dataset);
    expect(only(third.dataset)).toMatchObject({ title: "The Berlin Wall. A World Divided." });
  });

  it("keeps an 'at' that does not name the venue: the cut-short reading is only the title's lead", async () => {
    const first = await titled("Breakfast at Tiffany's");
    const second = await titled("Breakfast", WEEK_2, first.dataset);
    expect(only(second.dataset)).toMatchObject({ title: "Breakfast at Tiffany's" });
  });

  it("takes the stored title without the sponsor behind it, and keeps it so", async () => {
    const first = await titled("Yoga at the Garden Presented by Premier Partner Saint Luke's");
    const second = await titled("Yoga at the Garden", WEEK_2, first.dataset);
    expect(only(second.dataset)).toMatchObject({ title: "Yoga at the Garden" });

    const third = await titled("Yoga at the Garden Presented by Premier Partner Saint Luke's", WEEK_2, second.dataset);
    expect(only(third.dataset)).toMatchObject({ title: "Yoga at the Garden" });
  });

  it("takes the act after a stored title that is only the presenter, and keeps it so", async () => {
    const first = await titled("EMAS Presents");
    const second = await titled("EMAS Presents Lilah Powlas", WEEK_2, first.dataset);
    expect(only(second.dataset)).toMatchObject({ title: "EMAS Presents Lilah Powlas" });

    const third = await titled("EMAS Presents", WEEK_2, second.dataset);
    expect(only(third.dataset)).toMatchObject({ title: "EMAS Presents Lilah Powlas" });
  });

  it("takes the new spelling of the same title, as before", async () => {
    const first = await titled("Big Show");
    const second = await titled("BIG SHOW", WEEK_2, first.dataset);
    expect(only(second.dataset)).toMatchObject({ title: "BIG SHOW", lastChanged: WEEK_1_ISO });
  });
});
