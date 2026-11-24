import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cleanWhyLine } from "../src/curation.js";
import { findMatch, matchSighting, normalizeName, oneMonthOf, sameEvent, sameName, sameRecurringEvent, sameVenue, type EventIdentity, type Match, type VenueAliases } from "../src/identity.js";
import { fromLocal, shiftDate, toLocalDate } from "../src/time.js";

/**
 * Properties the identity, curation and time helpers promise for any input (#100), not only the cases the example
 * tests name. Generators draw from small pools so collisions (same title, near dates, one venue's two names) are
 * common rather than rare.
 */

const ALIASES: VenueAliases = { "Kauffman Center": ["Helzberg Hall", "Muriel Kauffman Theatre"], "The Midland": ["Midland Theatre"] };

/** A title or venue: words from a small pool, in any case, with punctuation and a leading "the" now and then. */
const words = ["the", "big", "show", "Midland", "Kauffman", "Center", "Helzberg", "Hall", "night", "jazz", "THE", "théâtre", "&", "-", "!", "(Oct.)", ""];
const name = fc.tuple(fc.array(fc.constantFrom(...words), { minLength: 1, maxLength: 5 }), fc.constantFrom(" ", "  ", ", ", ":")).map(([ws, sep]) => ws.join(sep));
const anyText = fc.oneof(name, fc.string(), fc.string({ unit: "grapheme" }));

const day = fc.integer({ min: 1, max: 9 }).map((d) => `2026-10-0${d}`);
const identity: fc.Arbitrary<EventIdentity> = fc.record(
  {
    primaryUrl: fc.constantFrom("https://a.test/calendar", "https://a.test/calendar/", "https://b.test/events", "https://c.test/"),
    title: name,
    venue: fc.option(name, { nil: undefined }),
    start: fc.option(day, { nil: undefined }),
    eventUrl: fc.constantFrom("https://a.test/e/1", "https://a.test/e/1/", "https://a.test/e/2", "https://b.test/e/1"),
  },
  { requiredKeys: ["primaryUrl", "title"] },
);

describe("identity", () => {
  it("normalizeName is idempotent", () => {
    fc.assert(fc.property(anyText, (t) => normalizeName(normalizeName(t)) === normalizeName(t)), { numRuns: 1000 });
  });

  it("sameName is symmetric", () => {
    fc.assert(fc.property(fc.option(anyText, { nil: undefined }), fc.option(anyText, { nil: undefined }), (a, b) => sameName(a, b) === sameName(b, a)));
  });

  it("sameVenue is symmetric", () => {
    fc.assert(fc.property(name, name, (a, b) => sameVenue(a, b, ALIASES) === sameVenue(b, a, ALIASES)));
  });

  it("two records with one own page on one date are one event, whatever their titles and venues (#66)", () => {
    const dated = identity.filter((i) => i.start !== undefined && i.eventUrl !== undefined);
    fc.assert(
      fc.property(dated, identity, (a, b) => {
        const other = { ...b, eventUrl: a.eventUrl, start: a.start };
        expect(sameEvent(a, other, [a, other], ALIASES)).toBe(true);
        expect(findMatch(other, [a], ALIASES)).toBe(a);
      }),
    );
  });

  it("findMatch does not depend on the order of the known events, among records no two of which are one event", () => {
    // A dataset after a run never holds two records that are one event: the run folds them (foldDuplicates).
    const distinct = fc
      .uniqueArray(identity, { minLength: 1, maxLength: 6, selector: (k) => `${k.primaryUrl} ${k.title}` })
      .filter((known) => known.every((a, i) => known.every((b, j) => i === j || !sameEvent(a, b, known, ALIASES))));
    /** Mostly a known record read again a little differently (case, a date a day or two off, another page, no venue), so many sightings match. */
    const sightingOf = (known: EventIdentity[]) =>
      fc.oneof(
        { arbitrary: identity, weight: 1 },
        {
          weight: 3,
          arbitrary: fc
            .record({ k: fc.constantFrom(...known), upper: fc.boolean(), shift: fc.integer({ min: -2, max: 2 }), page: fc.option(identity.map((i) => i.primaryUrl), { nil: undefined }), dropVenue: fc.boolean() })
            .map(({ k, upper, shift, page, dropVenue }): EventIdentity => ({
              primaryUrl: page ?? k.primaryUrl,
              title: upper ? k.title.toUpperCase() : `${k.title}!`,
              ...(k.venue !== undefined && !dropVenue ? { venue: k.venue } : {}),
              ...(k.start !== undefined ? { start: shiftDate(k.start, shift) } : {}),
            })),
        },
      );
    const scenario = distinct.chain((known) => fc.tuple(sightingOf(known), fc.constant(known), fc.shuffledSubarray(known, { minLength: known.length })));
    fc.assert(
      fc.property(scenario, ([sighting, known, shuffled]) => {
        expect(findMatch(sighting, shuffled, ALIASES)).toBe(findMatch(sighting, known, ALIASES));
      }),
      { numRuns: 500 },
    );
  });

  it("matchSighting does not depend on the order of a run's dataset: ends, kinds, recurring records and duplicate pointers (#321)", () => {
    // The pool above reaches only page and title, own page, fuzzy and venue-less; this one every rule and pointer.
    const team = fc.constantFrom("Chiefs", "KC", "Kansas City Chiefs", "Royals", "Midland");
    const matchup = fc.tuple(team, fc.constantFrom(" vs ", " vs. ", " @ ", " at "), team).map((parts) => parts.join(""));
    const gameName = fc.oneof(name, matchup);
    const record: fc.Arbitrary<EventIdentity> = fc
      .record(
        {
          primaryUrl: fc.constantFrom("https://a.test/calendar", "https://a.test/calendar/", "https://b.test/events", "https://c.test/"),
          title: gameName,
          venue: fc.option(gameName, { nil: undefined }),
          start: fc.option(day, { nil: undefined }),
          end: fc.option(fc.constantFrom("2026-12-01", "2026-12-02", "2027-01-10T17:00:00-06:00"), { nil: undefined }),
          eventUrl: fc.option(fc.constantFrom("https://a.test/e/1", "https://a.test/e/2/", "https://b.test/e/1"), { nil: undefined }),
          recurrence: fc.constantFrom("one-off" as const, "limited-run" as const, "recurring" as const),
          kind: fc.constantFrom("sports", "Sports", "music"),
          status: fc.constantFrom("active" as const, "unverified" as const),
        },
        { requiredKeys: ["primaryUrl", "title", "recurrence", "kind", "status"] },
      )
      .map(({ start, end, ...k }) => (k.recurrence === "recurring" ? k : { ...k, ...(start !== undefined ? { start } : {}), ...(end !== undefined ? { end } : {}) }));
    /** As the run's fold leaves the live records: no dated pair one event, no recurring pair one under the recurring rule, no dated record a month of a recurring one. */
    const folded = (live: EventIdentity[]) => {
      const dated = live.filter((e) => e.recurrence !== "recurring");
      const pair = (a: EventIdentity, b: EventIdentity) =>
        a.recurrence === "recurring"
          ? sameRecurringEvent(a, b, ALIASES) || (b.recurrence !== "recurring" && oneMonthOf(b, a))
          : b.recurrence !== "recurring" && sameEvent(a, b, dated, ALIASES);
      return live.every((a, i) => live.every((b, j) => i === j || !pair(a, b)));
    };
    const ids = ["evt_a", "evt_b", "evt_c", "evt_d", "evt_e", "evt_f", "evt_g", "evt_h"];
    const dataset = fc
      .uniqueArray(fc.tuple(fc.constantFrom(...ids), record), { minLength: 1, maxLength: 6, selector: ([id]) => id })
      .map((rows) => rows.map(([id, k]) => ({ ...k, id })))
      .filter(folded)
      .chain((live) =>
        // Expired records beside them: duplicates pointing at a kept record, at another duplicate, at themselves or at no record, and past records with no pointer.
        fc.array(fc.tuple(record, fc.option(fc.constantFrom(...live.map((k) => k.id), "evt_x0", "evt_x1", "evt_gone"), { nil: undefined })), { maxLength: 3 }).map((rows) => [
          ...live,
          ...rows.map(([k, duplicateOf], i) => ({ ...k, id: `evt_x${i}`, status: "expired" as const, ...(duplicateOf !== undefined ? { duplicateOf } : {}) })),
        ]),
      );
    /** Mostly a known record read again a little differently, now and then under another title (as a game's matchup is), a recurring one as one dated month of it. */
    const sightingOf = (known: EventIdentity[]) =>
      fc.oneof(
        { arbitrary: record.map(({ id: _id, status: _status, ...k }) => k), weight: 1 },
        // A game's listing under another matchup, at its venue on its date, from another page.
        {
          weight: 1,
          arbitrary: fc
            .record({ k: fc.constantFrom(...known), title: matchup, page: identity.map((i) => i.primaryUrl) })
            .map(({ k, title, page }): EventIdentity => ({ primaryUrl: page, title, recurrence: "one-off", kind: "sports", ...(k.venue !== undefined ? { venue: k.venue } : {}), ...(k.start !== undefined ? { start: k.start } : {}) })),
        },
        {
          weight: 4,
          arbitrary: fc
            .record({ k: fc.constantFrom(...known), upper: fc.boolean(), shift: fc.integer({ min: -2, max: 2 }), page: fc.option(identity.map((i) => i.primaryUrl), { nil: undefined }), dropVenue: fc.boolean(), month: fc.boolean(), retitle: fc.oneof({ arbitrary: fc.constant(undefined), weight: 3 }, { arbitrary: gameName, weight: 1 }) })
            .map(({ k: { id: _id, status: _status, duplicateOf: _duplicateOf, ...k }, upper, shift, page, dropVenue, month, retitle }): EventIdentity => {
              const asMonth = month && k.recurrence === "recurring";
              const { venue, start, ...rest } = k;
              return {
                ...rest,
                primaryUrl: page ?? k.primaryUrl,
                title: `${retitle ?? (upper ? k.title.toUpperCase() : `${k.title}!`)}${asMonth ? " (Oct. 2026)" : ""}`,
                ...(venue !== undefined && !dropVenue ? { venue } : {}),
                ...(start !== undefined ? { start: shiftDate(start, shift) } : asMonth ? { start: "2026-10-05" } : {}),
                ...(asMonth ? { recurrence: "limited-run" as const } : {}),
              };
            }),
        },
      );
    const scenario = dataset.chain((known) => fc.tuple(sightingOf(known), fc.constant(known), fc.shuffledSubarray(known, { minLength: known.length })));
    const outcome = (match: Match<EventIdentity>) => (match.kind === "matched" ? `${match.rule} ${match.event.id}` : match.kind);
    fc.assert(
      fc.property(scenario, ([sighting, known, shuffled]) => {
        expect(outcome(matchSighting(sighting, shuffled, ALIASES))).toBe(outcome(matchSighting(sighting, known, ALIASES)));
      }),
      { numRuns: 2000 },
    );
  });
});

describe("curation", () => {
  const why = fc.oneof(anyText, fc.array(fc.constantFrom("A rare club date", "{", "}", "[", "]", '"', "'", ",", " ", "(", ")", ".", "!", "?", "  "), { maxLength: 8 }).map((p) => p.join("")));

  it("cleanWhyLine is idempotent and never lengthens a line", () => {
    fc.assert(
      fc.property(why, (raw) => {
        const once = cleanWhyLine(raw);
        expect(cleanWhyLine(once)).toBe(once);
        expect(once.length).toBeLessThanOrEqual(raw.length);
      }),
    );
  });
});

describe("time", () => {
  const ZONE = "America/Chicago";
  const date = fc.date({ min: new Date("2020-01-01T00:00:00Z"), max: new Date("2035-12-31T00:00:00Z"), noInvalidDate: true }).map((d) => d.toISOString().slice(0, 10));
  const time = fc.tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 })).map(([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  /** The spring-forward hour, 2:00 to 2:59 on a March Sunday in Chicago, names no instant; any other wall time does. */
  const inGap = (d: string, t: string) => t.startsWith("02:") && fromLocal(d, t, ZONE).slice(11, 13) !== "02";

  it("a local wall time's instant falls on its own date, outside the spring-forward gap", () => {
    fc.assert(
      fc.property(date, time, (d, t) => {
        fc.pre(!inGap(d, t));
        expect(toLocalDate(new Date(fromLocal(d, t, ZONE)), ZONE)).toBe(d);
      }),
    );
  });

  it("shiftDate there and back is the date it started from", () => {
    fc.assert(fc.property(date, fc.integer({ min: -800, max: 800 }), (d, n) => shiftDate(shiftDate(d, n), -n) === d));
  });
});
