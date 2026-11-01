import { describe, expect, it } from "vitest";
import { emptyDataset } from "../src/dataset.js";
import { renderReportMarkdown } from "../src/report.js";
import { candidateAt, judging, source, WEEK_1, WEEK_2 } from "./fakes/fixtures.js";
import { testConfig } from "./fakes/config.js";
import type { CannedPage, ScriptedReply } from "./fakes/ports.js";
import { runWith } from "./fakes/run.js";

/** An unflagged source: every upcoming event's own page is read once, before curation (#254). */
const granada = source("Granada", { neighborhood: "Lawrence" });
const LIST_URL = granada.urls[0]!;
const NEAR_URL = "https://granada.test/event/black-country-new-road/";
const FAR_URL = "https://granada.test/event/second-show/";
/** The list, the farther show first, so the pass's order is its own. */
const LIST = {
  status: 200,
  body: `<html><body><div><a href="/event/second-show/">Second Show</a> Saturday, October 24 · Granada</div><div><a href="/event/black-country-new-road/">Black Country, New Road</a> Saturday, October 17 · Granada</div></body></html>`,
};
const TIME_QUOTE = "Show 8:00 pm";
const PRICE_QUOTE = "Tickets $25 – $45";
const DESCRIPTION = "The English band plays songs from its third record, with Dagmar Zuniga opening.";
const ownPageBody = (title: string) => ({ status: 200, body: `<html><body><h1>${title}</h1><p>${TIME_QUOTE}</p><p>${PRICE_QUOTE}</p></body></html>` });

const near = (overrides: Record<string, unknown> = {}) =>
  candidateAt(granada, {
    title: "Black Country, New Road",
    startDate: "2026-10-17",
    startTime: null,
    eventLink: 2,
    dateEvidence: "Saturday, October 17",
    venueEvidence: "Granada",
    ...overrides,
  });
const far = candidateAt(granada, { title: "Second Show", startDate: "2026-10-24", startTime: null, eventLink: 1, dateEvidence: "Saturday, October 24", venueEvidence: "Granada" });

const listed = (...events: Record<string, unknown>[]): ScriptedReply => ({ value: { events }, costUsd: 0.01 });

/** An own page's reading on the date given. */
const ownPage = (date: string, overrides: Record<string, unknown> = {}): ScriptedReply => ({
  value: {
    date,
    time: "20:00",
    timeEvidence: TIME_QUOTE,
    price: "$25 – $45",
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
  return judging(0.02, ...[...new Set(ids)].map((id) => ({ id, dontMiss: true, why: "A band at a room this size." })));
};

const runAt = (
  now: Date,
  {
    pages = {},
    completions = [listed(near()), ownPage("2026-10-17")],
    dataset = emptyDataset(),
    ceiling = 150,
    flag = false,
    concurrency = 1,
    spendCapUsd = 5,
  }: {
    pages?: Record<string, CannedPage>;
    completions?: ScriptedReply[];
    dataset?: ReturnType<typeof emptyDataset>;
    ceiling?: number;
    flag?: boolean;
    concurrency?: number;
    spendCapUsd?: number;
  } = {},
) =>
  runWith(now, dataset, {
    sources: [granada],
    pages: { [LIST_URL]: LIST, [NEAR_URL]: ownPageBody("Black Country, New Road"), [FAR_URL]: ownPageBody("Second Show"), ...pages },
    completions,
    config: testConfig({ ownPageReadsPerRun: ceiling, concurrency, spendCapUsd }),
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

describe("every upcoming event's own page read once (#254)", () => {
  it("an event curation does not flag has its own page read before curation, and curation is sent the description it gave", async () => {
    const { dataset, requests, report } = await runAt(WEEK_1);

    expect(requests.map((r) => r.model)).toEqual(["test/extraction", "test/extraction", "test/curation"]);
    expect(requests[2]!.messages[1]!.content).toContain(DESCRIPTION);
    expect(dataset.events[0]).toMatchObject({
      dontMiss: false,
      start: "2026-10-17T20:00:00-05:00",
      price: "$25 – $45",
      description: DESCRIPTION,
      ownPageRead: { page: NEAR_URL, on: "2026-10-02" },
    });
    expect(report.ownPages).toEqual([line({ read: 1, timed: 1, priced: 1, described: 1 })]);
    expect(renderReportMarkdown(report)).toContain("Upcoming events: 1 own page read, 1 time, 1 price, 0 age limits, 0 runs' days, 1 description filled, 0 kept from an earlier read, 0 left for next run");
  });

  it("the read is kept while the list gives the same date and own page, and made again on a new date", async () => {
    const first = await runAt(WEEK_1);

    const kept = await runAt(WEEK_2, { dataset: first.dataset, completions: [listed(near())] });
    expect(kept.calls).not.toContain(`fetch:${NEAR_URL}`);
    expect(kept.dataset.events[0]).toMatchObject({ price: "$25 – $45", description: DESCRIPTION, ownPageRead: { page: NEAR_URL, on: "2026-10-02" } });
    expect(kept.report.ownPages).toEqual([line({ kept: 1 })]);

    const moved = await runAt(WEEK_2, {
      dataset: first.dataset,
      completions: [listed(near({ startDate: "2026-10-18", dateEvidence: "Sunday, October 18" })), ownPage("2026-10-18")],
    });
    expect(moved.calls).toContain(`fetch:${NEAR_URL}`);
    expect(moved.dataset.events[0]).toMatchObject({ start: "2026-10-18T20:00:00-05:00", ownPageRead: { page: NEAR_URL, on: "2026-10-09" } });
    expect(moved.report.ownPages).toEqual([line({ read: 1, timed: 1, priced: 1 })]);
  });

  it("the ceiling reads the nearest events first and leaves the farthest for the next run, which reads it", async () => {
    const first = await runAt(WEEK_1, { ceiling: 1, completions: [listed(far, near()), ownPage("2026-10-17")] });

    expect(first.calls).toContain(`fetch:${NEAR_URL}`);
    expect(first.calls).not.toContain(`fetch:${FAR_URL}`);
    expect(first.report.ownPages).toEqual([line({ read: 1, timed: 1, priced: 1, described: 1, left: 1 })]);
    expect(first.report.spend.shortfall.ownPagesNotRead).toBe(0);
    expect(renderReportMarkdown(first.report)).toContain("1 left for next run");

    const second = await runAt(WEEK_2, { ceiling: 1, dataset: first.dataset, completions: [listed(far, near()), ownPage("2026-10-24")] });
    expect(second.calls).toContain(`fetch:${FAR_URL}`);
    expect(second.report.ownPages).toEqual([line({ read: 1, timed: 1, priced: 1, described: 1, kept: 1 })]);
  });

  it.each([1, 4])("a host whose robots.txt refuses an own page is tried once a run: one line for it, and no model call (%i at once)", async (concurrency) => {
    const { calls, requests, dataset, report } = await runAt(WEEK_1, {
      pages: { [NEAR_URL]: "robots-blocked", [FAR_URL]: "robots-blocked" },
      completions: [listed(far, near())],
      concurrency,
    });

    expect(calls.filter((c) => c.startsWith("robots-blocked:"))).toEqual([`robots-blocked:${NEAR_URL}`]);
    expect(requests.map((r) => r.model)).toEqual(["test/extraction", "test/curation"]);
    expect(dataset.events.every((e) => e.ownPageRead === undefined && e.status === "active")).toBe(true);
    expect(report.ownPages).toEqual([
      line({ failed: 1, problems: [`granada.test: robots.txt disallows ${NEAR_URL} ("Black Country, New Road"); 1 more own page on it not fetched this run`] }),
    ]);
  });

  it("an event already judged is judged again once its own page gives it a description", async () => {
    const first = await runAt(WEEK_1, { pages: { [NEAR_URL]: "gone" } });
    expect(first.dataset.events[0]).not.toHaveProperty("description");
    expect(first.dataset.events[0]!.lastJudged).toBeDefined();

    const { requests, dataset } = await runAt(WEEK_2, { dataset: first.dataset });
    const curation = requests.filter((r) => r.model === "test/curation");
    expect(curation).toHaveLength(1);
    expect(curation[0]!.messages[1]!.content).toContain(DESCRIPTION);
    expect(dataset.events[0]).toMatchObject({ description: DESCRIPTION, lastChanged: dataset.events[0]!.lastJudged });
  });

  it("an event running since before today is as near as today, not nearer", async () => {
    const tonight = near({ startDate: "2026-10-02", dateEvidence: "Friday, October 2" });
    const running = { ...far, startDate: "2026-09-28", endDate: "2026-10-31", dateEvidence: "Sep 28 – Oct 31" };
    const { calls } = await runAt(WEEK_1, { ceiling: 1, completions: [listed(tonight, running), ownPage("2026-10-02")] });

    expect(calls).toContain(`fetch:${NEAR_URL}`);
    expect(calls).not.toContain(`fetch:${FAR_URL}`);
  });

  it("a pick the spend cap kept the pass from reading counts once in the shortfall", async () => {
    const { calls, report } = await runAt(WEEK_1, { flag: true, spendCapUsd: 0.005, completions: [listed(near())] });

    expect(calls).not.toContain(`fetch:${NEAR_URL}`);
    expect(report.spend.shortfall.ownPagesNotRead).toBe(1);
  });

  it("a pick the pass read is not read again after curation", async () => {
    const { calls, requests, report } = await runAt(WEEK_1, { flag: true });

    expect(calls.filter((c) => c === `fetch:${NEAR_URL}`)).toHaveLength(1);
    expect(requests.map((r) => r.model)).toEqual(["test/extraction", "test/extraction", "test/curation"]);
    expect(report.ownPages.map((o) => o.source)).toEqual(["Upcoming events"]);
  });

  it("a pick the ceiling left is read after curation, on the Picks line", async () => {
    const { dataset, requests, report } = await runAt(WEEK_1, { ceiling: 1, flag: true, completions: [listed(far, near()), ownPage("2026-10-17"), ownPage("2026-10-24")] });

    expect(requests.map((r) => r.model)).toEqual(["test/extraction", "test/extraction", "test/curation", "test/extraction"]);
    expect(dataset.events.every((e) => e.ownPageRead !== undefined)).toBe(true);
    expect(report.ownPages).toEqual([
      line({ read: 1, timed: 1, priced: 1, described: 1, left: 1 }),
      line({ source: "Picks", read: 1, timed: 1, priced: 1, described: 1 }),
    ]);
  });

  it("an event past the horizon, or without an own page, is not read", async () => {
    const { calls, report } = await runAt(WEEK_1, {
      completions: [listed({ ...far, startDate: "2026-12-26", dateEvidence: "Saturday, December 26" }, near({ eventLink: null }))],
    });
    expect(calls.filter((c) => c.includes("/event/"))).toEqual([]);
    expect(report.ownPages).toEqual([]);
  });
});
