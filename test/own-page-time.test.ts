import { describe, expect, it } from "vitest";
import { emptyDataset, parseDataset } from "../src/dataset.js";
import { givesTime } from "../src/own-page.js";
import { renderReportMarkdown } from "../src/report.js";
import { candidateAt, source, WEEK_1, WEEK_2 } from "./fakes/fixtures.js";
import { testConfig } from "./fakes/config.js";
import type { CannedPage, ScriptedReply } from "./fakes/ports.js";
import type { Source } from "../src/registry.js";
import { runWith } from "./fakes/run.js";

/** A source flagged to read each event's own page for the time its list does not give (#123). */
const lied = source("Lied", { neighborhood: "Lawrence", readEventPages: true });
const LIST_URL = lied.urls[0]!;
const OWN_URL = "https://lied.test/event/music-and-mental-health/";
const LIST = {
  status: 200,
  body: `<html><body><div><a href="/event/music-and-mental-health/">Music and Mental Health</a> Monday, October 12 · Lied Center</div></body></html>`,
};
const TIME_QUOTE = "Monday • October 12, 2026 • 7:00 pm";
const OWN_PAGE = { status: 200, body: `<html><body><h1>Music and Mental Health</h1><p>${TIME_QUOTE}</p></body></html>` };

/** The list's reading: a date and no time, linking the event's own page as link 1. */
const listed = (at: Source = lied, overrides: Record<string, unknown> = {}) =>
  ({
    value: {
      events: [
        candidateAt(at, {
          title: "Music and Mental Health",
          startDate: "2026-10-12",
          startTime: null,
          eventLink: 1,
          dateEvidence: "Monday, October 12",
          venueEvidence: "Lied Center",
          ...overrides,
        }),
      ],
    },
    costUsd: 0.01,
  }) satisfies ScriptedReply;

/** The own page's reading. */
const timed = (overrides: Record<string, unknown> = {}): ScriptedReply => ({
  value: { date: "2026-10-12", time: "19:00", timeEvidence: TIME_QUOTE, ...overrides },
  costUsd: 0.002,
});

const runAt = (
  now: Date,
  { sources = [lied], pages = {}, completions = [listed(), timed()], dataset = emptyDataset(), config = testConfig() }: {
    sources?: Source[];
    pages?: Record<string, CannedPage>;
    completions?: ScriptedReply[];
    dataset?: ReturnType<typeof emptyDataset>;
    config?: ReturnType<typeof testConfig>;
  } = {},
) => runWith(now, dataset, { sources, pages: { [LIST_URL]: LIST, [OWN_URL]: OWN_PAGE, ...pages }, completions, config });

describe("an event's own page read for its time (#123)", () => {
  it("a flagged source's event with a date only takes the time its own page gives on that date, quoted from that page", async () => {
    const { dataset, calls, report } = await runAt(WEEK_1);

    expect(calls).toContain(`fetch:${OWN_URL}`);
    expect(dataset.events).toHaveLength(1);
    expect(dataset.events[0]).toMatchObject({
      status: "active",
      start: "2026-10-12T19:00:00-05:00",
      primaryUrl: LIST_URL,
      eventUrl: OWN_URL,
      evidence: { date: "Monday, October 12", venue: "Lied Center", time: { page: OWN_URL, quote: TIME_QUOTE } },
    });
    expect(report.ownPages).toEqual([{ source: "Lied", read: 1, timed: 1, dateDisagreements: 0, failed: 0, problems: [] }]);
  });

  it("the own page's request asks only for the one event's date and time", async () => {
    const { requests } = await runAt(WEEK_1);
    const request = requests[1]!;
    expect(request.model).toBe("test/extraction");
    expect(request.messages[0]!.content).toContain("TEST EVENT PAGE RULES");
    expect(request.messages[1]!.content).toContain("Music and Mental Health");
    expect(request.messages[0]!.content).toContain("2026-10-12");
    expect(request.messages[1]!.content).toContain(TIME_QUOTE);
    expect(Object.keys((request.responseFormat.schema as { properties: object }).properties)).toEqual(["date", "time", "timeEvidence"]);
  });

  it("an own page giving another date leaves the start untimed and says so in the report", async () => {
    const { dataset, report } = await runAt(WEEK_1, { completions: [listed(), timed({ date: "2026-10-13" })] });

    expect(dataset.events[0]).toMatchObject({ status: "active", start: "2026-10-12" });
    expect(dataset.events[0]!.evidence).not.toHaveProperty("time");
    expect(report.ownPages[0]).toMatchObject({ read: 1, timed: 0, dateDisagreements: 1 });
    expect(report.ownPages[0]!.problems).toEqual([`"Music and Mental Health": ${OWN_URL} gives 2026-10-13, the list 2026-10-12; no time taken`]);
    expect(renderReportMarkdown(report)).toContain("gives 2026-10-13, the list 2026-10-12");
  });

  it.each([
    ["the fetch throws", { [OWN_URL]: new Error("socket hang up") }, [listed()]],
    ["the page is gone", { [OWN_URL]: "gone" as const }, [listed()]],
    ["the fetch policy refuses it", { [OWN_URL]: "refused" as const }, [listed()]],
    ["robots.txt disallows it", { [OWN_URL]: "robots-blocked" as const }, [listed()]],
    ["the model call throws", {}, [listed(), new Error("connection reset")]],
    ["the reply is not in the expected shape", {}, [listed(), { value: { nothing: true }, costUsd: 0.001 }]],
  ])("when %s, the event stays as the list read it: active, untimed, no strike or outage, and the run succeeds", async (_, pages, completions) => {
    const { dataset, report } = await runAt(WEEK_1, { pages, completions });

    expect(dataset.events[0]).toMatchObject({ status: "active", start: "2026-10-12", verificationFailures: 0, consecutiveOutages: 0 });
    expect(dataset.events[0]!.evidence).not.toHaveProperty("time");
    expect(report.ownPages[0]).toMatchObject({ timed: 0, failed: 1 });
    expect(report.ownPages[0]!.problems).toHaveLength(1);
  });

  it("an unflagged source's own pages are never fetched", async () => {
    const { readEventPages: _, ...unflagged } = lied;
    const { calls, dataset, report } = await runAt(WEEK_1, { sources: [unflagged], completions: [listed(unflagged)] });

    expect(calls.filter((c) => c.includes(OWN_URL))).toEqual([]);
    expect(dataset.events[0]).toMatchObject({ start: "2026-10-12", eventUrl: OWN_URL });
    expect(report.ownPages).toEqual([]);
  });

  it("a time quote that is not on the own page is dropped, and the event stays untimed", async () => {
    const { dataset, report } = await runAt(WEEK_1, { completions: [listed(), timed({ timeEvidence: "Monday, October 12 at 7:00 pm" })] });

    expect(dataset.events[0]).toMatchObject({ status: "active", start: "2026-10-12" });
    expect(dataset.events[0]!.evidence).not.toHaveProperty("time");
    expect(report.ownPages[0]).toMatchObject({ read: 1, timed: 0 });
    expect(report.ownPages[0]!.problems[0]).toContain("not on the page");
  });

  it("a quote on the page that does not give the time, the date alone, is dropped", async () => {
    const { dataset, report } = await runAt(WEEK_1, { completions: [listed(), timed({ timeEvidence: "October 12, 2026" })] });

    expect(dataset.events[0]).toMatchObject({ status: "active", start: "2026-10-12" });
    expect(report.ownPages[0]!.problems[0]).toContain("does not give 19:00");
  });

  it.each([
    ["no time", { time: null }],
    ["no quote", { timeEvidence: null }],
    ["a time that does not exist", { time: "24:30" }],
  ])("an own page reading with %s fills nothing", async (_, overrides) => {
    const { dataset, report } = await runAt(WEEK_1, { completions: [listed(), timed(overrides)] });
    expect(dataset.events[0]).toMatchObject({ status: "active", start: "2026-10-12" });
    expect(report.ownPages[0]).toMatchObject({ read: 1, timed: 0, dateDisagreements: 0 });
  });

  it("no own page is read for an event the list already times, one with no own page, or one past the horizon", async () => {
    const { calls } = await runAt(WEEK_1, {
      completions: [
        {
          value: {
            events: [
              candidateAt(lied, { title: "Timed", startDate: "2026-10-12", startTime: "19:30", eventLink: 1, dateEvidence: "Monday, October 12", venueEvidence: "Lied Center" }),
              candidateAt(lied, { title: "Linkless", startDate: "2026-10-14", startTime: null, eventLink: null, dateEvidence: "Monday, October 12", venueEvidence: "Lied Center" }),
              candidateAt(lied, { title: "Far Off", startDate: "2027-03-01", startTime: null, eventLink: 1, dateEvidence: "Monday, October 12", venueEvidence: "Lied Center" }),
            ],
          },
          costUsd: 0.01,
        },
      ],
    });
    expect(calls.filter((c) => c.includes(OWN_URL))).toEqual([]);
  });

  it("a browser source's own pages go through the browser", async () => {
    const browsed = { ...lied, fetch: "browser" as const };
    const { calls, dataset } = await runAt(WEEK_1, { sources: [browsed], completions: [listed(browsed), timed()] });
    expect(calls).toContain(`browser:${OWN_URL}`);
    expect(dataset.events[0]!.start).toBe("2026-10-12T19:00:00-05:00");
  });

  it("the own-page call is in the report's call list and counts toward the spend", async () => {
    const { report } = await runAt(WEEK_1);
    expect(report.spend.modelCalls.filter((c) => c.model === "test/extraction").map((c) => c.costUsd)).toEqual([0.01, 0.002]);
    expect(report.spend.totalUsd).toBeCloseTo(0.012);
  });

  it("once the spend cap is reached no own page is read, and the shortfall counts it", async () => {
    const { calls, dataset, report } = await runAt(WEEK_1, { config: testConfig({ spendCapUsd: 0.005 }), completions: [listed()] });
    expect(calls.filter((c) => c.includes(OWN_URL))).toEqual([]);
    expect(dataset.events[0]).toMatchObject({ status: "active", start: "2026-10-12" });
    expect(report.spend.shortfall.ownPagesNotRead).toBe(1);
    expect(report.spend.capHit).toBe(true);
  });

  describe("on a later run", () => {
    it("a list still giving the same date with no time keeps the own page's time, and the own page is not read again", async () => {
      const first = await runAt(WEEK_1);
      const { dataset, calls } = await runAt(WEEK_2, { dataset: first.dataset, completions: [listed()] });

      expect(calls.filter((c) => c.includes(OWN_URL))).toEqual([]);
      expect(dataset.events[0]).toMatchObject({ start: "2026-10-12T19:00:00-05:00", evidence: { time: { page: OWN_URL, quote: TIME_QUOTE } } });
    });

    it("a list giving another date drops the time, and the own page is read again for the new date", async () => {
      const first = await runAt(WEEK_1);
      const moved = { ...OWN_PAGE, body: OWN_PAGE.body.replace("October 12", "October 13") };
      const { dataset, calls } = await runAt(WEEK_2, {
        dataset: first.dataset,
        pages: { [OWN_URL]: moved },
        completions: [listed(lied, { startDate: "2026-10-13", dateEvidence: "Tuesday, October 13" }), timed({ date: "2026-10-13", timeEvidence: "Monday • October 13, 2026 • 7:00 pm" })],
      });

      expect(calls).toContain(`fetch:${OWN_URL}`);
      expect(dataset.events[0]).toMatchObject({ start: "2026-10-13T19:00:00-05:00", evidence: { time: { quote: "Monday • October 13, 2026 • 7:00 pm" } } });
    });

    it("a list giving a time of its own replaces the own page's, and its quote goes", async () => {
      const first = await runAt(WEEK_1);
      const { dataset } = await runAt(WEEK_2, { dataset: first.dataset, completions: [listed(lied, { startTime: "20:00", dateEvidence: "Monday, October 12, 8 pm" })] });

      expect(dataset.events[0]!.start).toBe("2026-10-12T20:00:00-05:00");
      expect(dataset.events[0]!.evidence).not.toHaveProperty("time");
    });
  });
});

describe("whether a quote gives a time", () => {
  it.each([
    ["Monday • October 12, 2026 • 7:00 pm", "19:00"],
    ["7pm", "19:00"],
    ["7 p.m.", "19:00"],
    ["Doors 6, show 19:00", "19:00"],
    ["at 7:30 PM", "19:30"],
    ["10 am tour", "10:00"],
    ["12 noon, or 12 pm", "12:00"],
    ["7.00", "19:00"],
  ])("%s gives %s", (quote, time) => {
    expect(givesTime(quote, time)).toBe(true);
  });

  it.each([
    ["October 12, 2026", "12:00"],
    ["7 pm", "07:00"],
    ["7:00 pm", "07:00"],
    ["7:30 pm", "19:00"],
    ["17:00", "19:00"],
    ["Monday • October 12, 2026", "19:00"],
  ])("%s does not give %s", (quote, time) => {
    expect(givesTime(quote, time)).toBe(false);
  });
});

describe("the dataset schema and the own page's time (#123)", () => {
  it("refuses a time quote on an untimed start, or from a page other than the event's own", async () => {
    const { dataset } = await runAt(WEEK_1);
    const event = dataset.events[0]!;
    const withEvent = (e: unknown) => ({ ...dataset, events: [e] });
    expect(() => parseDataset(withEvent({ ...event, start: "2026-10-12" }))).toThrow(/time/);
    expect(() => parseDataset(withEvent({ ...event, eventUrl: "https://lied.test/event/other/" }))).toThrow(/time/);
    expect(parseDataset(withEvent(event)).events[0]).toEqual(event);
  });
});
