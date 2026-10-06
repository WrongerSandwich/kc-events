import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, describeFilters, isDefault, parseQuery, toQuery, type Filters } from "../src/lib/query";

const known = { kinds: ["music", "film", "theater/dance"], regions: ["Central KC", "Kansas City, Kansas", "Elsewhere in the metro"] };
const parse = (s: string) => parseQuery(new URLSearchParams(s), known);

describe("query state", () => {
  it("parses nothing to the defaults", () => {
    expect(parse("")).toEqual(DEFAULT_FILTERS);
    expect(isDefault(parse(""))).toBe(true);
    expect(toQuery(DEFAULT_FILTERS, known)).toBe("");
  });

  it("parses every filter, with repeated keys for multi-values", () => {
    const f = parse("when=weekend&kind=music&kind=theater-dance&region=kansas-city-kansas&dontmiss=1&recurring=1&saved=1&q=jazz%20night&sort=venue");
    expect(f).toEqual<Filters>({
      when: { preset: "weekend" },
      kinds: ["music", "theater/dance"],
      regions: ["Kansas City, Kansas"],
      dontMiss: true,
      recurring: true,
      saved: true,
      q: "jazz night",
      sort: "venue",
    });
    expect(isDefault(f)).toBe(false);
  });

  it("parses a custom range and normalizes a reversed one", () => {
    expect(parse("when=2026-10-09..2026-10-11").when).toEqual({ from: "2026-10-09", to: "2026-10-11" });
    expect(parse("when=2026-10-11..2026-10-09").when).toEqual({ from: "2026-10-09", to: "2026-10-11" });
  });

  it("ignores unknown keys, unknown slugs, malformed values, and keeps the first of repeated when", () => {
    const f = parse("when=soon&when=today&kind=opera&kind=film&region=mars&sort=price&foo=bar&dontmiss=yes");
    expect(f.when).toEqual({ preset: "all" });
    expect(f.kinds).toEqual(["film"]);
    expect(f.regions).toEqual([]);
    expect(f.sort).toBe("date");
    expect(f.dontMiss).toBe(false);
    expect(parse("when=2026-13-45..2026-10-11").when).toEqual({ preset: "all" });
    expect(parse("when=2026-10-09..").when).toEqual({ preset: "all" });
  });

  it("serializes without defaults and round-trips", () => {
    const f = parse("when=7d&kind=film&region=central-kc&q=x");
    expect(toQuery(f, known)).toBe("when=7d&kind=film&region=central-kc&q=x");
    expect(parse(toQuery(f, known))).toEqual(f);
    const r = parse("when=2026-10-09..2026-10-11&sort=venue");
    expect(toQuery(r, known)).toBe("when=2026-10-09..2026-10-11&sort=venue");
    expect(parse(toQuery(r, known))).toEqual(r);
  });

  it("keeps the first of a repeated when only if it is valid", () => {
    expect(parse("when=7d&when=today").when).toEqual({ preset: "7d" });
    expect(parse("when=soon&when=today").when).toEqual({ preset: "all" });
  });

  it("serializes dirty input to a stable query that parses back to the same filters", () => {
    const dirty = [
      "region=Central%20KC,Lawrence&kind=music",
      "kind=opera&region=mars&when=soon",
      "when=2026-10-11..2026-10-09",
      "when=2026-13-45..2026-10-11&q=%20jazz%20",
      "when=7d&when=today&when=30d",
      "kind=music&kind=music&region=central-kc&region=central-kc",
      "when=2026-10-09..2026-10-10..2026-10-11&sort=price&dontmiss=yes",
    ];
    for (const s of dirty) {
      const f = parse(s);
      const q = toQuery(f, known);
      expect(parse(q), s).toEqual(f);
      expect(toQuery(parse(q), known), s).toBe(q);
    }
  });

  it("trims and drops a blank search", () => {
    expect(parse("q=%20%20").q).toBe("");
    expect(toQuery({ ...DEFAULT_FILTERS, q: "  " }, known)).toBe("");
  });

  it("describes the active filters in words, for the empty state", () => {
    expect(describeFilters(DEFAULT_FILTERS)).toEqual([]);
    expect(describeFilters({ ...DEFAULT_FILTERS, when: { preset: "weekend" }, kinds: ["music", "film"], regions: ["Kansas City, Kansas"], dontMiss: true, saved: true, q: " zzz " }))
      .toEqual(["Through Sunday", "music", "film", "Kansas City, Kansas", "don't-miss only", "saved only", "“zzz”"]);
    expect(describeFilters({ ...DEFAULT_FILTERS, when: { from: "2026-10-09", to: "2026-10-11" }, recurring: true, sort: "venue" })).toEqual(["Oct 9–11", "including always-there"]);
    expect(describeFilters({ ...DEFAULT_FILTERS, when: { from: "2026-10-09", to: "2026-10-09" } })).toEqual(["Oct 9"]);
  });
});
