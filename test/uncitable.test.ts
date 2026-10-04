import { describe, expect, it } from "vitest";
import { emptyDataset, type Dataset, type Event } from "../src/dataset.js";
import type { CompletionResult } from "../src/ports.js";
import type { Source } from "../src/registry.js";
import { renderReportMarkdown } from "../src/report.js";
import type { CannedPage } from "./fakes/ports.js";
import { runWith } from "./fakes/run.js";
import { candidateAt, knuckleheads, PAGE, reply, source, week, WEEK_1, weekIso } from "./fakes/fixtures.js";

const CALENDAR_URL = knuckleheads.urls[0]!;
// The venue moved its calendar; an event read from the old page keeps it as its primary page.
const moved = { ...knuckleheads, urls: ["https://knuckleheads.test/shows"] };
// A show far enough out that it is not past for any run here.
const candidate = (overrides: Record<string, unknown> = {}) =>
  candidateAt(knuckleheads, { startDate: "2026-12-12", dateEvidence: "Sat, Dec 12 · Show 8:00 PM", ...overrides });

function runAt(now: Date, dataset: Dataset, pages: Record<string, CannedPage>, completions: CompletionResult[], source: Source = knuckleheads) {
  return runWith(now, dataset, { sources: [source], pages, completions });
}

/** A run in which Knuckleheads lists the Big Show, verified; the first run when no dataset is given. */
const seen = (now = WEEK_1, dataset = emptyDataset()) => runAt(now, dataset, { [CALENDAR_URL]: PAGE }, [reply(candidate()), reply()]);
/** A run in which Knuckleheads lists the Big Show with no venue that can be cited. */
const uncitable = (now: Date, dataset: Dataset) =>
  runAt(now, dataset, { [CALENDAR_URL]: PAGE }, [reply(candidate({ venue: null, venueEvidence: null })), reply()]);

const only = (dataset: Dataset): Event => {
  expect(dataset.events).toHaveLength(1);
  return dataset.events[0]!;
};

describe("an uncitable re-reading", () => {
  it("an event made unverified this way is active again under its id when a later reading is verified", async () => {
    const first = await seen();
    const hidden = await uncitable(week(2), first.dataset);
    expect(only(hidden.dataset)).toMatchObject({ status: "unverified" });

    const back = await runAt(week(3), hidden.dataset, { [CALENDAR_URL]: PAGE }, [reply(candidate({ venue: "Knuckleheads Saloon" })), reply()]);

    expect(only(back.dataset)).toMatchObject({ id: first.dataset.events[0]!.id, status: "active", venue: "Knuckleheads Saloon", lastVerified: weekIso(3), lastChanged: weekIso(3) });
  });
  it("a sighting saying the event is cancelled expires it as cancelled, citable or not", async () => {
    const first = await seen();

    const cancelled = await runAt(week(2), first.dataset, { [CALENDAR_URL]: PAGE }, [
      reply(candidate({ venue: null, venueEvidence: null, notice: "cancelled" })),
      reply(),
    ]);

    expect(only(cancelled.dataset)).toMatchObject({ status: "expired", expiryReason: "cancelled" });
    expect(cancelled.report.counts.unverifiedByUncitableReading).toBe(0);
  });

  it("changes nothing for an event already unverified", async () => {
    const first = await seen();
    const hidden = await uncitable(week(2), first.dataset);

    const again = await uncitable(week(3), hidden.dataset);

    expect(again.dataset.events).toEqual(hidden.dataset.events);
    expect(again.report.counts.unverifiedByUncitableReading).toBe(0);
  });
  it("the run report counts and lists the events it made unverified", async () => {
    const first = await seen();

    const hidden = await uncitable(week(2), first.dataset);

    expect(hidden.report.counts).toMatchObject({ unverifiedByUncitableReading: 1, heldUnverified: 0 });
    expect(hidden.report.uncitableReadings).toEqual([{ title: "Big Show", primaryUrl: CALENDAR_URL }]);
    const markdown = renderReportMarkdown(hidden.report);
    expect(markdown).toContain("| Unverified by an uncitable re-reading | 1 |");
    expect(markdown).toContain(`## Unverified by an uncitable re-reading\n\n- Big Show: ${CALENDAR_URL}`);
  });

  it("re-verification that re-reads a page without a citable venue makes the event unverified and reports it", async () => {
    const first = await seen();

    // Only re-verification reads the old page now.
    const hidden = await runAt(week(2), first.dataset, { [moved.urls[0]!]: PAGE, [CALENDAR_URL]: PAGE }, [
      reply(),
      reply(candidate({ venue: null, venueEvidence: null })),
    ], moved);

    expect(only(hidden.dataset)).toMatchObject({ status: "unverified", verificationFailures: 0, lastVerified: weekIso(1) });
    expect(hidden.report.uncitableReadings).toEqual([{ title: "Big Show", primaryUrl: CALENDAR_URL }]);
  });

  it("an event made unverified this way whose primary page no registry source reads is re-fetched next run, and comes back", async () => {
    const first = await seen();
    const hidden = await uncitable(week(2), first.dataset);

    const back = await runAt(week(3), hidden.dataset, { [moved.urls[0]!]: PAGE, [CALENDAR_URL]: PAGE }, [reply(), reply(candidate()), reply()], moved);

    expect(back.calls).toContain(`fetch:${CALENDAR_URL}`);
    expect(only(back.dataset)).toMatchObject({ id: first.dataset.events[0]!.id, status: "active", lastVerified: weekIso(3) });
    expect(back.report.counts.reverified).toBe(1);
  });
  it.each([
    ["before", [candidate(), candidate({ venue: null, venueEvidence: null })]],
    ["after", [candidate({ venue: null, venueEvidence: null }), candidate()]],
  ])("a verified reading on another page in the same run stands, %s the uncitable one", async (_, [onFirst, onSecond]) => {
    const first = await seen();
    const other = source("Other");

    const both = await runWith(week(2), first.dataset, {
      sources: [knuckleheads, other],
      pages: { [CALENDAR_URL]: PAGE, [other.urls[0]!]: PAGE },
      completions: [reply(onFirst), reply(onSecond), reply()],
    });

    expect(only(both.dataset)).toMatchObject({ status: "active", lastVerified: weekIso(2) });
    expect(both.report.counts.unverifiedByUncitableReading).toBe(0);
  });
  it("an event whose own page is its primary page, listed by a calendar this run, is re-read from its own page and stays active", async () => {
    const EVENT_URL = "https://knuckleheads.test/shows/big-show";
    const first = await seen();
    const ownPage = { ...first.dataset, events: first.dataset.events.map((e) => ({ ...e, primaryUrl: EVENT_URL })) };

    // The calendar names the event's own page, which the lane did not fetch, so its reading there cites nothing.
    const second = await runAt(week(2), ownPage, { [CALENDAR_URL]: PAGE, [EVENT_URL]: PAGE }, [
      reply(candidate({ primaryUrl: EVENT_URL })),
      reply(candidate({ primaryUrl: EVENT_URL })),
      reply(),
    ]);

    expect(second.calls).toContain(`fetch:${EVENT_URL}`);
    expect(only(second.dataset)).toMatchObject({ status: "active", lastVerified: weekIso(2) });
    expect(second.report.counts).toMatchObject({ reverified: 1, unverifiedByUncitableReading: 0 });
  });
});
