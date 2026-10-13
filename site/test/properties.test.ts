import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addDays } from "../src/lib/dates";
import { parseQuery, toQuery, WHEN_PRESETS, type Filters } from "../src/lib/query";

/** Properties the site's query and date helpers promise for any input (#100), beside the example tests. */

const known = { kinds: ["music", "film", "theater/dance", "food & drink"], regions: ["Central KC", "Kansas City, Kansas", "Elsewhere in the metro"] };
const date = fc.date({ min: new Date("2020-01-01T00:00:00Z"), max: new Date("2035-12-31T00:00:00Z"), noInvalidDate: true }).map((d) => d.toISOString().slice(0, 10));

/** Filters as the explorer holds them: known kinds and regions once each, a range in order, a search already trimmed. */
const filters: fc.Arbitrary<Filters> = fc.record({
  when: fc.oneof(
    fc.constantFrom(...WHEN_PRESETS).map((preset) => ({ preset })),
    fc.tuple(date, date).map(([a, b]) => (a <= b ? { from: a, to: b } : { from: b, to: a })),
  ),
  kinds: fc.shuffledSubarray(known.kinds),
  regions: fc.shuffledSubarray(known.regions),
  dontMiss: fc.boolean(),
  recurring: fc.boolean(),
  saved: fc.boolean(),
  q: fc.string({ unit: "grapheme" }).map((s) => s.trim()),
  sort: fc.constantFrom("date" as const, "venue" as const),
  // Well-formed ids once each, in any order (parseQuery is not told the published ones here, so any is kept).
  ids: fc.uniqueArray(fc.stringMatching(/^evt_[A-Za-z0-9_-]{1,12}$/), { maxLength: 6 }),
});

describe("query", () => {
  it("parses what it writes back to the same filters", () => {
    fc.assert(
      fc.property(filters, (f) => {
        expect(parseQuery(new URLSearchParams(toQuery(f)), known)).toEqual(f);
      }),
      { numRuns: 500 },
    );
  });
});

describe("dates", () => {
  it("addDays there and back is the date it started from", () => {
    fc.assert(fc.property(date, fc.integer({ min: -800, max: 800 }), (d, n) => addDays(addDays(d, n), -n) === d));
  });
});
