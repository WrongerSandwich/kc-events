import { describe, expect, it } from "vitest";
import { emptyDataset, parseDataset } from "../src/dataset.js";
import { givesDays } from "../src/own-page.js";
import { renderReportMarkdown } from "../src/report.js";
import { candidateAt, judging, source, WEEK_1, WEEK_2 } from "./fakes/fixtures.js";
import { testConfig } from "./fakes/config.js";
import type { CannedPage, ScriptedReply } from "./fakes/ports.js";
import type { Source } from "../src/registry.js";
import { runWith } from "./fakes/run.js";

/** A theatre whose season page gives each production's span only (#143). */
const coterie = source("Coterie", { neighborhood: "Crossroads" });
const LIST_URL = coterie.urls[0]!;
const OWN_URL = "https://coterie.test/season/electric-poe/";
const TICKETS_URL = "https://ci.tickets.test/34948/production/1272230";
const LIST = {
  status: 200,
  body: `<html><body><div><a href="/season/electric-poe/">Electric Poe</a> OCT 14 – NOV 1 · Union Cemetery</div></body></html>`,
};
const DAYS_QUOTE = "Performances Fridays, Saturdays and Sundays at sunset";
const OWN_PAGE = {
  status: 200,
  body: `<html><body><h1>Electric Poe</h1><p>OCT 14 – NOV 1</p><p>${DAYS_QUOTE}</p><a href="${TICKETS_URL}">Get Tickets</a></body></html>`,
};
/** An own page giving the span only, linking its ticket page as link 1. */
const SPAN_ONLY = {
  status: 200,
  body: `<html><body><h1>Electric Poe</h1><p>OCT 14 – NOV 1</p><p>AGES 10+</p><a href="${TICKETS_URL}">Get Tickets</a></body></html>`,
};
const TICKET_QUOTE = "Friday 16 October 2026 6:30 pm Saturday 17 October 2026 6:30 pm Sunday 18 October 2026 6:30 pm";
const TICKET_PAGE = { status: 200, body: `<html><body><h1>Electric Poe 2026</h1><p>${TICKET_QUOTE}</p></body></html>` };

/** The list's reading: a run from Oct 14 through Nov 1, linking its own page as link 1. */
const listed = (overrides: Record<string, unknown> = {}, at: Source = coterie): ScriptedReply => ({
  value: {
    events: [
      candidateAt(at, {
        title: "Electric Poe",
        startDate: "2026-10-14",
        startTime: null,
        endDate: "2026-11-01",
        eventLink: 1,
        dateEvidence: "OCT 14 – NOV 1",
        venueEvidence: "Union Cemetery",
        ...overrides,
      }),
    ],
  },
  costUsd: 0.01,
});

/** The own page's reading: the days and nothing else. */
const ownPage = (overrides: Record<string, unknown> = {}): ScriptedReply => ({
  value: {
    date: null,
    time: null,
    timeEvidence: null,
    price: null,
    priceEvidence: null,
    ages: null,
    agesEvidence: null,
    days: ["Fri", "Sat", "Sun"],
    daysEvidence: DAYS_QUOTE,
    daysLink: null,
    description: null,
    ...overrides,
  },
  costUsd: 0.002,
});

/** Curation flagging every event it is sent. */
const flagAll = (request: { messages: { content: string }[] }) => {
  const ids = [...request.messages[1]!.content.matchAll(/evt_[0-9a-f]{12}/g)].map((m) => m[0]);
  return judging(0.02, ...[...new Set(ids)].map((id) => ({ id, dontMiss: true, why: "Poe at sunset in a cemetery." })));
};

/** The test config with the ticket page's host a ticketing platform whose pages render by script. */
const platformConfig = () => {
  const config = testConfig();
  return testConfig({
    discovery: { ...config.discovery, platformHosts: [...config.discovery.platformHosts, "tickets.test"], platformWaitFor: { "tickets.test": ".ot_eventDateTitle" } },
  });
};

const runAt = (
  now: Date,
  {
    pages = {},
    completions = [listed(), ownPage()],
    dataset = emptyDataset(),
    config = platformConfig(),
  }: { pages?: Record<string, CannedPage>; completions?: ScriptedReply[]; dataset?: ReturnType<typeof emptyDataset>; config?: ReturnType<typeof testConfig> } = {},
) =>
  runWith(now, dataset, {
    sources: [coterie],
    pages: { [LIST_URL]: LIST, [OWN_URL]: OWN_PAGE, [TICKETS_URL]: TICKET_PAGE, ...pages },
    completions,
    config,
    curate: flagAll,
  });

describe("the weekdays a limited run plays, from its own page (#143)", () => {
  it("a run whose own page states its days gains them, with their quote", async () => {
    const { dataset, report } = await runAt(WEEK_1);
    expect(dataset.events[0]).toMatchObject({
      recurrence: "limited-run",
      start: "2026-10-14",
      end: "2026-11-01",
      days: ["Fri", "Sat", "Sun"],
      evidence: { days: { page: OWN_URL, quote: DAYS_QUOTE } },
    });
    expect(report.ownPages[0]).toMatchObject({ source: "Picks", read: 1, dayed: 1 });
    expect(renderReportMarkdown(report)).toContain("1 run's days");
  });

  it("the read asks for the days, their quote, and a link to the performances", async () => {
    const { requests } = await runAt(WEEK_1);
    const properties = Object.keys((requests[2]!.responseFormat.schema as { properties: object }).properties);
    expect(properties).toEqual(expect.arrayContaining(["days", "daysEvidence", "daysLink"]));
  });

  it("days come back in week order, each once", async () => {
    const { dataset } = await runAt(WEEK_1, { completions: [listed(), ownPage({ days: ["Sun", "Fri", "Sat", "Fri"] })] });
    expect(dataset.events[0]!.days).toEqual(["Fri", "Sat", "Sun"]);
  });

  it.each([
    ["a quote not on the page", { daysEvidence: "Thursdays through Sundays" }, "not on the page"],
    ["a quote that does not give the days", { days: ["Thu", "Fri"], daysEvidence: "Fridays, Saturdays and Sundays" }, "does not give"],
    ["every day of the week", { days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], daysEvidence: DAYS_QUOTE }, "every day"],
    ["days with no quote", { daysEvidence: null }, undefined],
  ])("%s leaves the run without days", async (_, overrides, problem) => {
    const { dataset, report } = await runAt(WEEK_1, { completions: [listed(), ownPage(overrides)] });
    expect(dataset.events[0]).not.toHaveProperty("days");
    expect(dataset.events[0]!.evidence).not.toHaveProperty("days");
    if (problem === undefined) expect(report.ownPages[0]!.problems).toEqual([]);
    else expect(report.ownPages[0]!.problems).toEqual([expect.stringContaining(problem)]);
  });

  it("a one-off takes no days, whatever the page says", async () => {
    const oneNight = { ...OWN_PAGE, body: OWN_PAGE.body.replace("OCT 14 – NOV 1", "Saturday, October 17") };
    const { dataset } = await runAt(WEEK_1, {
      pages: { [OWN_URL]: oneNight },
      completions: [listed({ startDate: "2026-10-17", endDate: null, dateEvidence: "OCT 14 – NOV 1" }), ownPage()],
    });
    expect(dataset.events[0]).toMatchObject({ recurrence: "one-off" });
    expect(dataset.events[0]).not.toHaveProperty("days");
  });

  describe("an own page giving the span only, linking its ticket page", () => {
    const followed = (ticketReply: Record<string, unknown> = {}) => [
      listed(),
      ownPage({ days: null, daysEvidence: null, daysLink: 1 }),
      ownPage({ days: ["Fri", "Sat", "Sun"], daysEvidence: TICKET_QUOTE, ...ticketReply }),
    ];

    it("the ticket page is fetched, the platform's way, and its performances give the days", async () => {
      const { dataset, calls, requests, report } = await runAt(WEEK_1, { pages: { [OWN_URL]: SPAN_ONLY }, completions: followed() });
      expect(calls).toContain(`browser:${TICKETS_URL} waiting for .ot_eventDateTitle`);
      expect(requests[3]!.messages[0]!.content).toContain("ticket page");
      expect(dataset.events[0]).toMatchObject({
        days: ["Fri", "Sat", "Sun"],
        evidence: { days: { page: TICKETS_URL, quote: TICKET_QUOTE } },
        ownPageRead: { page: OWN_URL, on: "2026-10-02" },
      });
      expect(report.ownPages[0]).toMatchObject({ read: 1, dayed: 1, failed: 0 });
    });

    it("a ticket page off a ticketing platform and off the venue's site is not followed", async () => {
      const elsewhere = "https://example.test/tickets/1";
      const { dataset, calls, report } = await runAt(WEEK_1, {
        pages: { [OWN_URL]: { status: 200, body: SPAN_ONLY.body.replace(TICKETS_URL, elsewhere) } },
        completions: [listed(), ownPage({ days: null, daysEvidence: null, daysLink: 1 })],
      });
      expect(calls.filter((c) => c.includes(elsewhere))).toEqual([]);
      expect(dataset.events[0]).not.toHaveProperty("days");
      expect(report.ownPages[0]!.problems).toEqual([expect.stringContaining("not on the venue's site or a ticketing platform")]);
    });

    it("a link number the page does not have is not followed", async () => {
      const { calls, report } = await runAt(WEEK_1, { pages: { [OWN_URL]: SPAN_ONLY }, completions: [listed(), ownPage({ days: null, daysEvidence: null, daysLink: 7 })] });
      expect(calls.filter((c) => c.includes(TICKETS_URL))).toEqual([]);
      expect(report.ownPages[0]!.problems).toEqual([expect.stringContaining("link 7")]);
    });

    it("a ticket page that fails leaves the run without days and the read unrecorded, and the next run follows it again", async () => {
      const failed = await runAt(WEEK_1, {
        pages: { [OWN_URL]: SPAN_ONLY, [TICKETS_URL]: "gone" },
        completions: [listed(), ownPage({ days: null, daysEvidence: null, daysLink: 1, ages: "AGES 10+", agesEvidence: "AGES 10+" })],
      });
      expect(failed.dataset.events[0]).not.toHaveProperty("days");
      expect(failed.dataset.events[0]).not.toHaveProperty("ownPageRead");
      expect(failed.report.ownPages[0]!.problems).toEqual([expect.stringContaining(`${TICKETS_URL}: HTTP 404; no days taken, read again next run`)]);

      const { dataset, calls } = await runAt(WEEK_2, {
        dataset: failed.dataset,
        pages: { [OWN_URL]: SPAN_ONLY },
        completions: [listed(), ownPage({ days: null, daysEvidence: null, daysLink: 1 }), ownPage({ daysEvidence: TICKET_QUOTE })],
      });
      expect(calls).toContain(`browser:${TICKETS_URL} waiting for .ot_eventDateTitle`);
      expect(dataset.events[0]).toMatchObject({ days: ["Fri", "Sat", "Sun"], ownPageRead: { page: OWN_URL, on: "2026-10-09" } });
    });

    it("a ticket page whose quote fails is read, and the read is recorded", async () => {
      const { dataset } = await runAt(WEEK_1, { pages: { [OWN_URL]: SPAN_ONLY }, completions: followed({ daysEvidence: DAYS_QUOTE }) });
      expect(dataset.events[0]).toMatchObject({ ownPageRead: { page: OWN_URL } });
    });

    it("a ticket page quote not on that page gives no days", async () => {
      const { dataset, report } = await runAt(WEEK_1, { pages: { [OWN_URL]: SPAN_ONLY }, completions: followed({ daysEvidence: DAYS_QUOTE }) });
      expect(dataset.events[0]).not.toHaveProperty("days");
      expect(report.ownPages[0]!.problems).toEqual([expect.stringContaining("not on the page")]);
    });

    it("an own page that gives its days is not followed further", async () => {
      const { calls } = await runAt(WEEK_1, { completions: [listed(), ownPage({ daysLink: 1 })] });
      expect(calls.filter((c) => c.includes(TICKETS_URL))).toEqual([]);
    });
  });

  describe("on a later run", () => {
    it("a list giving the same date and own page keeps the days, and neither page is read again", async () => {
      const first = await runAt(WEEK_1, {
        pages: { [OWN_URL]: SPAN_ONLY },
        completions: [listed(), ownPage({ days: null, daysEvidence: null, daysLink: 1 }), ownPage({ daysEvidence: TICKET_QUOTE })],
      });
      const { dataset, calls } = await runAt(WEEK_2, { dataset: first.dataset, completions: [listed()] });
      expect(calls.filter((c) => c.includes(OWN_URL) || c.includes(TICKETS_URL))).toEqual([]);
      expect(dataset.events[0]).toMatchObject({ days: ["Fri", "Sat", "Sun"], evidence: { days: { page: TICKETS_URL, quote: TICKET_QUOTE } } });
    });

    it("a list giving another span drops the days and the page is read again", async () => {
      const first = await runAt(WEEK_1);
      const { dataset, calls } = await runAt(WEEK_2, {
        dataset: first.dataset,
        completions: [listed({ startDate: "2026-10-16", dateEvidence: "OCT 16 – NOV 1" }), ownPage({ days: null, daysEvidence: null })],
        pages: { [LIST_URL]: { status: 200, body: LIST.body.replace("OCT 14", "OCT 16") } },
      });
      expect(calls).toContain(`fetch:${OWN_URL}`);
      expect(dataset.events[0]).not.toHaveProperty("days");
    });
  });
});

describe("the dataset schema and a run's days (#143)", () => {
  it("takes days only on a limited run, with their quote, in week order", async () => {
    const { dataset } = await runAt(WEEK_1);
    const event = dataset.events[0]!;
    const withEvent = (e: unknown) => ({ ...dataset, events: [e] });
    expect(parseDataset(withEvent(event)).events[0]).toEqual(event);
    const { days: _, ...undayed } = event;
    expect(() => parseDataset(withEvent(undayed))).toThrow(/days/);
    expect(() => parseDataset(withEvent({ ...event, evidence: { ...event.evidence, days: undefined } }))).toThrow(/days/);
    expect(() => parseDataset(withEvent({ ...event, recurrence: "one-off" }))).toThrow(/limited run/);
    expect(() => parseDataset(withEvent({ ...event, days: ["Sun", "Fri"] }))).toThrow(/week order/);
    expect(() => parseDataset(withEvent({ ...event, days: ["Fri", "Fri"] }))).toThrow(/week order/);
    expect(() => parseDataset(withEvent({ ...event, days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] }))).toThrow();
    expect(() => parseDataset(withEvent({ ...event, days: ["Friday"] }))).toThrow();
    expect(() => parseDataset(withEvent({ ...event, evidence: { ...event.evidence, days: { page: "https://example.test/x", quote: DAYS_QUOTE } } }))).toThrow(/days/);
  });
});

describe("givesDays", () => {
  it.each([
    ["Fridays, Saturdays and Sundays", ["Fri", "Sat", "Sun"], true],
    ["Fri & Sat at 8pm", ["Fri", "Sat"], true],
    ["Thursday–Sunday", ["Thu", "Fri", "Sat", "Sun"], true],
    ["Thurs - Sun", ["Fri", "Sat"], true],
    ["Wednesdays through Saturdays", ["Wed", "Thu", "Fri", "Sat"], true],
    [TICKET_QUOTE, ["Fri", "Sat", "Sun"], true],
    ["Fridays and Saturdays", ["Fri", "Sat", "Sun"], false],
    ["OCT 14 – NOV 1", ["Fri"], false],
    ["Sunday matinees", ["Mon"], false],
    ["Monday", ["Mon"], true],
    ["Satisfying shows", ["Sat"], false],
  ])("%s gives %j: %s", (quote, days, expected) => {
    expect(givesDays(quote, days as never)).toBe(expected);
  });
});
