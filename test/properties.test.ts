import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cleanWhyLine } from "../src/curation.js";
import { findMatch, normalizeName, sameEvent, sameName, sameVenue, type EventIdentity, type VenueAliases } from "../src/identity.js";
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
