import { describe, expect, it } from "vitest";
import { emptyDataset, type Dataset, type Event } from "../src/dataset.js";
import { coversDays } from "../src/run.js";
import { judging, candidateAt, source, storedEvent, WEEK_1, WEEK_2 } from "./fakes/fixtures.js";
import { testConfig } from "./fakes/config.js";
import type { CompletionRequest } from "../src/ports.js";
import type { ScriptedReply } from "./fakes/ports.js";
import { runWith } from "./fakes/run.js";

// An exhibition already on, its page giving only its closing date ("On view through"), is stored with that end and no
// start (#323). Its span covers today, so its own page is read like any upcoming event's: the description, price and
// age limit, never a time or a start, and a date on the own page is no disagreement.

const nelson = source("Nelson", { kind: "other", neighborhood: "Crossroads" });
const LIST_URL = nelson.urls[0]!;
const OWN_URL = "https://nelson.test/exhibition/goldberg-variations/";
const SHOW_URL = "https://nelson.test/event/gallery-talk/";
const LIST = {
  status: 200,
  body: `<html><body><div><a href="/exhibition/goldberg-variations/">Farhad Ostovani: Goldberg Variations</a> On view through October 23</div><div><a href="/event/gallery-talk/">Gallery Talk</a> Saturday, October 3</div></body></html>`,
};
const TIME_QUOTE = "Museum opens 10:00 am";
const OPENING_QUOTE = "Opened September 1, 2026";
const PRICE_QUOTE = "Admission Free";
const DESCRIPTION = "Drawings and prints Farhad Ostovani made in answer to Bach's Goldberg Variations.";
const OWN_PAGE = {
  status: 200,
  body: `<html><body><h1>Farhad Ostovani: Goldberg Variations</h1><p>${OPENING_QUOTE}</p><p>${TIME_QUOTE}</p><p>${PRICE_QUOTE}</p></body></html>`,
};
const SHOW_PAGE = { status: 200, body: `<html><body><h1>Gallery Talk</h1></body></html>` };

/** The list's reading of the exhibition: no start, an end three weeks out, its own page as link 1. */
const exhibition = (overrides: Record<string, unknown> = {}) =>
  candidateAt(nelson, {
    title: "Farhad Ostovani: Goldberg Variations",
    startDate: null,
    startTime: null,
    endDate: "2026-10-23",
    eventLink: 1,
    dateEvidence: "On view through October 23",
    venueEvidence: "Nelson",
    ...overrides,
  });
/** A dated talk tomorrow, linked as link 2. */
const talk = candidateAt(nelson, { title: "Gallery Talk", startDate: "2026-10-03", startTime: null, eventLink: 2, dateEvidence: "Saturday, October 3", venueEvidence: "Nelson" });

const listed = (...events: Record<string, unknown>[]): ScriptedReply => ({ value: { events }, costUsd: 0.01 });

/** The own page's reading: its opening date and the museum's opening time, which a run already on takes neither of. */
const ownPage = (overrides: Record<string, unknown> = {}): ScriptedReply => ({
  value: {
    date: "2026-09-01",
    time: "10:00",
    timeEvidence: TIME_QUOTE,
    price: "Free",
    priceEvidence: PRICE_QUOTE,
    ages: null,
    agesEvidence: null,
    days: null,
    daysEvidence: null,
    daysLink: null,
    description: DESCRIPTION,
    ...overrides,
  },
  costUsd: 0.002,
});

/** Curation flagging every event it is sent. */
const flagAll = (request: { messages: { content: string }[] }) => {
  const ids = [...request.messages[1]!.content.matchAll(/evt_[0-9a-f]{12}/g)].map((m) => m[0]);
  return judging(0.02, ...[...new Set(ids)].map((id) => ({ id, verdict: "pick" as const, reason: "rare" as const, why: "A rare showing." })));
};

const runAt = (
  now: Date,
  { completions = [listed(exhibition()), ownPage()], dataset = emptyDataset(), ceiling = 150, flag = false }: { completions?: ScriptedReply[]; dataset?: Dataset; ceiling?: number; flag?: boolean } = {},
) =>
  runWith(now, dataset, {
    sources: [nelson],
    pages: { [LIST_URL]: LIST, [OWN_URL]: OWN_PAGE, [SHOW_URL]: SHOW_PAGE },
    completions,
    config: testConfig({ ownPageReadsPerRun: ceiling }),
    ...(flag ? { curate: flagAll } : {}),
  });

const line = (overrides: Record<string, unknown> = {}) => ({
  source: "Upcoming events",
  read: 0,
  timed: 0,
  priced: 0,
  aged: 0,
  dayed: 0,
  described: 0,
  kept: 0,
  left: 0,
  dateDisagreements: 0,
  failed: 0,
  problems: [],
  ...overrides,
});

const ownPageRequests = (requests: CompletionRequest[]) => requests.filter((r) => r.stage === "own-page");

describe("an event already on with no start has its own page read (#323)", () => {
  it("reads the page and fills the description, taking no time and no start, and the own page's date is no disagreement", async () => {
    const { dataset, calls, report } = await runAt(WEEK_1);

    expect(calls).toContain(`fetch:${OWN_URL}`);
    const [event] = dataset.events;
    expect(event).toMatchObject({ status: "active", end: "2026-10-23", price: "Free", description: DESCRIPTION, ownPageRead: { page: OWN_URL, on: "2026-10-02" } });
    expect(event!.start).toBeUndefined();
    expect(event!.evidence.time).toBeUndefined();
    expect(event!.evidence.price).toEqual({ page: OWN_URL, quote: PRICE_QUOTE });
    expect(report.ownPages).toEqual([line({ read: 1, priced: 1, described: 1 })]);
  });

  it("asks for no date and no time: the request names its last day and says the calendar gives no date", async () => {
    const { requests } = await runAt(WEEK_1);

    const [request] = ownPageRequests(requests);
    const system = request!.messages[0]!.content;
    expect(system).not.toContain("undefined");
    expect(system).toContain("- The calendar's last day: 2026-10-23");
    expect(system).toContain("- The calendar gives no date for this event, only its last day: it is already on. Leave date, time and timeEvidence null.");
  });

  it("a second run with the same list keeps the read and spends no call on the own page", async () => {
    const first = await runAt(WEEK_1);

    const kept = await runAt(WEEK_2, { dataset: first.dataset, completions: [listed(exhibition())] });

    expect(kept.calls).not.toContain(`fetch:${OWN_URL}`);
    expect(ownPageRequests(kept.requests)).toEqual([]);
    expect(kept.dataset.events[0]).toMatchObject({ price: "Free", description: DESCRIPTION, ownPageRead: { page: OWN_URL, on: "2026-10-02" }, evidence: { price: { page: OWN_URL, quote: PRICE_QUOTE } } });
    expect(kept.report.ownPages).toEqual([line({ kept: 1 })]);
  });

  it("a new last day drops the kept read, and the page is read again", async () => {
    const first = await runAt(WEEK_1);

    const moved = await runAt(WEEK_2, {
      dataset: first.dataset,
      completions: [listed(exhibition({ endDate: "2026-10-30", dateEvidence: "On view through October 30" })), ownPage()],
    });

    expect(moved.calls).toContain(`fetch:${OWN_URL}`);
    expect(moved.dataset.events[0]).toMatchObject({ end: "2026-10-30", ownPageRead: { page: OWN_URL, on: "2026-10-09" } });
    expect(moved.report.ownPages).toEqual([line({ read: 1, priced: 1 })]);
  });

  it("sorts as nearest among the events due, ahead of tomorrow's dated talk listed before it", async () => {
    const { calls, report } = await runAt(WEEK_1, { ceiling: 1, completions: [listed(talk, exhibition()), ownPage()] });

    expect(calls).toContain(`fetch:${OWN_URL}`);
    expect(calls).not.toContain(`fetch:${SHOW_URL}`);
    expect(report.ownPages).toEqual([line({ read: 1, priced: 1, described: 1, left: 1 })]);
  });

  it("with the pass off, the picks' pass reads one that is a pick", async () => {
    const { dataset, calls, report } = await runAt(WEEK_1, { ceiling: 0, flag: true });

    expect(calls).toContain(`fetch:${OWN_URL}`);
    expect(dataset.events[0]).toMatchObject({ dontMiss: true, description: DESCRIPTION, ownPageRead: { page: OWN_URL, on: "2026-10-02" } });
    expect(dataset.events[0]!.start).toBeUndefined();
    expect(dataset.events[0]!.evidence.time).toBeUndefined();
    expect(report.ownPages).toEqual([line({ source: "Picks", read: 1, priced: 1, described: 1 })]);
  });

  // At the seam this cannot fail on coversDays: expirePast expires the record before the pass sees it. The span test's
  // own case is the unit test of coversDays below.
  it("an event with no start whose end is before today is left out", async () => {
    const { calls, report } = await runAt(WEEK_1, {
      completions: [listed(exhibition({ endDate: "2026-10-01", dateEvidence: "On view through October 1" }))],
    });

    expect(calls).not.toContain(`fetch:${OWN_URL}`);
    expect(report.ownPages).toEqual([]);
  });

  it("an event with neither start nor end (one that recurs) is left out", async () => {
    const { calls, report } = await runAt(WEEK_1, {
      completions: [listed(exhibition({ endDate: null, schedule: "Every Saturday", dateEvidence: "Every Saturday" }))],
    });

    expect(calls).not.toContain(`fetch:${OWN_URL}`);
    expect(report.ownPages).toEqual([]);
  });
});

describe("coversDays: the span test (#151, #253, #323)", () => {
  const FROM = "2026-10-02";
  const TO = "2026-11-27";
  const at = (fields: Partial<Event>) => storedEvent("Span", { start: undefined, end: undefined, ...fields });

  it.each([
    ["no start, an end after the first day", { end: "2026-10-23" }, true],
    ["no start, an end on the first day", { end: FROM }, true],
    ["no start, an end past the last day", { end: "2027-02-28" }, true],
    ["no start, an end before the first day", { end: "2026-10-01" }, false],
    ["neither start nor end", {}, false],
    ["a start in the range", { start: "2026-10-17T20:00:00-05:00" }, true],
    ["a start after the last day", { start: "2026-11-28" }, false],
    ["a start before the first day and no end", { start: "2026-09-01" }, false],
    ["a start before the first day and an end in the range", { start: "2026-09-01", end: "2026-10-23" }, true],
  ] as const)("%s", (_name, fields, covers) => {
    expect(coversDays(at(fields), FROM, TO)).toBe(covers);
  });
});

describe("a midweek pass's window takes in an event already on with no start (#323)", () => {
  /** Three days after WEEK_1's run: local 2026-10-05, a window through 2026-10-15. */
  const MIDWEEK = new Date(WEEK_1.getTime() + 3 * 24 * 60 * 60 * 1000);

  it("re-reads its primary page", async () => {
    const weekly = await runWith(WEEK_1, emptyDataset(), { sources: [nelson], pages: { [LIST_URL]: LIST }, completions: [listed(exhibition())] });
    expect(weekly.dataset.events[0]).toMatchObject({ status: "active", end: "2026-10-23" });

    const { calls, report } = await runWith(MIDWEEK, weekly.dataset, {
      sources: [nelson],
      pages: { [LIST_URL]: LIST },
      completions: [listed(exhibition())],
      reverifyOnly: { days: 10 },
    });

    expect(calls.filter((c) => c.startsWith("fetch:"))).toEqual([`fetch:${LIST_URL}`]);
    expect(report.reverification.pagesRead).toBe(1);
    expect(report.counts.reverified).toBe(1);
  });
});
