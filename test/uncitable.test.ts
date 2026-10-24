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
  it("an event whose own page is its primary page, listed by a calendar this run, is verified by the calendar's reading, keyed to the calendar, and not re-read", async () => {
    const EVENT_URL = "https://knuckleheads.test/shows/big-show";
    const first = await seen();
    const ownPage = { ...first.dataset, events: first.dataset.events.map((e) => ({ ...e, primaryUrl: EVENT_URL })) };

    // The calendar's reading is keyed to the calendar, which the lane fetched, so it cites.
    const second = await runAt(week(2), ownPage, { [CALENDAR_URL]: PAGE, [EVENT_URL]: PAGE }, [reply(candidate()), reply()]);

    expect(only(second.dataset)).toMatchObject({ id: first.dataset.events[0]!.id, primaryUrl: CALENDAR_URL, status: "active", lastVerified: weekIso(2) });
    expect(second.calls).not.toContain(`fetch:${EVENT_URL}`);
    expect(second.report.counts).toMatchObject({ unverifiedByUncitableReading: 0 });
  });
});

describe("a re-reading of an active event's own page whose quote is not on the page (#124)", () => {
  const DATE_QUOTE = "Sat, Dec 12 · Show 8:00 PM";
  const VENUE_QUOTE = "Knuckleheads, 1 Main St";
  const LISTING = { status: 200, body: `<html><body><p>Big Show</p><p>${DATE_QUOTE}</p><p>Buy Tickets</p><p>${VENUE_QUOTE}</p></body></html>` };
  // The model stitches the date line to a button below it: not one span of the page's text.
  const STITCHED = "Sat, Dec 12 · Show 8:00 PM · Buy Tickets";

  const quoting = (now: Date, dataset: Dataset, page: CannedPage, reading: Record<string, unknown>) =>
    runWith(now, dataset, {
      sources: [knuckleheads],
      pages: { [CALENDAR_URL]: page },
      completions: [reply(candidate(reading)), reply()],
      pagesCarryQuotes: false,
    });
  const listed = () => quoting(WEEK_1, emptyDataset(), LISTING, { dateEvidence: DATE_QUOTE, venueEvidence: VENUE_QUOTE });
  const struck = (dataset: Dataset): Dataset => ({ ...dataset, events: dataset.events.map((e) => ({ ...e, verificationFailures: 1, consecutiveOutages: 1 })) });

  it("keeps the event active on its stored reading when its stored quotes are still on the page (#124)", async () => {
    const first = await listed();
    const stored = only(first.dataset);

    const kept = await quoting(week(2), struck(first.dataset), LISTING, { dateEvidence: STITCHED, venueEvidence: VENUE_QUOTE });

    expect(only(kept.dataset)).toMatchObject({
      id: stored.id,
      status: "active",
      start: stored.start,
      venue: stored.venue,
      evidence: stored.evidence,
      lastVerified: weekIso(2),
      verificationFailures: 0,
      consecutiveOutages: 0,
    });
    expect(kept.report.counts).toMatchObject({ unverifiedByUncitableReading: 0, keptOnStoredCitation: 1 });
    expect(kept.report.uncitableReadings).toEqual([]);
    expect(kept.report.keptOnStoredCitation).toEqual([{ title: "Big Show", primaryUrl: CALENDAR_URL, failedQuote: `quoted "${STITCHED}" for its date` }]);
    const markdown = renderReportMarkdown(kept.report);
    expect(markdown).toContain("| Kept on its stored citation | 1 |");
    expect(markdown).toContain(`## Kept on its stored citation\n\n- Big Show: ${CALENDAR_URL} (quoted "${STITCHED}" for its date)`);
  });

  it("hides the event, as before, when its stored date quote is no longer on the page", async () => {
    const first = await listed();
    const changed = { status: 200, body: `<html><body><p>Big Show</p><p>Saturday December 12</p><p>${VENUE_QUOTE}</p></body></html>` };

    const hidden = await quoting(week(2), first.dataset, changed, { dateEvidence: STITCHED, venueEvidence: VENUE_QUOTE });

    expect(only(hidden.dataset)).toMatchObject({ status: "unverified", lastVerified: weekIso(1) });
    expect(hidden.report.uncitableReadings).toEqual([{ title: "Big Show", primaryUrl: CALENDAR_URL }]);
    expect(hidden.report.keptOnStoredCitation).toEqual([]);
  });

  it.each([
    ["start time", { startTime: "21:00" }],
    ["name for the same venue", { venue: "  KNUCKLEHEADS saloon " }],
  ])("keeps the event on its stored reading when the new reading gives another %s (#220)", async (_, disagreeing) => {
    const first = await listed();
    const stored = only(first.dataset);

    const kept = await quoting(week(2), first.dataset, LISTING, { dateEvidence: STITCHED, venueEvidence: VENUE_QUOTE, ...disagreeing });

    expect(only(kept.dataset)).toMatchObject({ id: stored.id, status: "active", start: stored.start, venue: stored.venue, evidence: stored.evidence, lastVerified: weekIso(2) });
    expect(kept.report.uncitableReadings).toEqual([]);
    expect(kept.report.keptOnStoredCitation).toEqual([{ title: "Big Show", primaryUrl: CALENDAR_URL, failedQuote: `quoted "${STITCHED}" for its date` }]);
  });

  it.each([
    ["start date", { startDate: "2026-12-13" }],
    ["venue", { venue: "The Truman" }],
  ])("hides the event, as before, when the new reading gives another %s, though the stored quotes are on the page", async (_, disagreeing) => {
    const first = await listed();

    const hidden = await quoting(week(2), first.dataset, LISTING, { dateEvidence: STITCHED, venueEvidence: VENUE_QUOTE, ...disagreeing });

    expect(only(hidden.dataset)).toMatchObject({ status: "unverified" });
    expect(hidden.report.uncitableReadings).toHaveLength(1);
    expect(hidden.report.keptOnStoredCitation).toEqual([]);
  });

  it("hides a show moved to another night, though another show that night keeps its stored date quote on the calendar (#220)", async () => {
    const first = await listed();
    const moved = {
      status: 200,
      body: `<html><body><p>Other Show</p><p>${DATE_QUOTE}</p><p>${VENUE_QUOTE}</p><p>Big Show</p><p>Sat, Dec 19 · Show 8:00 PM</p><p>Buy Tickets</p><p>${VENUE_QUOTE}</p></body></html>`,
    };

    const hidden = await quoting(week(2), first.dataset, moved, {
      startDate: "2026-12-19",
      dateEvidence: "Sat, Dec 19 · Show 8:00 PM · Buy Tickets",
      venueEvidence: VENUE_QUOTE,
    });

    expect(hidden.dataset.events.find((e) => e.id === first.dataset.events[0]!.id)).toMatchObject({ status: "unverified", start: first.dataset.events[0]!.start });
    expect(hidden.report.keptOnStoredCitation).toEqual([]);
  });

  it("keeps a recurring event on its stored reading when the new reading rewords its schedule (#220)", async () => {
    const SCHEDULE_QUOTE = "First Friday of every month";
    const MONTHLY = { status: 200, body: `<html><body><p>Big Show</p><p>${SCHEDULE_QUOTE}</p><p>Buy Tickets</p><p>${VENUE_QUOTE}</p></body></html>` };
    const monthly = { startDate: null, startTime: null, schedule: "first Friday of every month", venueEvidence: VENUE_QUOTE };
    const first = await quoting(WEEK_1, emptyDataset(), MONTHLY, { ...monthly, dateEvidence: SCHEDULE_QUOTE });
    const stored = only(first.dataset);
    expect(stored).toMatchObject({ recurrence: "recurring", status: "active" });

    const kept = await quoting(week(2), first.dataset, MONTHLY, { ...monthly, schedule: "first Fridays", dateEvidence: `${SCHEDULE_QUOTE} · Buy Tickets` });

    expect(only(kept.dataset)).toMatchObject({ id: stored.id, status: "active", schedule: stored.schedule, evidence: stored.evidence, lastVerified: weekIso(2) });
    expect(kept.report.uncitableReadings).toEqual([]);
    expect(kept.report.keptOnStoredCitation).toHaveLength(1);
  });

  it("hides the event, as before, when its stored venue quote is no longer on the page", async () => {
    const first = await listed();
    const changed = { status: 200, body: `<html><body><p>Big Show</p><p>${DATE_QUOTE}</p><p>Knuckleheads Garage, 2 Main St</p></body></html>` };

    const hidden = await quoting(week(2), first.dataset, changed, { dateEvidence: STITCHED, venueEvidence: VENUE_QUOTE });

    expect(only(hidden.dataset)).toMatchObject({ status: "unverified", lastVerified: weekIso(1) });
    expect(hidden.report.uncitableReadings).toEqual([{ title: "Big Show", primaryUrl: CALENDAR_URL }]);
    expect(hidden.report.keptOnStoredCitation).toEqual([]);
  });

  it("hides the event, as before, when the re-reading has a date that does not exist", async () => {
    const first = await listed();

    const hidden = await quoting(week(2), first.dataset, LISTING, { dateEvidence: DATE_QUOTE, venueEvidence: VENUE_QUOTE, startTime: "24:00" });

    expect(only(hidden.dataset)).toMatchObject({ status: "unverified" });
    expect(hidden.report.uncitableReadings).toHaveLength(1);
    expect(hidden.report.keptOnStoredCitation).toEqual([]);
  });

  it("leaves an event already unverified unverified", async () => {
    const first = await listed();
    const unverified = { ...first.dataset, events: first.dataset.events.map((e) => ({ ...e, status: "unverified" as const })) };

    const again = await quoting(week(2), unverified, LISTING, { dateEvidence: STITCHED, venueEvidence: VENUE_QUOTE });

    expect(only(again.dataset)).toMatchObject({ status: "unverified", lastVerified: weekIso(1) });
    expect(again.report.keptOnStoredCitation).toEqual([]);
  });

  it("keeps the event when re-verification re-reads its page", async () => {
    const first = await listed();

    // Only re-verification reads the old page now.
    const kept = await runWith(week(2), first.dataset, {
      sources: [moved],
      pages: { [moved.urls[0]!]: PAGE, [CALENDAR_URL]: LISTING },
      completions: [reply(), reply(candidate({ dateEvidence: STITCHED, venueEvidence: VENUE_QUOTE })), reply()],
      pagesCarryQuotes: false,
    });

    expect(only(kept.dataset)).toMatchObject({ status: "active", lastVerified: weekIso(2) });
    expect(kept.report.keptOnStoredCitation).toHaveLength(1);
  });
});
