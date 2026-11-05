import { describe, expect, it } from "vitest";
import { emptyDataset } from "../src/dataset.js";
import { candidateAt, source, WEEK_1, WEEK_2 } from "./fakes/fixtures.js";
import { testConfig } from "./fakes/config.js";
import type { CannedPage, ScriptedReply } from "./fakes/ports.js";
import { runWith } from "./fakes/run.js";

/** A calendar that gives each event a date and no venue, and links its own page, where the venue is (#267). */
const charlotte = source("Charlotte Street", { neighborhood: "Crossroads" });
const LIST_URL = charlotte.urls[0]!;
const OWN_URL = "https://charlottestreet.test/event/nightshades/";
const TICKET_URL = "https://www.eventbrite.com/e/nightshades-123";
const WHERE = "Where Charlotte Street Stern Theater (3333 Wyoming St)";
const VENUE = "Charlotte Street Stern Theater";
const listBody = (href: string) => ({ status: 200, body: `<html><body><div><a href="${href}">Nightshades</a> November 13, 2026</div></body></html>` });
const OWN_PAGE = {
  status: 200,
  body: `<html><body><h1>Nightshades</h1><p>When November 13 &amp; 14, 2026 ${WHERE}</p><p>Next Event Artist Market Where Rooms We Carry</p></body></html>`,
};

const nightshades = (overrides: Record<string, unknown> = {}) =>
  candidateAt(charlotte, {
    title: "Nightshades",
    startDate: "2026-11-13",
    startTime: null,
    eventLink: 1,
    dateEvidence: "November 13, 2026",
    venue: null,
    venueEvidence: null,
    ...overrides,
  });

const listed = (...events: Record<string, unknown>[]): ScriptedReply => ({ value: { events }, costUsd: 0.01 });

/** An own page's reading on the list's date, giving the venue quoted as given. */
const ownPage = (venue: string | null, venueEvidence: string | null, date = "2026-11-13"): ScriptedReply => ({
  value: {
    date,
    time: null,
    timeEvidence: null,
    price: null,
    priceEvidence: null,
    ages: null,
    agesEvidence: null,
    days: null,
    daysEvidence: null,
    daysLink: null,
    description: null,
    venue,
    venueEvidence,
  },
  costUsd: 0.002,
});

const runAt = (
  now: Date,
  {
    pages = {},
    completions,
    dataset = emptyDataset(),
    reverifyOnly,
  }: { pages?: Record<string, CannedPage>; completions: ScriptedReply[]; dataset?: ReturnType<typeof emptyDataset>; reverifyOnly?: { days: number } },
) =>
  runWith(now, dataset, {
    sources: [charlotte],
    pages: { [LIST_URL]: listBody("/event/nightshades/"), [OWN_URL]: OWN_PAGE, ...pages },
    completions,
    config: testConfig({ ownPageReadsPerRun: 150 }),
    ...(reverifyOnly && { reverifyOnly }),
  });

/** A Thursday's midweek re-verification, eight days before the show. */
const MIDWEEK = new Date("2026-11-06T03:15:00Z");

describe("an own page supplies the venue its list leaves out (#267)", () => {
  it("a dated list sighting with no venue takes the venue its own page quotes, and is active", async () => {
    const { dataset, requests, report } = await runAt(WEEK_1, { completions: [listed(nightshades()), ownPage(VENUE, WHERE)] });

    const ownPageRequest = requests.find((r) => r.stage === "own-page")!;
    expect(ownPageRequest.messages[0]!.content).toContain("venue");
    expect(dataset.events).toHaveLength(1);
    expect(dataset.events[0]).toMatchObject({
      status: "active",
      venue: VENUE,
      evidence: { date: "November 13, 2026", venue: { page: OWN_URL, quote: WHERE } },
      ownPageRead: { page: OWN_URL, on: "2026-10-02" },
    });
    expect(report.counts.heldUnverified).toBe(0);
  });

  it("a venue quote not on the own page leaves the event unverified, with a line on the report", async () => {
    const { dataset, report } = await runAt(WEEK_1, { completions: [listed(nightshades()), ownPage(VENUE, "Where Charlotte Street Stern Theater, 3333 Wyoming")] });

    expect(dataset.events[0]).toMatchObject({ status: "unverified" });
    expect(dataset.events[0]).not.toHaveProperty("venue");
    expect(report.ownPages[0]!.problems).toEqual([`"Nightshades": ${OWN_URL} quoted "Where Charlotte Street Stern Theater, 3333 Wyoming" for its venue, which is not on the page; no venue taken`]);
  });

  it("a venue quote that does not name the venue leaves it unverified", async () => {
    const { dataset, report } = await runAt(WEEK_1, { completions: [listed(nightshades()), ownPage("Rooms We Carry", WHERE)] });

    expect(dataset.events[0]).toMatchObject({ status: "unverified" });
    expect(report.ownPages[0]!.problems).toEqual([`"Nightshades": ${OWN_URL} quoted "${WHERE}" for its venue, which does not give "Rooms We Carry"; no venue taken`]);
  });

  it("an own page on a ticketing platform is not read for a venue", async () => {
    const { dataset, calls, requests } = await runAt(WEEK_1, {
      pages: { [LIST_URL]: listBody(TICKET_URL), [TICKET_URL]: OWN_PAGE },
      completions: [listed(nightshades())],
    });

    expect(calls).not.toContain(`fetch:${TICKET_URL}`);
    expect(requests.filter((r) => r.stage === "own-page")).toHaveLength(0);
    expect(dataset.events[0]).toMatchObject({ status: "unverified", eventUrl: TICKET_URL });
  });

  it("an event whose list names a venue is not asked for one", async () => {
    const { requests } = await runAt(WEEK_1, {
      completions: [listed(nightshades({ venue: "Charlotte Street", venueEvidence: "Charlotte Street" })), ownPage(null, null)],
      pages: { [LIST_URL]: { status: 200, body: `<html><body><div><a href="/event/nightshades/">Nightshades</a> November 13, 2026 Charlotte Street</div></body></html>` } },
    });

    const ownPageRequest = requests.find((r) => r.stage === "own-page")!;
    expect(JSON.stringify(ownPageRequest.responseFormat)).not.toContain("venueEvidence");
  });

  it("the next run's re-reading, same date, no venue, same own page, keeps it active without a fetch", async () => {
    const first = await runAt(WEEK_1, { completions: [listed(nightshades()), ownPage(VENUE, WHERE)] });

    const { dataset, calls, report } = await runAt(WEEK_2, { dataset: first.dataset, completions: [listed(nightshades())] });
    expect(calls).not.toContain(`fetch:${OWN_URL}`);
    expect(dataset.events[0]).toMatchObject({ status: "active", venue: VENUE, evidence: { venue: { page: OWN_URL, quote: WHERE } }, lastVerified: "2026-10-09T22:15:00-05:00" });
    expect(report.counts.unverifiedByUncitableReading).toBe(0);
    expect(report.ownPages[0]).toMatchObject({ kept: 1, read: 0 });
  });

  it("a midweek re-verification's re-reading keeps it active on the own page's venue", async () => {
    const first = await runAt(WEEK_1, { completions: [listed(nightshades()), ownPage(VENUE, WHERE)] });

    const { dataset, calls } = await runAt(MIDWEEK, { dataset: first.dataset, completions: [listed(nightshades())], reverifyOnly: { days: 10 } });
    expect(calls).not.toContain(`fetch:${OWN_URL}`);
    expect(dataset.events[0]).toMatchObject({ status: "active", venue: VENUE, evidence: { venue: { page: OWN_URL, quote: WHERE } } });
  });

  it("a stored event whose list stops naming its venue takes its own page's, and is not reported as made unverified", async () => {
    const withVenue = { status: 200, body: `<html><body><div><a href="/event/nightshades/">Nightshades</a> November 13, 2026 Charlotte Street's campus</div></body></html>` };
    const first = await runAt(WEEK_1, {
      pages: { [LIST_URL]: withVenue },
      completions: [listed(nightshades({ venue: "Charlotte Street", venueEvidence: "Charlotte Street's campus" })), ownPage(null, null)],
    });
    expect(first.dataset.events[0]).toMatchObject({ status: "active", venue: "Charlotte Street" });

    const { dataset, report } = await runAt(WEEK_2, { dataset: first.dataset, completions: [listed(nightshades()), ownPage(VENUE, WHERE)] });
    expect(dataset.events).toHaveLength(1);
    expect(dataset.events[0]).toMatchObject({ id: first.dataset.events[0]!.id, status: "active", venue: VENUE, evidence: { venue: { page: OWN_URL, quote: WHERE } } });
    expect(report.counts.unverifiedByUncitableReading).toBe(0);
    expect(report.uncitableReadings).toEqual([]);
  });

  it("a stored event whose own page names no venue stays unverified, with a line, and is read again next run", async () => {
    const first = await runAt(WEEK_1, { completions: [listed(nightshades()), ownPage(null, null)] });
    expect(first.dataset.events[0]).toMatchObject({ status: "unverified" });
    expect(first.report.ownPages[0]!.problems).toEqual([`"Nightshades": ${OWN_URL} named no venue for it; no venue taken`]);

    const second = await runAt(WEEK_2, { dataset: first.dataset, completions: [listed(nightshades()), ownPage(VENUE, WHERE)] });
    expect(second.calls).toContain(`fetch:${OWN_URL}`);
    expect(second.dataset.events[0]).toMatchObject({ status: "active", venue: VENUE });
  });

  it("a re-reading on another date reads the own page again", async () => {
    const first = await runAt(WEEK_1, { completions: [listed(nightshades()), ownPage(VENUE, WHERE)] });

    const moved = nightshades({ startDate: "2026-11-14", dateEvidence: "November 14, 2026" });
    const second = await runAt(WEEK_2, {
      dataset: first.dataset,
      pages: { [LIST_URL]: { status: 200, body: `<html><body><div><a href="/event/nightshades/">Nightshades</a> November 14, 2026</div></body></html>` } },
      completions: [listed(moved), ownPage(VENUE, WHERE, "2026-11-14")],
    });
    expect(second.calls).toContain(`fetch:${OWN_URL}`);
    expect(second.dataset.events[0]).toMatchObject({ status: "active", start: "2026-11-14", venue: VENUE, evidence: { date: "November 14, 2026" } });
  });

  it("a list reading that names a venue replaces the own page's", async () => {
    const first = await runAt(WEEK_1, { completions: [listed(nightshades()), ownPage(VENUE, WHERE)] });

    const { dataset } = await runAt(WEEK_2, {
      dataset: first.dataset,
      pages: { [LIST_URL]: { status: 200, body: `<html><body><div><a href="/event/nightshades/">Nightshades</a> November 13, 2026 at Rooms We Carry</div></body></html>` } },
      completions: [listed(nightshades({ venue: "Rooms We Carry", venueEvidence: "at Rooms We Carry" }))],
    });
    expect(dataset.events[0]).toMatchObject({ status: "active", venue: "Rooms We Carry", evidence: { venue: "at Rooms We Carry" } });
  });
});
