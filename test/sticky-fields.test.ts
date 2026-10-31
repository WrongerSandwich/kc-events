import { describe, expect, it } from "vitest";
import { emptyDataset, type Event } from "../src/dataset.js";
import { renderReportMarkdown } from "../src/report.js";
import { testConfig } from "./fakes/config.js";
import { runWith } from "./fakes/run.js";
import { candidateAt, knuckleheads, reply, WEEK_1_ISO, WEEK_2, WEEK_2_ISO } from "./fakes/fixtures.js";

const CALENDAR_URL = knuckleheads.urls[0]!;
const DATE_QUOTE = "Sat, Oct 31 · Doors 7:00 PM · Show 8:00 PM";
const VENUE_QUOTE = "Knuckleheads, 1 Main St";
const candidate = (overrides: Record<string, unknown> = {}) => candidateAt(knuckleheads, { eventLink: 1, ...overrides });

/** An event stored by an earlier run from the calendar, active unless overridden. */
function stored(overrides: Partial<Event> = {}): Event {
  return {
    id: "evt_000000000251",
    title: "Big Show",
    description: "A circle of friends turns a quiet town upside down.",
    start: "2026-10-31T20:00:00-05:00",
    venue: "Knuckleheads",
    neighborhood: "East Bottoms",
    primaryUrl: CALENDAR_URL,
    eventUrl: "https://knuckleheads.test/shows/big-show",
    kind: "music",
    recurrence: "one-off",
    dontMiss: false,
    firstSeen: WEEK_1_ISO,
    lastVerified: WEEK_1_ISO,
    lastChanged: WEEK_1_ISO,
    lastJudged: WEEK_1_ISO,
    status: "active",
    verificationFailures: 0,
    consecutiveOutages: 0,
    lead: { lane: "registry", source: knuckleheads.name },
    evidence: { date: DATE_QUOTE, venue: VENUE_QUOTE },
    ...overrides,
  };
}

/** The calendar, carrying the stored quotes and a card linking the stored own page by its title, unless told otherwise. */
function listing({ quotes = true, links = `<a href="/shows/big-show">Big Show</a>` } = {}) {
  const text = quotes ? `<p>${DATE_QUOTE}</p><p>${VENUE_QUOTE}</p>` : "";
  return { status: 200, body: `<html><body><div>${links}${text}</div></body></html>` };
}

const reread = (known: Event, overrides: Record<string, unknown>, page = listing()) =>
  runWith(WEEK_2, { ...emptyDataset(), events: [known] }, {
    sources: [knuckleheads],
    pages: { [CALENDAR_URL]: page },
    completions: [reply(candidate(overrides))],
    config: testConfig({ kinds: ["music", "comedy", "other"] }),
  });

/** A verified re-reading from a page with standing keeps what the model only re-worded (#251): the weekly diff is the page's news. */
describe("sticky fields on a re-reading", () => {
  describe("description", () => {
    it("keeps a stored description the reading words otherwise", async () => {
      const { dataset } = await reread(stored(), { description: "A group of friends turn a sleepy town on its head." });

      expect(dataset.events[0]).toMatchObject({ description: "A circle of friends turns a quiet town upside down.", lastVerified: WEEK_2_ISO });
    });

    it("takes one where none was stored", async () => {
      const { description: _description, ...known } = stored();

      const { dataset } = await reread(known, { description: "A group of friends." });

      expect(dataset.events[0]!.description).toBe("A group of friends.");
    });

    it("takes a longer one over a stored listing line", async () => {
      const fuller = "A circle of friends turns a quiet town upside down, in a comedy that runs two hours with an interval and a raffle.";
      expect(fuller.length).toBeGreaterThan(100);

      const { dataset } = await reread(stored({ description: "A comedy." }), { description: fuller });

      expect(dataset.events[0]!.description).toBe(fuller);
    });

    it("keeps a stored listing line over a shorter one", async () => {
      const { dataset } = await reread(stored({ description: "A comedy in two acts." }), { description: "A comedy." });

      expect(dataset.events[0]!.description).toBe("A comedy in two acts.");
    });
  });

  describe("kind", () => {
    it("keeps the stored kind when the reading gives another for the same title", async () => {
      const { dataset, report } = await reread(stored(), { kind: "comedy" });

      expect(dataset.events[0]!.kind).toBe("music");
      expect(report.kindChanges).toEqual([]);
    });

    it("keeps it for a variant of the title, or the title in other case", async () => {
      const { dataset } = await reread(stored(), { title: "BIG SHOW", kind: "comedy" });

      expect(dataset.events[0]!.kind).toBe("music");
    });

    it("takes a kind over a stored other, and reports the change", async () => {
      const { dataset, report } = await reread(stored({ kind: "other" }), { kind: "comedy" });

      expect(dataset.events[0]!.kind).toBe("comedy");
      expect(report.kindChanges).toEqual([{ title: "Big Show", primaryUrl: CALENDAR_URL, was: "other", now: "comedy" }]);
      expect(renderReportMarkdown(report)).toContain(`## Kind changes\n\n- Big Show (${CALENDAR_URL}): was other, now comedy`);
    });

    it("keeps a stored kind over other", async () => {
      const { dataset } = await reread(stored(), { kind: "other" });

      expect(dataset.events[0]!.kind).toBe("music");
    });

    it("takes the reading's kind when the title changed", async () => {
      // Matched by its own page, which the calendar links as "Tickets".
      const page = listing({ links: `<a href="/shows/big-show">Tickets</a>` });

      const { dataset, report } = await reread(stored(), { title: "Late Laughs", kind: "comedy" }, page);

      expect(dataset.events[0]).toMatchObject({ id: "evt_000000000251", title: "Late Laughs", kind: "comedy" });
      expect(report.kindChanges).toEqual([{ title: "Late Laughs", primaryUrl: CALENDAR_URL, was: "music", now: "comedy" }]);
    });
  });

  describe("venue", () => {
    it("keeps the stored spelling of the same venue", async () => {
      const { dataset } = await reread(stored({ venue: "Knuckleheads Saloon" }), { venue: "Knuckleheads" });

      expect(dataset.events[0]!.venue).toBe("Knuckleheads Saloon");
    });

    it("takes another venue", async () => {
      const { dataset } = await reread(stored(), { venue: "recordBar", venueEvidence: "recordBar, 1520 Grand" });

      expect(dataset.events[0]).toMatchObject({ venue: "recordBar", evidence: { venue: "recordBar, 1520 Grand" } });
    });
  });

  describe("quotes", () => {
    it("keeps stored quotes still on the page, whatever the reading quoted", async () => {
      const { dataset } = await reread(stored(), { dateEvidence: "Sat, Oct 31 · Show 8:00 PM", venueEvidence: "Knuckleheads" });

      expect(dataset.events[0]!.evidence).toEqual({ date: DATE_QUOTE, venue: VENUE_QUOTE });
    });

    it("takes the reading's quotes when the stored ones are gone from the page", async () => {
      const { dataset } = await reread(stored(), { dateEvidence: "Sat, Oct 31 · Show 8:00 PM", venueEvidence: "Knuckleheads" }, listing({ quotes: false }));

      expect(dataset.events[0]!.evidence).toEqual({ date: "Sat, Oct 31 · Show 8:00 PM", venue: "Knuckleheads" });
    });

    it("takes the reading's date quote when the date moved, though the old quote is still on the page", async () => {
      const { dataset } = await reread(stored(), { startDate: "2026-11-07", dateEvidence: "Sat, Nov 7 · Show 8:00 PM" });

      expect(dataset.events[0]).toMatchObject({ start: "2026-11-07T20:00:00-06:00", evidence: { date: "Sat, Nov 7 · Show 8:00 PM", venue: VENUE_QUOTE } });
    });

    it("keeps a recurring event's stored date quote while it is on the page, though the schedule is worded otherwise", async () => {
      const { start: _start, ...rest } = stored();
      const known: Event = { ...rest, recurrence: "recurring", schedule: "Sundays", evidence: { date: "Every Sunday night", venue: VENUE_QUOTE } };
      const page = { status: 200, body: `<html><body><a href="/shows/big-show">Big Show</a><p>Every Sunday night</p><p>${VENUE_QUOTE}</p></body></html>` };

      const { dataset } = await reread(known, { startDate: null, startTime: null, schedule: "Every Sunday", dateEvidence: "Sunday night" }, page);

      expect(dataset.events[0]).toMatchObject({ schedule: "Every Sunday", evidence: { date: "Every Sunday night" }, lastVerified: WEEK_2_ISO });
    });
  });

  describe("own page", () => {
    it("keeps the stored own page while the page links it with text naming the event", async () => {
      const page = listing({ links: `<a href="/shows/big-show">Big Show</a> <a href="/tickets/123">Tickets</a>` });

      const { dataset } = await reread(stored(), { eventLink: 2 }, page);

      expect(dataset.events[0]!.eventUrl).toBe("https://knuckleheads.test/shows/big-show");
    });

    it("takes the reading's own page when the stored one is linked under another event's title", async () => {
      const page = listing({ links: `<a href="/shows/big-show">Late Laughs</a> <a href="/shows/big-show-2">Big Show</a>` });

      const { dataset } = await reread(stored(), { eventLink: 2 }, page);

      expect(dataset.events[0]!.eventUrl).toBe("https://knuckleheads.test/shows/big-show-2");
    });

    it("takes the reading's own page when the stored one is linked only by a generic label, which any card could carry", async () => {
      const page = listing({ links: `<a href="/shows/big-show">Learn more</a> <a href="/shows/big-show-2">Big Show</a>` });

      const { dataset } = await reread(stored(), { eventLink: 2 }, page);

      expect(dataset.events[0]!.eventUrl).toBe("https://knuckleheads.test/shows/big-show-2");
    });

    it("drops the stickiness of a description its own page gave once the reading has another own page", async () => {
      const known = stored({ ownPageRead: { page: "https://knuckleheads.test/shows/big-show", on: "2026-10-24" } });
      const page = listing({ links: `<a href="/shows/big-show">Late Laughs</a> <a href="/shows/big-show-2">Big Show</a>` });

      const { dataset } = await reread(known, { eventLink: 2, description: "A band." }, page);

      expect(dataset.events[0]).toMatchObject({ eventUrl: "https://knuckleheads.test/shows/big-show-2", description: "A band." });
      expect(dataset.events[0]).not.toHaveProperty("ownPageRead");
    });
  });

  it("still takes a new time, with its quote", async () => {
    const { dataset } = await reread(stored(), { startTime: "21:00", dateEvidence: "Sat, Oct 31 · Show 9:00 PM" });

    expect(dataset.events[0]).toMatchObject({ start: "2026-10-31T21:00:00-05:00", evidence: { date: "Sat, Oct 31 · Show 9:00 PM" } });
  });
});
