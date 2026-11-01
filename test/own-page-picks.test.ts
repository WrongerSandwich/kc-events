import { describe, expect, it } from "vitest";
import { emptyDataset, parseDataset } from "../src/dataset.js";
import { renderReportMarkdown } from "../src/report.js";
import { candidateAt, judging, source, WEEK_1, WEEK_2 } from "./fakes/fixtures.js";
import { testConfig } from "./fakes/config.js";
import type { CannedPage, ScriptedReply } from "./fakes/ports.js";
import type { Source } from "../src/registry.js";
import { runWith } from "./fakes/run.js";

/** Under the test config, which turns the own-page pass off (#254), an own page is read only for a pick (#133). */
const granada = source("Granada", { neighborhood: "Lawrence" });
const LIST_URL = granada.urls[0]!;
const OWN_URL = "https://granada.test/event/black-country-new-road/";
const LIST = {
  status: 200,
  body: `<html><body><div><a href="/event/black-country-new-road/">Black Country, New Road</a> Saturday, October 17 · Granada</div></body></html>`,
};
const TIME_QUOTE = "Saturday, October 17 · Show 8:00 pm";
const PRICE_QUOTE = "Tickets $25 – $45";
const AGES_QUOTE = "This show is All Ages";
const DESCRIPTION = "The English band plays songs from its third record, with Dagmar Zuniga opening.";
const OWN_PAGE = {
  status: 200,
  body: `<html><body><h1>Black Country, New Road</h1><p>${TIME_QUOTE}</p><p>${PRICE_QUOTE}</p><p>${AGES_QUOTE}</p></body></html>`,
};

/** The list's reading: a date and no time, linking the event's own page as link 1. */
const listed = (overrides: Record<string, unknown> = {}, at: Source = granada): ScriptedReply => ({
  value: {
    events: [
      candidateAt(at, {
        title: "Black Country, New Road",
        startDate: "2026-10-17",
        startTime: null,
        eventLink: 1,
        dateEvidence: "Saturday, October 17",
        venueEvidence: "Granada",
        ...overrides,
      }),
    ],
  },
  costUsd: 0.01,
});

/** The own page's reading: every field. */
const ownPage = (overrides: Record<string, unknown> = {}): ScriptedReply => ({
  value: {
    date: "2026-10-17",
    time: "20:00",
    timeEvidence: TIME_QUOTE,
    price: "$25 – $45",
    priceEvidence: PRICE_QUOTE,
    ages: "All Ages",
    agesEvidence: AGES_QUOTE,
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
    sources = [granada],
    pages = {},
    completions = [listed(), ownPage()],
    flag = true,
    dataset = emptyDataset(),
    config = testConfig(),
  }: {
    sources?: Source[];
    pages?: Record<string, CannedPage>;
    completions?: ScriptedReply[];
    flag?: boolean;
    dataset?: ReturnType<typeof emptyDataset>;
    config?: ReturnType<typeof testConfig>;
  } = {},
) =>
  runWith(now, dataset, {
    sources,
    pages: { [LIST_URL]: LIST, [OWN_URL]: OWN_PAGE, ...pages },
    completions,
    config,
    ...(flag ? { curate: flagAll } : {}),
  });

describe("a pick's own page read for its time, price, and ages (#133)", () => {
  it("a pick with an own page gains the time, price, ages, and description, each price and ages with its quote", async () => {
    const { dataset, calls, report } = await runAt(WEEK_1);

    expect(calls).toContain(`fetch:${OWN_URL}`);
    expect(dataset.events[0]).toMatchObject({
      dontMiss: true,
      status: "active",
      start: "2026-10-17T20:00:00-05:00",
      price: "$25 – $45",
      ages: "All Ages",
      description: DESCRIPTION,
      ownPageRead: { page: OWN_URL, on: "2026-10-02" },
      evidence: {
        date: "Saturday, October 17",
        time: { page: OWN_URL, quote: TIME_QUOTE },
        price: { page: OWN_URL, quote: PRICE_QUOTE },
        ages: { page: OWN_URL, quote: AGES_QUOTE },
      },
    });
    expect(report.ownPages).toEqual([
      { source: "Picks", read: 1, timed: 1, priced: 1, aged: 1, dayed: 0, described: 1, kept: 0, left: 0, dateDisagreements: 0, failed: 0, problems: [] },
    ]);
    expect(renderReportMarkdown(report)).toContain("Picks: 1 own page read, 1 time, 1 price, 1 age limit, 0 runs' days, 1 description filled, 0 kept");
  });

  it("the read comes after curation, and asks for the date, time, price, ages, and description", async () => {
    const { requests } = await runAt(WEEK_1);
    expect(requests.map((r) => r.model)).toEqual(["test/extraction", "test/curation", "test/extraction"]);
    const request = requests[2]!;
    expect(request.messages[0]!.content).toContain("TEST EVENT PAGE RULES");
    expect(Object.keys((request.responseFormat.schema as { properties: object }).properties)).toEqual([
      "date",
      "time",
      "timeEvidence",
      "price",
      "priceEvidence",
      "ages",
      "agesEvidence",
      "days",
      "daysEvidence",
      "daysLink",
      "description",
    ]);
  });

  it("an event curation did not flag is never read", async () => {
    const { calls, dataset, report } = await runAt(WEEK_1, { flag: false, completions: [listed()] });
    expect(calls.filter((c) => c.includes(OWN_URL))).toEqual([]);
    expect(dataset.events[0]).not.toHaveProperty("price");
    expect(report.ownPages).toEqual([]);
  });

  it("a pick without an own page is untouched", async () => {
    const { calls, dataset } = await runAt(WEEK_1, { completions: [listed({ eventLink: null })] });
    expect(calls.filter((c) => c.includes(OWN_URL))).toEqual([]);
    expect(dataset.events[0]).toMatchObject({ start: "2026-10-17", dontMiss: true });
    expect(dataset.events[0]).not.toHaveProperty("price");
    expect(dataset.events[0]).not.toHaveProperty("ownPageRead");
  });

  it("a time the list gives stands; the own page's price and ages still join it", async () => {
    const { dataset } = await runAt(WEEK_1, { completions: [listed({ startTime: "19:30", dateEvidence: "Saturday, October 17, 7:30 pm" }), ownPage()] });
    expect(dataset.events[0]).toMatchObject({ start: "2026-10-17T19:30:00-05:00", price: "$25 – $45", ages: "All Ages" });
    expect(dataset.events[0]!.evidence).not.toHaveProperty("time");
  });

  it.each([
    ["the fetch policy refuses it", { [OWN_URL]: "refused" as const }, [listed()]],
    ["the page is gone", { [OWN_URL]: "gone" as const }, [listed()]],
    ["the model call throws", {}, [listed(), new Error("connection reset")]],
  ])("when %s, the pick stays as the list read it, and the report says why", async (_, pages, completions) => {
    const { dataset, report } = await runAt(WEEK_1, { pages, completions });

    expect(dataset.events[0]).toMatchObject({ status: "active", start: "2026-10-17", verificationFailures: 0, consecutiveOutages: 0 });
    expect(dataset.events[0]).not.toHaveProperty("price");
    expect(dataset.events[0]).not.toHaveProperty("ownPageRead");
    expect(report.ownPages[0]).toMatchObject({ source: "Picks", read: 0, failed: 1 });
    expect(report.ownPages[0]!.problems).toEqual([expect.stringContaining(`"Black Country, New Road"`)]);
    expect(renderReportMarkdown(report)).toContain('Picks: "Black Country, New Road"');
  });

  it("a page giving another date takes nothing, and the report says so", async () => {
    const { dataset, report } = await runAt(WEEK_1, { completions: [listed(), ownPage({ date: "2026-10-18" })] });
    expect(dataset.events[0]).toMatchObject({ start: "2026-10-17" });
    expect(dataset.events[0]).not.toHaveProperty("price");
    expect(report.ownPages[0]).toMatchObject({ read: 1, dateDisagreements: 1 });
  });

  it.each([
    ["a price quote not on the page", { priceEvidence: "Tickets $30" }, "price", "not on the page"],
    ["a price its quote does not give", { price: "$30" }, "price", "does not give"],
    ["an age limit its quote does not give", { ages: "21+" }, "ages", "does not give"],
    ["a price with no quote", { priceEvidence: null }, "price", undefined],
    ["a price past its cap", { price: "x".repeat(81), priceEvidence: PRICE_QUOTE }, "price", "cap"],
  ])("%s is dropped, and the rest is taken", async (_, overrides, field, problem) => {
    const { dataset, report } = await runAt(WEEK_1, { completions: [listed(), ownPage(overrides)] });
    expect(dataset.events[0]).not.toHaveProperty(field);
    expect(dataset.events[0]!.evidence).not.toHaveProperty(field);
    expect(dataset.events[0]).toMatchObject({ start: "2026-10-17T20:00:00-05:00" });
    if (problem === undefined) expect(report.ownPages[0]!.problems).toEqual([]);
    else expect(report.ownPages[0]!.problems).toEqual([expect.stringContaining(problem)]);
  });

  it("a description the list already gave in full stands", async () => {
    const long = "A band whose third record moved from post-punk toward chamber pop, playing with Dagmar Zuniga, an Austin songwriter, opening the night.";
    const { dataset, report } = await runAt(WEEK_1, { completions: [listed({ description: long }), ownPage()] });
    expect(dataset.events[0]!.description).toBe(long);
    expect(report.ownPages[0]).toMatchObject({ described: 0 });
  });

  it("a description the length of a listing line is replaced by the own page's", async () => {
    const { dataset } = await runAt(WEEK_1, { completions: [listed({ description: "Black Country, New Road performs with Dagmar Zuniga." }), ownPage()] });
    expect(dataset.events[0]!.description).toBe(DESCRIPTION);
  });

  it("a pick past the horizon or before today is not read", async () => {
    const { calls } = await runAt(WEEK_1, { completions: [listed({ startDate: "2027-03-01" })] });
    expect(calls.filter((c) => c.includes(OWN_URL))).toEqual([]);
  });

  it("a pick already running on the run's date is read, and the read recorded (#151)", async () => {
    const running = { startDate: "2026-09-28", endDate: "2026-10-31", dateEvidence: "Sep 28 – Oct 31" };
    const { calls, dataset, report } = await runAt(WEEK_1, { completions: [listed(running), ownPage({ date: "2026-09-28", time: null, timeEvidence: null })] });
    expect(calls).toContain(`fetch:${OWN_URL}`);
    expect(dataset.events[0]).toMatchObject({ start: "2026-09-28", price: "$25 – $45", ownPageRead: { page: OWN_URL, on: "2026-10-02" } });
    expect(report.ownPages[0]).toMatchObject({ source: "Picks", read: 1, dateDisagreements: 0 });
  });

  it.each([
    ["a pick that ended before today", { startDate: "2026-09-20", endDate: "2026-10-01", dateEvidence: "Sep 20 – Oct 1" }],
    ["a single-day pick dated before today", { startDate: "2026-10-01", dateEvidence: "Thursday, October 1" }],
  ])("%s is not read (#151)", async (_, dates) => {
    const earlier = await runAt(new Date("2026-09-25T12:00:00-05:00"), { pages: { [OWN_URL]: "gone" }, completions: [listed(dates)] });
    expect(earlier.dataset.events[0]).toMatchObject({ status: "active", dontMiss: true });
    const { calls, dataset } = await runAt(WEEK_1, { dataset: earlier.dataset, completions: [listed(dates)] });
    expect(calls.filter((c) => c.includes(OWN_URL))).toEqual([]);
    expect(dataset.events).toHaveLength(1);
    expect(dataset.events[0]).toMatchObject({ status: "expired", dontMiss: true });
    expect(dataset.events[0]).not.toHaveProperty("ownPageRead");
  });

  it("a running pick's read is kept on a later run while the list keeps its dates and own page (#151)", async () => {
    const running = { startDate: "2026-09-28", endDate: "2026-10-31", dateEvidence: "Sep 28 – Oct 31" };
    const first = await runAt(WEEK_1, { completions: [listed(running), ownPage({ date: "2026-09-28", time: null, timeEvidence: null })] });
    const { calls, dataset, report } = await runAt(WEEK_2, { dataset: first.dataset, completions: [listed(running)] });
    expect(calls.filter((c) => c.includes(OWN_URL))).toEqual([]);
    expect(dataset.events[0]).toMatchObject({ price: "$25 – $45", ownPageRead: { page: OWN_URL, on: "2026-10-02" } });
    expect(report.ownPages).toEqual([expect.objectContaining({ source: "Picks", read: 0, kept: 1 })]);
  });

  it("once the spend cap is reached no pick is read, and the shortfall counts it", async () => {
    const { calls, report } = await runAt(WEEK_1, { config: testConfig({ spendCapUsd: 0.025 }), completions: [listed()] });
    expect(calls.filter((c) => c.includes(OWN_URL))).toEqual([]);
    expect(report.spend.shortfall.ownPagesNotRead).toBe(1);
  });

  it("a browser source's pick goes through the browser", async () => {
    const browsed = { ...granada, fetch: "browser" as const };
    const { calls } = await runAt(WEEK_1, { sources: [browsed], completions: [listed({}, browsed), ownPage()] });
    expect(calls).toContain(`browser:${OWN_URL}`);
  });

  it("a browser source's pick never waits for the list's selector, only for its own pages' one (#153)", async () => {
    const listOnly = { ...granada, fetch: "browser" as const, waitFor: ".list-item" };
    const quiet = await runAt(WEEK_1, { sources: [listOnly], completions: [listed({}, listOnly), ownPage()] });
    expect(quiet.calls).toContain(`browser:${LIST_URL} waiting for .list-item`);
    expect(quiet.calls).toContain(`browser:${OWN_URL}`);

    const both = { ...listOnly, eventPageWaitFor: ".showtime" };
    const waiting = await runAt(WEEK_1, { sources: [both], completions: [listed({}, both), ownPage()] });
    expect(waiting.calls).toContain(`browser:${LIST_URL} waiting for .list-item`);
    expect(waiting.calls).toContain(`browser:${OWN_URL} waiting for .showtime`);
  });

  describe("on a later run", () => {
    it("a list giving the same date and own page keeps everything read, and the page is not read again", async () => {
      const first = await runAt(WEEK_1);
      const { dataset, calls, report } = await runAt(WEEK_2, {
        dataset: first.dataset,
        completions: [listed({ description: "Black Country, New Road performs with Dagmar Zuniga." })],
      });

      expect(calls.filter((c) => c.includes(OWN_URL))).toEqual([]);
      expect(dataset.events[0]).toMatchObject({
        start: "2026-10-17T20:00:00-05:00",
        price: "$25 – $45",
        ages: "All Ages",
        description: DESCRIPTION,
        ownPageRead: { page: OWN_URL, on: "2026-10-02" },
        evidence: { price: { quote: PRICE_QUOTE }, ages: { quote: AGES_QUOTE } },
      });
      expect(report.ownPages).toEqual([expect.objectContaining({ source: "Picks", read: 0, kept: 1 })]);
    });

    it("a list giving a description of its own past a list line's length replaces the own page's", async () => {
      const first = await runAt(WEEK_1);
      const revised = "The English band, now a six-piece after its singer left, plays new songs from a live record, with Dagmar Zuniga opening the night.";
      const { dataset } = await runAt(WEEK_2, { dataset: first.dataset, completions: [listed({ description: revised })] });
      expect(dataset.events[0]).toMatchObject({ description: revised, price: "$25 – $45" });
    });

    it("a list giving another date has the page read again, and what it gives on the new date replaces the old", async () => {
      const first = await runAt(WEEK_1);
      const moved = { ...OWN_PAGE, body: OWN_PAGE.body.replace("October 17", "October 18").replace(PRICE_QUOTE, "Free admission") };
      const { dataset, calls } = await runAt(WEEK_2, {
        dataset: first.dataset,
        pages: { [OWN_URL]: moved },
        completions: [
          listed({ startDate: "2026-10-18", dateEvidence: "Sunday, October 18" }),
          ownPage({ date: "2026-10-18", timeEvidence: "Saturday, October 18 · Show 8:00 pm", price: "Free", priceEvidence: "Free admission" }),
        ],
      });

      expect(calls).toContain(`fetch:${OWN_URL}`);
      expect(dataset.events[0]).toMatchObject({ start: "2026-10-18T20:00:00-05:00", price: "Free", ownPageRead: { on: "2026-10-09" } });
    });
  });
});

describe("the dataset schema and an own page's price and ages (#133)", () => {
  it("refuses a price or age limit without its quote, or a quote without its value", async () => {
    const { dataset } = await runAt(WEEK_1);
    const event = dataset.events[0]!;
    const withEvent = (e: unknown) => ({ ...dataset, events: [e] });
    const { price: _, ...unpriced } = event;
    expect(() => parseDataset(withEvent(unpriced))).toThrow(/price/);
    expect(() => parseDataset(withEvent({ ...event, evidence: { ...event.evidence, ages: undefined } }))).toThrow(/ages/);
    expect(() => parseDataset(withEvent({ ...event, price: "x".repeat(81) }))).toThrow();
    expect(parseDataset(withEvent(event)).events[0]).toEqual(event);
  });
});
