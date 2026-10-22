import { describe, expect, it } from "vitest";
import { emptyDataset } from "../src/dataset.js";
import { statesDays } from "../src/weekdays.js";
import { candidateAt, judging, source, WEEK_1, WEEK_2 } from "./fakes/fixtures.js";
import { testConfig } from "./fakes/config.js";
import type { CannedPage, ScriptedReply } from "./fakes/ports.js";
import { runWith } from "./fakes/run.js";

/** A garden whose calendar states the weekdays a run plays in its own date line (#196). */
const garden = source("Powell Gardens", { neighborhood: "Crossroads" });
const LIST_URL = garden.urls[0]!;
const OWN_URL = "https://powellgardens.test/events/tower-after-hours/";
const DATE_QUOTE = "Wednesdays, Oct. 7-28, 2026 | 5:30-8 p.m.";
const LIST = {
  status: 200,
  body: `<html><body><div><a href="/events/tower-after-hours/">Tower After Hours</a> ${DATE_QUOTE} · Powell Gardens</div></body></html>`,
};
const OWN_PAGE = { status: 200, body: `<html><body><h1>Tower After Hours</h1><p>${DATE_QUOTE}</p><p>Members free</p></body></html>` };

/** The list's reading: a run of Wednesdays from Oct 7 through Oct 28, linking its own page as link 1. */
const listed = (overrides: Record<string, unknown> = {}): ScriptedReply => ({
  value: {
    events: [
      candidateAt(garden, {
        title: "Tower After Hours",
        startDate: "2026-10-07",
        startTime: "17:30",
        endDate: "2026-10-28",
        endTime: "20:00",
        eventLink: 1,
        dateEvidence: DATE_QUOTE,
        venueEvidence: "Powell Gardens",
        days: ["Wed"],
        ...overrides,
      }),
    ],
  },
  costUsd: 0.01,
});

/** The own page's reading: nothing, unless overridden. */
const ownPage = (overrides: Record<string, unknown> = {}): ScriptedReply => ({
  value: {
    date: null,
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
    ...overrides,
  },
  costUsd: 0.002,
});

/** Curation flagging every event it is sent. */
const flagAll = (request: { messages: { content: string }[] }) => {
  const ids = [...request.messages[1]!.content.matchAll(/evt_[0-9a-f]{12}/g)].map((m) => m[0]);
  return judging(0.02, ...[...new Set(ids)].map((id) => ({ id, dontMiss: true, why: "The tower after dark, four Wednesdays only." })));
};

const runAt = (
  now: Date,
  {
    pages = {},
    completions = [listed()],
    dataset = emptyDataset(),
    curate,
  }: { pages?: Record<string, CannedPage>; completions?: ScriptedReply[]; dataset?: ReturnType<typeof emptyDataset>; curate?: typeof flagAll } = {},
) =>
  runWith(now, dataset, {
    sources: [garden],
    pages: { [LIST_URL]: LIST, [OWN_URL]: OWN_PAGE, ...pages },
    completions,
    config: testConfig(),
    ...(curate ? { curate } : {}),
  });

describe("the weekdays a limited run plays, from the list's own date quote (#196)", () => {
  it("a run whose date quote names its weekdays gains them, quoted from the list", async () => {
    const { dataset } = await runAt(WEEK_1);
    expect(dataset.events[0]).toMatchObject({
      recurrence: "limited-run",
      start: "2026-10-07T17:30:00-05:00",
      end: "2026-10-28T20:00:00-05:00",
      days: ["Wed"],
      evidence: { date: DATE_QUOTE, days: { page: LIST_URL, quote: DATE_QUOTE } },
    });
  });

  it("extraction is asked for the days", async () => {
    const { requests } = await runAt(WEEK_1);
    const schema = requests[0]!.responseFormat.schema as { properties: { events: { items: { properties: object } } } };
    expect(Object.keys(schema.properties.events.items.properties)).toContain("days");
  });

  it("days come back in week order, each once", async () => {
    const { dataset } = await runAt(WEEK_1, {
      completions: [listed({ days: ["Sun", "Wed", "Wed"], dateEvidence: "Wednesdays and Sundays, Oct. 7-28, 2026" })],
    });
    expect(dataset.events[0]!.days).toEqual(["Wed", "Sun"]);
  });

  it("days the date quote does not name are not taken, and the source's line says so", async () => {
    const { dataset, report } = await runAt(WEEK_1, { completions: [listed({ days: ["Thu", "Sun"] })] });
    expect(dataset.events[0]).toMatchObject({ status: "active" });
    expect(dataset.events[0]).not.toHaveProperty("days");
    expect(dataset.events[0]!.evidence).not.toHaveProperty("days");
    expect(report.sources[0]!.detail).toContain(`"Tower After Hours" on ${LIST_URL} named Thu, Sun as its days, which its date quote does not state; no days taken`);
  });

  it("weekends state Saturday and Sunday", async () => {
    const { dataset } = await runAt(WEEK_1, { completions: [listed({ days: ["Sat", "Sun"], dateEvidence: "Oct. 9 – Nov. 1 (Weekends) | 7:30 p.m." })] });
    expect(dataset.events[0]!.days).toEqual(["Sat", "Sun"]);
  });

  it("a weekday beside a date is the date's, not a day the run plays", async () => {
    const { dataset, report } = await runAt(WEEK_1, {
      completions: [listed({ days: ["Fri"], startDate: "2026-10-02", endDate: "2027-02-05", dateEvidence: "Fri, October 2, 2026 – Fri, February 5, 2027" })],
    });
    expect(dataset.events[0]).toMatchObject({ recurrence: "limited-run" });
    expect(dataset.events[0]).not.toHaveProperty("days");
    expect(report.sources[0]!.detail).toContain("does not state; no days taken");
  });

  it("every day of the week is no days", async () => {
    const { dataset, report } = await runAt(WEEK_1, {
      completions: [listed({ days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], dateEvidence: "Monday through Sunday, Oct. 7-28, 2026" })],
    });
    expect(dataset.events[0]).not.toHaveProperty("days");
    expect(report.sources[0]!.detail ?? "").not.toContain("no days taken");
  });

  it.each([
    ["a one-off", { endDate: null, endTime: null, dateEvidence: "Wednesday, Oct. 7, 2026 | 5:30-8 p.m." }, "one-off"],
    ["a recurring thing", { startDate: null, startTime: null, endDate: null, endTime: null, schedule: "Wednesdays, 5:30-8 p.m.", dateEvidence: "Wednesdays, 5:30-8 p.m." }, "recurring"],
  ])("%s takes no days, whatever the model says", async (_, overrides, recurrence) => {
    const { dataset, report } = await runAt(WEEK_1, { completions: [listed(overrides)] });
    expect(dataset.events[0]).toMatchObject({ recurrence });
    expect(dataset.events[0]).not.toHaveProperty("days");
    expect(report.sources[0]!.detail ?? "").not.toContain("no days taken");
  });

  it("an unverified reading carries no days", async () => {
    const { dataset } = await runAt(WEEK_1, { completions: [listed({ venue: null, venueEvidence: null })] });
    expect(dataset.events[0]).toMatchObject({ status: "unverified" });
    expect(dataset.events[0]).not.toHaveProperty("days");
  });

  it("a later reading of the list refreshes the days, and one without them drops them", async () => {
    const first = await runAt(WEEK_1);
    const moved = await runAt(WEEK_2, {
      dataset: first.dataset,
      completions: [listed({ days: ["Wed", "Thu"], dateEvidence: "Wednesdays and Thursdays, Oct. 7-28, 2026" })],
    });
    expect(moved.dataset.events[0]).toMatchObject({ id: first.dataset.events[0]!.id, days: ["Wed", "Thu"] });
    const dropped = await runAt(WEEK_2, { dataset: first.dataset, completions: [listed({ days: null })] });
    expect(dropped.dataset.events[0]).not.toHaveProperty("days");
    expect(dropped.dataset.events[0]!.evidence).not.toHaveProperty("days");
  });

  describe("beside the own-page read of a pick (#143)", () => {
    it("an own page giving no days leaves the list's, and its ticket page is not followed", async () => {
      const ticketed = { status: 200, body: OWN_PAGE.body.replace("Members free", `<a href="https://tickets.test/run/1">Get Tickets</a>`) };
      const { dataset, calls, report } = await runAt(WEEK_1, {
        pages: { [OWN_URL]: ticketed },
        completions: [listed(), ownPage({ daysLink: 1 })],
        curate: flagAll,
      });
      expect(dataset.events[0]).toMatchObject({
        dontMiss: true,
        days: ["Wed"],
        evidence: { days: { page: LIST_URL, quote: DATE_QUOTE } },
        ownPageRead: { page: OWN_URL, on: "2026-10-02" },
      });
      expect(calls.filter((c) => c.includes("tickets.test"))).toEqual([]);
      expect(report.ownPages[0]).toMatchObject({ source: "Picks", read: 1, dayed: 0 });
    });

    it("an own page whose days do not hold leaves the list's", async () => {
      const { dataset, report } = await runAt(WEEK_1, {
        completions: [listed(), ownPage({ days: ["Wed", "Thu"], daysEvidence: "Wednesdays and Thursdays after hours" })],
        curate: flagAll,
      });
      expect(dataset.events[0]).toMatchObject({ days: ["Wed"], evidence: { days: { page: LIST_URL, quote: DATE_QUOTE } } });
      expect(report.ownPages[0]!.problems).toEqual([expect.stringContaining("not on the page")]);
    });

    it("an own page stating the days gives them over the list's", async () => {
      const OWN_QUOTE = "Open Wednesdays and Thursdays after hours";
      const { dataset, report } = await runAt(WEEK_1, {
        pages: { [OWN_URL]: { status: 200, body: OWN_PAGE.body.replace("Members free", OWN_QUOTE) } },
        completions: [listed(), ownPage({ days: ["Wed", "Thu"], daysEvidence: OWN_QUOTE })],
        curate: flagAll,
      });
      expect(dataset.events[0]).toMatchObject({ days: ["Wed", "Thu"], evidence: { days: { page: OWN_URL, quote: OWN_QUOTE } } });
      expect(report.ownPages[0]).toMatchObject({ dayed: 1 });
    });

    it("a kept own-page read that gave no days takes the list's new reading of them", async () => {
      const first = await runAt(WEEK_1, { completions: [listed(), ownPage()], curate: flagAll });
      expect(first.dataset.events[0]).toMatchObject({ days: ["Wed"], ownPageRead: { page: OWN_URL } });
      const { dataset, report } = await runAt(WEEK_2, {
        dataset: first.dataset,
        completions: [listed({ days: ["Wed", "Thu"], dateEvidence: "Wednesdays and Thursdays, Oct. 7-28, 2026" })],
        curate: flagAll,
      });
      expect(dataset.events[0]).toMatchObject({ days: ["Wed", "Thu"], ownPageRead: { page: OWN_URL, on: "2026-10-02" } });
      expect(report.ownPages[0]).toMatchObject({ kept: 1 });
    });

    it("a kept own-page read that gave the days keeps them over the list's", async () => {
      const OWN_QUOTE = "Open Wednesdays and Thursdays after hours";
      const first = await runAt(WEEK_1, {
        pages: { [OWN_URL]: { status: 200, body: OWN_PAGE.body.replace("Members free", OWN_QUOTE) } },
        completions: [listed(), ownPage({ days: ["Wed", "Thu"], daysEvidence: OWN_QUOTE })],
        curate: flagAll,
      });
      const { dataset } = await runAt(WEEK_2, { dataset: first.dataset, completions: [listed()], curate: flagAll });
      expect(dataset.events[0]).toMatchObject({ days: ["Wed", "Thu"], evidence: { days: { page: OWN_URL, quote: OWN_QUOTE } } });
    });
  });
});

describe("statesDays", () => {
  it.each([
    ["Wednesdays, Oct. 7-28, 2026 | 5:30-8 p.m.", ["Wed"], true],
    ["Thursdays through Oct 25", ["Thu"], true],
    ["Fridays and Saturdays, Nov 6–21", ["Fri", "Sat"], true],
    ["Thursday–Sunday, Oct 14–Nov 1", ["Thu", "Fri", "Sat", "Sun"], true],
    ["Oct. 9 – Nov. 1 (Weekends) | 7:30 p.m.", ["Sat", "Sun"], true],
    ["Fri & Sat through Nov 1", ["Fri", "Sat"], true],
    ["Fri, October 2, 2026 – Fri, February 5, 2027", ["Fri"], false],
    ["Friday, Sept. 25 - Wednesday, Nov. 11", ["Fri", "Wed"], false],
    ["Sat 24 Oct – Sun 1 Nov", ["Sat", "Sun"], false],
    ["Oct 14 – Nov 1", ["Fri"], false],
    ["Wednesdays, Oct. 7-28", ["Wed", "Thu"], false],
  ])("%s states %s: %s", (quote, days, expected) => {
    expect(statesDays(quote, days as never)).toBe(expected);
  });
});
