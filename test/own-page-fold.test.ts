import { describe, expect, it } from "vitest";
import { EVENTS_TO_JUDGE } from "../src/curation.js";
import { emptyDataset, type Dataset } from "../src/dataset.js";
import type { CompletionRequest } from "../src/ports.js";
import type { Source } from "../src/registry.js";
import { candidateAt, judging, source, storedEvent, WEEK_1, WEEK_1_ISO, WEEK_2 } from "./fakes/fixtures.js";
import { testConfig } from "./fakes/config.js";
import type { CannedPage, ScriptedReply } from "./fakes/ports.js";
import { runWith } from "./fakes/run.js";

/**
 * Two records that are one event only once the own-page pass gives one its venue (#289): Charlotte Street's calendar
 * dates Nightshades and names no venue, its own page names the Stern Theater (#267), and another list gives the show
 * at that venue. The run folds them again after the pass, by the fold's rules, before curation.
 */
const charlotte = source("Charlotte Street", { neighborhood: "Crossroads" });
const stern = source("Stern Theater", { neighborhood: "Crossroads" });
const rooms = source("Rooms We Carry", { neighborhood: "Crossroads" });
const CHARLOTTE_URL = charlotte.urls[0]!;
const STERN_URL = stern.urls[0]!;
const OWN_URL = "https://charlottestreet.test/event/nightshades/";
const WHERE = "Where Charlotte Street Stern Theater (3333 Wyoming St)";
const VENUE = "Charlotte Street Stern Theater";
const CALENDAR = { status: 200, body: "<html><body>calendar</body></html>" };
const charlotteList = (date: string) => ({ status: 200, body: `<html><body><div><a href="/event/nightshades/">Nightshades</a> ${date}</div></body></html>` });
const OWN_PAGE = { status: 200, body: `<html><body><h1>Nightshades</h1><p>When November 13 &amp; 14, 2026 ${WHERE}</p></body></html>` };

/** Charlotte Street's reading: a date, a link to the own page, and no venue. */
const venueless = (day: number) =>
  candidateAt(charlotte, { title: "Nightshades", startDate: `2026-11-${day}`, startTime: null, eventLink: 1, dateEvidence: `November ${day}, 2026`, venue: null, venueEvidence: null });
/** A list's reading of the show on November 13 at a venue it names (or none). */
const at = (list: Source, venue: string | null, overrides: Record<string, unknown> = {}) =>
  candidateAt(list, { title: "Nightshades", startDate: "2026-11-13", startTime: null, dateEvidence: "Friday, November 13", venue, venueEvidence: `${venue}, 3333 Wyoming St`, ...overrides });

const listed = (...events: Record<string, unknown>[]): ScriptedReply => ({ value: { events }, costUsd: 0.01 });

/** An own page's reading on the date given, with any other field given. */
const ownPage = (date: string, fields: Record<string, unknown> = {}): ScriptedReply => ({
  value: { date, time: null, timeEvidence: null, price: null, priceEvidence: null, ages: null, agesEvidence: null, days: null, daysEvidence: null, daysLink: null, description: null, ...fields },
  costUsd: 0.002,
});
const placedAtStern = (date: string) => ownPage(date, { venue: VENUE, venueEvidence: WHERE });

/** Curation picking every event it is asked about. */
const pickAll = (request: CompletionRequest) => {
  const ids = [...request.messages[1]!.content.matchAll(/evt_[0-9a-f]{12}/g)].map((m) => m[0]);
  return judging(0.02, ...[...new Set(ids)].map((id) => ({ id, verdict: "pick" as const, reason: "rare" as const, why: "A new piece in a room that seats ninety." })));
};

const runAt = (
  now: Date,
  { sources, pages, completions, dataset = emptyDataset(), curate }: { sources: Source[]; pages: Record<string, CannedPage>; completions: ScriptedReply[]; dataset?: Dataset; curate?: typeof pickAll },
) => runWith(now, dataset, { sources, pages: { [OWN_URL]: OWN_PAGE, ...pages }, completions, config: testConfig({ ownPageReadsPerRun: 150 }), ...(curate ? { curate } : {}) });

/** The ids of every event a curation call was asked to judge. */
const judgedIds = (requests: CompletionRequest[]) =>
  requests
    .filter((r) => r.stage === "curation")
    .flatMap((r) => (JSON.parse(r.messages.at(-1)!.content.split(`${EVENTS_TO_JUDGE}\n\n`)[1]!) as { id: string }[]).map(({ id }) => id));

const live = (dataset: Dataset) => dataset.events.filter((e) => e.status !== "expired");

describe("the fold again after the own-page pass (#289)", () => {
  it("a new venue-less record its own page places at a stored event's venue folds into that record in the same run, and curation never sees it", async () => {
    const first = await runAt(WEEK_1, { sources: [stern], pages: { [STERN_URL]: CALENDAR }, completions: [listed(at(stern, VENUE))] });
    const stored = first.dataset.events[0]!;

    // Charlotte Street gives the show a day later than the Stern's list, so no venue-less rule joins them before the read.
    const { dataset, report, requests } = await runAt(WEEK_2, {
      dataset: first.dataset,
      sources: [stern, charlotte],
      pages: { [STERN_URL]: CALENDAR, [CHARLOTTE_URL]: charlotteList("November 14, 2026") },
      completions: [listed(at(stern, VENUE)), listed(venueless(14)), placedAtStern("2026-11-14")],
    });

    expect(live(dataset)).toEqual([expect.objectContaining({ id: stored.id, status: "active", venue: VENUE })]);
    const folded = dataset.events.find((e) => e.primaryUrl === CHARLOTTE_URL)!;
    expect(folded).toMatchObject({ status: "expired", expiryReason: "duplicate", duplicateOf: stored.id, venue: VENUE });
    expect(judgedIds(requests)).not.toContain(folded.id);
    expect(report.counts.expired.duplicate).toBe(1);
    expect(report.likelyDuplicates).toEqual([]);
  });

  it("a stored venue-less record its own page places is kept when it was seen first, and the record it matched folds into it", async () => {
    // Two shows of the title on the date leave the venue-less record ambiguous, so the fold before the read leaves it be.
    const first = await runAt(WEEK_1, { sources: [charlotte], pages: { [CHARLOTTE_URL]: charlotteList("November 13, 2026") }, completions: [listed(venueless(13)), ownPage("2026-11-13", { venue: null, venueEvidence: null })] });
    const venueLess = first.dataset.events[0]!;
    expect(venueLess).toMatchObject({ status: "unverified" });

    const { dataset, report, requests } = await runAt(WEEK_2, {
      dataset: first.dataset,
      sources: [charlotte, stern, rooms],
      pages: { [CHARLOTTE_URL]: charlotteList("November 13, 2026"), [STERN_URL]: CALENDAR, [rooms.urls[0]!]: CALENDAR },
      completions: [listed(venueless(13)), listed(at(stern, VENUE)), listed(at(rooms, "Rooms We Carry")), placedAtStern("2026-11-13")],
    });

    const sterns = dataset.events.find((e) => e.primaryUrl === STERN_URL)!;
    expect(sterns).toMatchObject({ status: "expired", expiryReason: "duplicate", duplicateOf: venueLess.id });
    expect(dataset.events.find((e) => e.id === venueLess.id)).toMatchObject({ status: "active", venue: VENUE, ownPageRead: { page: OWN_URL } });
    expect(live(dataset).map((e) => e.venue)).toEqual([VENUE, "Rooms We Carry"]);
    expect(judgedIds(requests)).toContain(venueLess.id);
    expect(judgedIds(requests)).not.toContain(sterns.id);
    expect(report.counts.expired.duplicate).toBe(1);
    expect(report.ownPages).toEqual([expect.objectContaining({ source: "Upcoming events", read: 1 })]);
  });

  it("a kept record that takes the placed record's reading takes its own-page read too, so a pick's page is not read again after curation", async () => {
    // Held for promotion and seen first: the fold keeps it, and it takes the active reading under its own id (foldDuplicates).
    const held = storedEvent("Nightshades", {
      start: "2026-11-13",
      venue: VENUE,
      neighborhood: "Crossroads",
      primaryUrl: "https://blog.test/nightshades",
      status: "unverified",
      lead: { lane: "discovery", query: "music events" },
      heldForPromotion: true,
      evidence: { date: "Friday, November 13", venue: `${VENUE}, 3333 Wyoming St` },
    });

    const { dataset, report, requests } = await runAt(WEEK_2, {
      dataset: { ...emptyDataset(), events: [held] },
      sources: [charlotte],
      pages: { [CHARLOTTE_URL]: charlotteList("November 14, 2026") },
      completions: [listed(venueless(14)), placedAtStern("2026-11-14")],
      curate: pickAll,
    });

    expect(dataset.events.find((e) => e.primaryUrl === "https://blog.test/nightshades")).toBeUndefined();
    expect(live(dataset)).toEqual([expect.objectContaining({ id: held.id, firstSeen: WEEK_1_ISO, status: "active", primaryUrl: CHARLOTTE_URL, dontMiss: true, ownPageRead: { page: OWN_URL, on: "2026-10-09" } })]);
    expect(dataset.events.find((e) => e.id !== held.id)).toMatchObject({ status: "expired", expiryReason: "duplicate", duplicateOf: held.id });
    expect(judgedIds(requests)).toEqual([held.id]);
    expect(requests.filter((r) => r.stage === "own-page")).toHaveLength(1);
    expect(report.ownPages).toEqual([expect.objectContaining({ source: "Upcoming events", read: 1 })]);
    // On a registry source's page now, it is released, and the report counts it as the first fold's hold would.
    expect(report.counts.releasedForPromotion).toBe(1);
    expect(report.releasedForPromotion).toEqual([{ host: "charlottestreet.test", events: 1 }]);
  });

  it("a held record the fold keeps, taking an active reading on a page no source is on, is held again, not published", async () => {
    // A Stern Theater record whose page moved off the registry's hosts: re-read there, it names no venue, and its own page names one.
    const MOVED_URL = "https://sterntickets.test/nightshades";
    const MOVED_OWN_URL = "https://sterntickets.test/event/nightshades/";
    const held = storedEvent("Nightshades", {
      start: "2026-11-13",
      venue: VENUE,
      neighborhood: "Crossroads",
      primaryUrl: "https://blog.test/nightshades",
      status: "unverified",
      lead: { lane: "discovery", query: "music events" },
      heldForPromotion: true,
      evidence: { date: "Friday, November 13", venue: `${VENUE}, 3333 Wyoming St` },
    });
    const moved = storedEvent("Nightshades", {
      start: "2026-11-13",
      venue: "Somewhere Else",
      neighborhood: "Crossroads",
      primaryUrl: MOVED_URL,
      firstSeen: "2026-10-05T12:00:00-05:00",
      lead: { lane: "registry", source: stern.name },
      evidence: { date: "Friday, November 13", venue: "Somewhere Else, 1 Main St" },
    });

    const { dataset, report } = await runAt(WEEK_2, {
      dataset: { ...emptyDataset(), events: [held, moved] },
      sources: [stern],
      pages: {
        [STERN_URL]: CALENDAR,
        [MOVED_URL]: { status: 200, body: '<html><body><div><a href="/event/nightshades/">Nightshades</a> November 13, 2026</div></body></html>' },
        [MOVED_OWN_URL]: OWN_PAGE,
      },
      completions: [listed(), listed(at(stern, null, { eventLink: 1, dateEvidence: "November 13, 2026", venueEvidence: null })), placedAtStern("2026-11-13")],
    });

    expect(report.ownPages).toEqual([expect.objectContaining({ read: 1 })]);
    expect(dataset.events.find((e) => e.id === moved.id)).toMatchObject({ status: "expired", expiryReason: "duplicate", duplicateOf: held.id });
    expect(dataset.events.find((e) => e.id === held.id)).toMatchObject({ status: "unverified", heldForPromotion: true, primaryUrl: MOVED_URL });
    expect(dataset.events.filter((e) => e.status === "active")).toEqual([]);
    expect(report.counts).toMatchObject({ heldForPromotion: 0, releasedForPromotion: 0 });
  });

  it("the Nutcracker (#284): the Crossroads run its own page places in the Muriel Kauffman Theatre folds into the Kauffman Center's run, seen first", async () => {
    const kauffman = source("Kauffman Center for the Performing Arts", { neighborhood: "Crossroads", kind: "theater/dance" });
    const crossroads = source("Crossroads Arts District", { neighborhood: "Crossroads", kind: "theater/dance" });
    const folly = source("Folly Theater", { neighborhood: "Crossroads", kind: "theater/dance" });
    const CROSSROADS_URL = crossroads.urls[0]!;
    const BALLET_URL = "https://crossroadsartsdistrict.test/crossroads-events/kansas-city-ballet-presents-the-nutcracker-5/";
    const MURIEL = "Muriel Kauffman Theatre at the Kauffman Center for the Performing Arts";
    const RUN = "November 28 – December 24, 2026";
    const run = { start: "2026-11-28", end: "2026-12-24", recurrence: "limited-run" as const, kind: "theater/dance", neighborhood: "Crossroads" };
    const kauffmans = storedEvent("The Nutcracker", {
      ...run,
      venue: kauffman.name,
      primaryUrl: kauffman.urls[0]!,
      firstSeen: "2026-10-01T21:47:36-05:00",
      lead: { lane: "registry", source: kauffman.name },
      evidence: { date: RUN, venue: `${kauffman.name}, 1601 Broadway` },
    });
    const { venue: _venue, lastVerified: _lastVerified, ...venueLess } = storedEvent("The Nutcracker", {
      ...run,
      primaryUrl: CROSSROADS_URL,
      eventUrl: BALLET_URL,
      firstSeen: "2026-10-07T20:43:52-05:00",
      status: "unverified",
      lead: { lane: "registry", source: crossroads.name },
      evidence: { date: RUN },
    });
    // Another company's Nutcracker on the opening night leaves the venue-less record two candidates, so the first fold leaves it be.
    const follys = storedEvent("The Nutcracker", {
      start: "2026-11-28T19:30:00-06:00",
      venue: folly.name,
      neighborhood: "Crossroads",
      kind: "theater/dance",
      primaryUrl: folly.urls[0]!,
      lead: { lane: "registry", source: folly.name },
      evidence: { date: "Sat, Nov 28 · 7:30 PM", venue: `${folly.name}, 300 W 12th St` },
    });
    const nutcracker = (at: Source, overrides: Record<string, unknown>) =>
      candidateAt(at, { title: "The Nutcracker", startDate: "2026-11-28", endDate: "2026-12-24", startTime: null, dateEvidence: RUN, ...overrides });

    const { dataset, report, requests } = await runWith(WEEK_2, { ...emptyDataset(), events: [kauffmans, venueLess, follys] }, {
      sources: [kauffman, crossroads, folly],
      pages: {
        [kauffman.urls[0]!]: CALENDAR,
        [CROSSROADS_URL]: { status: 200, body: `<html><body><div><a href="/crossroads-events/kansas-city-ballet-presents-the-nutcracker-5/">The Nutcracker</a> ${RUN}</div></body></html>` },
        [folly.urls[0]!]: CALENDAR,
        [BALLET_URL]: { status: 200, body: `<html><body><h1>Kansas City Ballet presents The Nutcracker</h1><p>${RUN}</p><p>${MURIEL}, 1601 Broadway</p></body></html>` },
      },
      completions: [
        listed(nutcracker(kauffman, { venueEvidence: `${kauffman.name}, 1601 Broadway` })),
        listed(nutcracker(crossroads, { eventLink: 1, venue: null, venueEvidence: null })),
        listed(nutcracker(folly, { endDate: null, startTime: "19:30", dateEvidence: "Sat, Nov 28 · 7:30 PM", venueEvidence: `${folly.name}, 300 W 12th St` })),
        ownPage("2026-11-28", { venue: MURIEL, venueEvidence: `${MURIEL}, 1601 Broadway` }),
      ],
      config: testConfig({ ownPageReadsPerRun: 150, venueAliases: { [kauffman.name]: ["Kauffman Center", "Muriel Kauffman Theatre", "Helzberg Hall"] } }),
      curate: pickAll,
    });

    expect(dataset.events.find((e) => e.id === venueLess.id)).toMatchObject({ status: "expired", expiryReason: "duplicate", duplicateOf: kauffmans.id, venue: MURIEL });
    expect(dataset.events.find((e) => e.id === kauffmans.id)).toMatchObject({ status: "active", venue: kauffman.name, dontMiss: true });
    expect(live(dataset).map((e) => e.id)).toEqual([kauffmans.id, follys.id]);
    // One pick for the Nutcracker at the Kauffman, never two.
    expect(new Set(judgedIds(requests))).toEqual(new Set([kauffmans.id, follys.id]));
    expect(report.counts.expired.duplicate).toBe(1);
  });

  it("a run whose own-page pass gives no record a venue folds once: a pair re-verification made waits for the next run's fold, as before", async () => {
    // The Stern's show page, stored with another venue, is re-read this run and now gives the Stern Theater.
    const SHOW_URL = "https://sterntheater.test/shows/nightshades";
    const STERN_OWN_URL = "https://sterntheater.test/event/nightshades/";
    const PRICE = "Tickets $20";
    const moved = storedEvent("Nightshades", {
      start: "2026-11-13",
      venue: "Somewhere Else",
      neighborhood: "Crossroads",
      primaryUrl: SHOW_URL,
      lead: { lane: "registry", source: stern.name },
      evidence: { date: "Friday, November 13", venue: "Somewhere Else, 1 Main St" },
    });

    const { dataset, report } = await runAt(WEEK_2, {
      dataset: { ...emptyDataset(), events: [moved] },
      sources: [stern],
      pages: {
        [STERN_URL]: { status: 200, body: '<html><body><a href="/event/nightshades/">Nightshades</a></body></html>' },
        [SHOW_URL]: CALENDAR,
        [STERN_OWN_URL]: { status: 200, body: `<html><body><h1>Nightshades</h1><p>${PRICE}</p></body></html>` },
      },
      completions: [listed(at(stern, VENUE, { eventLink: 1 })), listed(at(stern, VENUE)), ownPage("2026-11-13", { price: "$20", priceEvidence: PRICE })],
    });

    expect(report.ownPages).toEqual([expect.objectContaining({ read: 1, priced: 1 })]);
    expect(live(dataset).map((e) => [e.primaryUrl, e.venue, e.status])).toEqual([
      [SHOW_URL, VENUE, "active"],
      [STERN_URL, VENUE, "active"],
    ]);
    expect(report.counts.expired.duplicate).toBe(0);
  });
});
