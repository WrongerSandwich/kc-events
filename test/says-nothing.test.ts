import { describe, expect, it } from "vitest";
import { emptyDataset, type Dataset, type Event } from "../src/dataset.js";
import type { CompletionResult } from "../src/ports.js";
import type { Source } from "../src/registry.js";
import { renderReportMarkdown } from "../src/report.js";
import type { CannedPage } from "./fakes/ports.js";
import { runWith } from "./fakes/run.js";
import { candidateAt, knuckleheads, PAGE, reply, source, week, WEEK_1, weekIso } from "./fakes/fixtures.js";

/**
 * Readings that say nothing about an event must not strike it (#78): an excluded source's page is
 * not read at all; a page read as empty where it listed several events is a wobble, not news; a page
 * whose listing stops before the event's date, or before the last days of the horizon, was not
 * asked about it; a page with no standing cannot clear a strike either; and a page that lists the
 * show twice names the night nearest the one stored.
 */

// The test config's horizon is 8 weeks: from week 1 (2026-10-02) it ends 2026-11-27, from week 2 (2026-10-09) on 2026-12-04.
const CALENDAR_URL = knuckleheads.urls[0]!;
/** The venue moved its calendar; an event read from the old page keeps it as its primary page, which only re-verification reads. */
const moved = { ...knuckleheads, urls: ["https://knuckleheads.test/shows"] };
/** Another source that always answers, so a run never has every source failing. */
const elsewhere = source("Elsewhere");

const show = (title: string, startDate: string) => candidateAt(knuckleheads, { title, startDate, dateEvidence: `${startDate} · Show 8:00 PM` });
const bigShow = show("Big Show", "2026-10-31");
const secondShow = show("Second Show", "2026-11-07");
const thirdShow = show("Third Show", "2026-11-14");

/** One run over the given Knuckleheads source and Elsewhere, whose page lists nothing. */
function runAt(now: Date, dataset: Dataset, pages: Record<string, CannedPage>, completions: CompletionResult[], knuckleheadsSource: Source = knuckleheads) {
  return runWith(now, dataset, { sources: [knuckleheadsSource, elsewhere], pages: { ...pages, [elsewhere.urls[0]!]: PAGE }, completions });
}

/** The first run: Knuckleheads' calendar lists these shows, read verified. */
const listing = (...shows: unknown[]) => runAt(WEEK_1, emptyDataset(), { [CALENDAR_URL]: PAGE }, [reply(...shows), reply()]);

const byTitle = (dataset: Dataset, title: string): Event => dataset.events.find((e) => e.title === title)!;
/** The fields a strike or an outage would change. */
const strikeState = ({ status, verificationFailures, consecutiveOutages }: Event) => ({ status, verificationFailures, consecutiveOutages });
const UNTOUCHED = { status: "active", verificationFailures: 0, consecutiveOutages: 0 };
const STRUCK = { status: "active", verificationFailures: 1, consecutiveOutages: 0 };
const HELD = { status: "active", verificationFailures: 0, consecutiveOutages: 1 };

describe("an excluded source's events", () => {
  const excluded: Source = { ...knuckleheads, status: "excluded", reason: "asked not to be crawled" };
  /** A run with Knuckleheads excluded: nothing of its is fetched, so no page is canned for it. */
  const whileExcluded = (now: Date, dataset: Dataset) => runAt(now, dataset, {}, [reply()], excluded);

  it("are not fetched for re-verification and are held as through an outage, and the report says so", async () => {
    const first = await listing(bigShow, secondShow);

    const second = await whileExcluded(week(2), first.dataset);

    expect(second.calls.filter((c) => c.includes("knuckleheads"))).toEqual([]);
    expect(second.dataset.events.map(strikeState)).toEqual([HELD, HELD]);
    expect(second.report.counts).toMatchObject({ heldSourceExcluded: 2, heldThroughOutage: 0 });
    expect(second.report.reverification.problems).toEqual([
      `Knuckleheads is excluded (asked not to be crawled): 2 events on 1 page not fetched, held as through an outage`,
    ]);
    expect(renderReportMarkdown(second.report)).toContain("| Held: lead source excluded | 2 |");
  });

  it("become unverified at the outage limit and come back active when the source is admitted again", async () => {
    const first = await listing(bigShow);
    let last = first;
    for (const n of [2, 3, 4]) last = await whileExcluded(week(n), last.dataset);
    expect(strikeState(byTitle(last.dataset, "Big Show"))).toEqual({ status: "unverified", verificationFailures: 0, consecutiveOutages: 3 });
    expect(last.report.counts).toMatchObject({ heldSourceExcluded: 0, unverifiedByOutageLimit: 1 });

    const back = await runAt(week(5), last.dataset, { [CALENDAR_URL]: PAGE }, [reply(bigShow), reply()]);

    expect(byTitle(back.dataset, "Big Show")).toMatchObject({ id: first.dataset.events[0]!.id, status: "active", consecutiveOutages: 0, lastVerified: weekIso(5) });
  });

  it("include an event found elsewhere whose primary page is one of the excluded source's pages", async () => {
    const first = await listing(bigShow);
    const found = { ...first.dataset, events: first.dataset.events.map((e) => ({ ...e, lead: { lane: "discovery" as const, query: "music events in Kansas City" } })) };

    const second = await whileExcluded(week(2), found);

    expect(second.calls.filter((c) => c.includes("knuckleheads"))).toEqual([]);
    expect(strikeState(byTitle(second.dataset, "Big Show"))).toEqual(HELD);
  });

  it("are struck as before once the source is active again and its page no longer lists them", async () => {
    const first = await listing(bigShow);
    const held = await whileExcluded(week(2), first.dataset);

    const second = await runAt(week(3), held.dataset, { [CALENDAR_URL]: PAGE }, [reply(), reply()]);

    expect(strikeState(byTitle(second.dataset, "Big Show"))).toEqual(STRUCK);
  });
});

describe("a page read as empty", () => {
  it("where three or more active events cite it is an outage for them, not a strike each, and the report says so", async () => {
    const first = await listing(bigShow, secondShow, thirdShow);

    const second = await runAt(week(2), first.dataset, { [CALENDAR_URL]: PAGE }, [reply(), reply()]);

    expect(second.dataset.events.map(strikeState)).toEqual([HELD, HELD, HELD]);
    expect(second.report.counts).toMatchObject({ heldThroughOutage: 3, expired: { "two-strike": 0 } });
    expect(second.report.reverification.problems).toEqual([`${CALENDAR_URL} loaded but read as listing nothing where 3 active events cite it; counted as an outage for them, not 3 strikes`]);
  });

  it("where two active events cite it strikes them as before", async () => {
    const first = await listing(bigShow, secondShow);

    const second = await runAt(week(2), first.dataset, { [CALENDAR_URL]: PAGE }, [reply(), reply()]);

    expect(second.dataset.events.map(strikeState)).toEqual([STRUCK, STRUCK]);
    expect(second.report.reverification.problems).toEqual([]);
  });

  it("is an outage when re-verification fetched it", async () => {
    const first = await listing(bigShow, secondShow, thirdShow);

    const second = await runAt(week(2), first.dataset, { [moved.urls[0]!]: PAGE, [CALENDAR_URL]: PAGE }, [reply(), reply(), reply()], moved);

    expect(second.calls).toContain(`fetch:${CALENDAR_URL}`);
    expect(second.dataset.events.map(strikeState)).toEqual([HELD, HELD, HELD]);
  });

  it("is not empty when it lists one of them: the others, before it in the listing, are struck", async () => {
    const first = await listing(bigShow, secondShow, thirdShow);

    const second = await runAt(week(2), first.dataset, { [CALENDAR_URL]: PAGE }, [reply(thirdShow), reply()]);

    expect(strikeState(byTitle(second.dataset, "Big Show"))).toEqual(STRUCK);
    expect(strikeState(byTitle(second.dataset, "Second Show"))).toEqual(STRUCK);
    expect(strikeState(byTitle(second.dataset, "Third Show"))).toEqual(UNTOUCHED);
  });

  it("counts the third consecutive one toward the outage limit, like any outage", async () => {
    const first = await listing(bigShow, secondShow, thirdShow);
    let last = first;
    for (const n of [2, 3, 4]) last = await runAt(week(n), last.dataset, { [CALENDAR_URL]: PAGE }, [reply(), reply()]);

    expect(last.dataset.events.map(strikeState)).toEqual(Array(3).fill({ status: "unverified", verificationFailures: 0, consecutiveOutages: 3 }));
  });
});

describe("an event starting after the last date its page listed this run", () => {
  /** Knuckleheads lists two shows, one far later than the other. */
  const laterShow = show("Later Show", "2026-11-21");
  const firstRun = () => listing(bigShow, laterShow);

  it("is not struck when the registry lane read the page, and the report counts it", async () => {
    const first = await firstRun();

    // The page's window moved: it lists shows through Nov 1 only.
    const second = await runAt(week(2), first.dataset, { [CALENDAR_URL]: PAGE }, [reply(bigShow, show("Other Show", "2026-11-01")), reply()]);

    expect(strikeState(byTitle(second.dataset, "Later Show"))).toEqual(UNTOUCHED);
    expect(second.report.counts.beyondListingUnstruck).toBe(1);
    expect(renderReportMarkdown(second.report)).toContain("| Not struck: starts after the page's last listing | 1 |");
  });

  it("is not struck when re-verification read the page", async () => {
    const first = await firstRun();

    const second = await runAt(week(2), first.dataset, { [moved.urls[0]!]: PAGE, [CALENDAR_URL]: PAGE }, [reply(), reply(), reply(bigShow)], moved);

    expect(second.calls).toContain(`fetch:${CALENDAR_URL}`);
    expect(strikeState(byTitle(second.dataset, "Later Show"))).toEqual(UNTOUCHED);
    expect(second.report.counts.beyondListingUnstruck).toBe(1);
  });

  it("is struck when the page lists a show on or after its date without it", async () => {
    const first = await firstRun();

    const second = await runAt(week(2), first.dataset, { [CALENDAR_URL]: PAGE }, [reply(bigShow, show("Other Show", "2026-11-21")), reply()]);

    expect(strikeState(byTitle(second.dataset, "Later Show"))).toEqual(STRUCK);
    expect(second.report.counts.beyondListingUnstruck).toBe(0);
  });

  it("keeps the strikes and outages it already carries", async () => {
    const first = await firstRun();
    const carrying = { ...first.dataset, events: first.dataset.events.map((e) => ({ ...e, verificationFailures: 1, consecutiveOutages: 2 })) };

    const second = await runAt(week(2), carrying, { [CALENDAR_URL]: PAGE }, [reply(bigShow), reply()]);

    expect(strikeState(byTitle(second.dataset, "Later Show"))).toEqual({ status: "active", verificationFailures: 1, consecutiveOutages: 2 });
  });

  it("is struck as before when the page is gone", async () => {
    const first = await firstRun();

    const second = await runAt(week(2), first.dataset, { [CALENDAR_URL]: { status: 404, body: "Not Found" } }, [reply()]);

    expect(strikeState(byTitle(second.dataset, "Later Show"))).toEqual(STRUCK);
  });
});

describe("the horizon the model is told", () => {
  it("names the last date, and an omission in the last two days of it is not a strike", async () => {
    // Week 1's horizon ends 2026-11-27; the model is told so.
    const first = await listing(bigShow, show("Edge Show", "2026-11-26"), show("Inside Show", "2026-11-25"));
    expect(first.requests[0]!.messages[0]!.content).toContain("- Horizon: the next 8 weeks, through 2026-11-27");

    // Week 2's horizon ends 2026-12-04: both shows are inside it now, so both are struck when the page lists another show after them.
    const second = await runAt(week(2), first.dataset, { [CALENDAR_URL]: PAGE }, [reply(bigShow, show("Later Show", "2026-12-01")), reply()]);
    expect(strikeState(byTitle(second.dataset, "Edge Show"))).toEqual(STRUCK);
    expect(strikeState(byTitle(second.dataset, "Inside Show"))).toEqual(STRUCK);
  });

  it("gives two days of slack at its end: a show on the last day or the one before is not struck, one three days before is", async () => {
    // Run at week 1 again a week later over a dataset read at week 1: the horizon from 2026-10-02 ends 2026-11-27.
    const first = await listing(bigShow, show("Last Day Show", "2026-11-27"), show("Edge Show", "2026-11-26"), show("Inside Show", "2026-11-25"));

    // The same day, re-run: the page now lists only the Big Show and a show after every other, so nothing is beyond its listing.
    const again = await runAt(WEEK_1, first.dataset, { [CALENDAR_URL]: PAGE }, [reply(bigShow, show("Far Show", "2026-12-20")), reply()]);

    expect(strikeState(byTitle(again.dataset, "Last Day Show"))).toEqual(UNTOUCHED);
    expect(strikeState(byTitle(again.dataset, "Edge Show"))).toEqual(UNTOUCHED);
    expect(strikeState(byTitle(again.dataset, "Inside Show"))).toEqual(STRUCK);
    expect(again.report.counts.beyondHorizonUnstruck).toBe(2);
  });
});

describe("a page that lists the show twice within the fuzzy window", () => {
  it("names the night nearest the stored one when the registry lane reads it, whichever it gives first", async () => {
    const first = await listing(bigShow);

    const second = await runAt(week(2), first.dataset, { [CALENDAR_URL]: PAGE }, [reply(show("Big Show", "2026-10-29"), bigShow), reply()]);

    expect(second.dataset.events).toHaveLength(1);
    expect(byTitle(second.dataset, "Big Show")).toMatchObject({ start: "2026-10-31T20:00:00-05:00", lastVerified: weekIso(2), verificationFailures: 0 });
  });

  it("names the night nearest the stored one when re-verification reads it", async () => {
    const first = await listing(bigShow);

    const second = await runAt(week(2), first.dataset, { [moved.urls[0]!]: PAGE, [CALENDAR_URL]: PAGE }, [reply(), reply(), reply(show("Big Show", "2026-10-29"), bigShow)], moved);

    expect(second.dataset.events).toHaveLength(1);
    expect(byTitle(second.dataset, "Big Show")).toMatchObject({ start: "2026-10-31T20:00:00-05:00", lastVerified: weekIso(2) });
  });

  it("moves the event when only another night within the window is listed", async () => {
    const first = await listing(bigShow);

    const second = await runAt(week(2), first.dataset, { [CALENDAR_URL]: PAGE }, [reply(show("Big Show", "2026-10-29")), reply()]);

    expect(byTitle(second.dataset, "Big Show")).toMatchObject({ id: first.dataset.events[0]!.id, start: "2026-10-29T20:00:00-05:00" });
  });
});
