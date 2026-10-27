import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, DEFAULT_WHEN, EVERY_DATE, QUERY_KEYS, WHEN_LABELS, filterPills, isDefault, parseQuery, shortlistQuery, toQuery, type Filters } from "../src/lib/query";

const known = { kinds: ["music", "film", "theater/dance"], regions: ["Central KC", "Kansas City, Kansas", "Elsewhere in the metro"] };
const parse = (s: string) => parseQuery(new URLSearchParams(s), known);
const labels = (f: Filters) => filterPills(f).map((p) => p.label);

describe("query state", () => {
  it("parses nothing to the defaults", () => {
    expect(parse("")).toEqual(DEFAULT_FILTERS);
    expect(isDefault(parse(""))).toBe(true);
    expect(toQuery(DEFAULT_FILTERS)).toBe("");
  });

  it("opens on the week with no when, and writes every date out as when=all (#183)", () => {
    expect(parse("").when).toEqual({ preset: "weekend" });
    expect(toQuery({ ...DEFAULT_FILTERS, when: { preset: "weekend" } })).toBe("");
    expect(parse("when=all").when).toEqual(EVERY_DATE);
    expect(toQuery({ ...DEFAULT_FILTERS, when: EVERY_DATE })).toBe("when=all");
    expect(isDefault({ ...DEFAULT_FILTERS, when: EVERY_DATE })).toBe(false);
    expect(parse("when=all&recurring=1")).toEqual({ ...DEFAULT_FILTERS, when: EVERY_DATE, recurring: true });
  });

  it("reads a shortlist or saved-view link without when as every date, so a list is never cut to the week", () => {
    expect(parse("saved=1").when).toEqual(EVERY_DATE);
    expect(parse("ids=evt_a1").when).toEqual(EVERY_DATE);
    expect(parse("ids=evt_a1&when=soon").when).toEqual(EVERY_DATE);
    // A shortlist none of whose events is still published shows every date in its place.
    expect(parseQuery(new URLSearchParams("ids=evt_gone"), { ...known, ids: [] })).toMatchObject({ ids: [], when: EVERY_DATE });
    expect(toQuery({ ...DEFAULT_FILTERS, saved: true, when: EVERY_DATE })).toBe("saved=1");
    expect(toQuery({ ...DEFAULT_FILTERS, ids: ["evt_a1"], when: EVERY_DATE })).toBe("ids=evt_a1");
    // Narrowed to the week, the list says so.
    const week = { ...DEFAULT_FILTERS, saved: true };
    expect(toQuery(week)).toBe("when=weekend&saved=1");
    expect(parse(toQuery(week))).toEqual(week);
  });

  it("parses every filter, with repeated keys for multi-values", () => {
    const f = parse("when=weekend&kind=music&kind=theater-dance&region=kansas-city-kansas&picks=1&recurring=1&saved=1&q=jazz%20night&sort=venue");
    expect(f).toEqual<Filters>({
      when: { preset: "weekend" },
      kinds: ["music", "theater/dance"],
      regions: ["Kansas City, Kansas"],
      dontMiss: true,
      recurring: true,
      saved: true,
      q: "jazz night",
      sort: "venue",
      ids: [],
    });
    expect(isDefault(f)).toBe(false);
  });

  it("parses a custom range and normalizes a reversed one", () => {
    expect(parse("when=2026-10-09..2026-10-11").when).toEqual({ from: "2026-10-09", to: "2026-10-11" });
    expect(parse("when=2026-10-11..2026-10-09").when).toEqual({ from: "2026-10-09", to: "2026-10-11" });
  });

  it("ignores unknown keys, unknown slugs, malformed values, and keeps the first of repeated when", () => {
    const f = parse("when=soon&when=today&kind=opera&kind=film&region=mars&sort=price&foo=bar&picks=yes");
    expect(f.when).toEqual(DEFAULT_WHEN);
    expect(f.kinds).toEqual(["film"]);
    expect(f.regions).toEqual([]);
    expect(f.sort).toBe("date");
    expect(f.dontMiss).toBe(false);
    expect(parse("when=2026-13-45..2026-10-11").when).toEqual(DEFAULT_WHEN);
    expect(parse("when=2026-10-09..").when).toEqual(DEFAULT_WHEN);
  });

  it("serializes without defaults and round-trips", () => {
    const f = parse("when=7d&kind=film&region=central-kc&q=x");
    expect(toQuery(f)).toBe("when=7d&kind=film&region=central-kc&q=x");
    expect(parse(toQuery(f))).toEqual(f);
    const r = parse("when=2026-10-09..2026-10-11&sort=venue");
    expect(toQuery(r)).toBe("when=2026-10-09..2026-10-11&sort=venue");
    expect(parse(toQuery(r))).toEqual(r);
  });

  it("round-trips This weekend under its own key, leaving weekend as This week", () => {
    expect(parse("when=fri-sun").when).toEqual({ preset: "fri-sun" });
    expect(toQuery(parse("when=fri-sun"))).toBe("when=fri-sun");
    expect(parse("when=weekend").when).toEqual({ preset: "weekend" });
    expect(WHEN_LABELS["fri-sun"]).toBe("This weekend");
    expect(WHEN_LABELS.weekend).toBe("This week");
    expect(labels({ ...DEFAULT_FILTERS, when: { preset: "fri-sun" } })).toEqual(["This weekend"]);
  });

  it("keeps the first of a repeated when only if it is valid", () => {
    expect(parse("when=7d&when=today").when).toEqual({ preset: "7d" });
    expect(parse("when=soon&when=today").when).toEqual(DEFAULT_WHEN);
  });

  it("serializes dirty input to a stable query that parses back to the same filters", () => {
    const dirty = [
      "region=Central%20KC,Lawrence&kind=music",
      "kind=opera&region=mars&when=soon",
      "when=2026-10-11..2026-10-09",
      "when=2026-13-45..2026-10-11&q=%20jazz%20",
      "when=7d&when=today&when=30d",
      "kind=music&kind=music&region=central-kc&region=central-kc",
      "when=2026-10-09..2026-10-10..2026-10-11&sort=price&picks=yes",
    ];
    for (const s of dirty) {
      const f = parse(s);
      const q = toQuery(f);
      expect(parse(q), s).toEqual(f);
      expect(toQuery(parse(q)), s).toBe(q);
    }
  });

  it("reads dirty input as the defaults, or the valid part of it", () => {
    expect(parse("region=Central%20KC,Lawrence&kind=music")).toEqual({ ...DEFAULT_FILTERS, kinds: ["music"] });
    expect(parse("kind=opera&region=mars&when=soon")).toEqual(DEFAULT_FILTERS);
    expect(parse("when=2026-10-11..2026-10-09").when).toEqual({ from: "2026-10-09", to: "2026-10-11" });
    expect(parse("when=2026-13-45..2026-10-11&q=%20jazz%20")).toEqual({ ...DEFAULT_FILTERS, q: "jazz" });
    expect(parse("kind=music&kind=music&region=central-kc&region=central-kc")).toEqual({ ...DEFAULT_FILTERS, kinds: ["music"], regions: ["Central KC"] });
    expect(parse("when=2026-10-09..2026-10-10..2026-10-11&sort=price&picks=yes")).toEqual(DEFAULT_FILTERS);
  });

  it("trims and drops a blank search", () => {
    expect(parse("q=%20%20").q).toBe("");
    expect(toQuery({ ...DEFAULT_FILTERS, q: "  " })).toBe("");
  });

  it("exports the date validator the query parser uses", () => {
    expect(parse("when=2026-02-30..2026-03-01").when).toEqual(DEFAULT_WHEN);
    expect(parse("when=2026-02-27..2026-03-01").when).toEqual({ from: "2026-02-27", to: "2026-03-01" });
  });

  it("describes the active filters in words, for the empty state", () => {
    expect(labels(DEFAULT_FILTERS)).toEqual(["This week"]);
    expect(labels({ ...DEFAULT_FILTERS, when: EVERY_DATE })).toEqual(["Every date"]);
    expect(labels({ ...DEFAULT_FILTERS, when: EVERY_DATE, saved: true })).toEqual(["Saved only"]); // a list's dates are implied
    expect(labels({ ...DEFAULT_FILTERS, when: { preset: "weekend" }, kinds: ["music", "film"], regions: ["Kansas City, Kansas"], dontMiss: true, saved: true, q: " zzz " }))
      .toEqual(["This week", "Music", "Film", "Kansas City, Kansas", "Don't miss", "Saved only", "“zzz”"]);
    expect(labels({ ...DEFAULT_FILTERS, when: { from: "2026-10-09", to: "2026-10-11" }, recurring: true, sort: "venue" })).toEqual(["Oct 9–11", "Always there"]);
    expect(labels({ ...DEFAULT_FILTERS, when: { from: "2026-10-09", to: "2026-10-09" } })).toEqual(["Oct 9"]);
  });

  it("lists every key the query string can carry, for the page's before-hydration check", () => {
    const all: Filters = { when: { preset: "7d" }, kinds: ["music"], regions: ["Central KC"], dontMiss: true, recurring: true, saved: true, q: "jazz", sort: "venue", ids: ["evt_a1"] };
    expect([...new URLSearchParams(toQuery(all)).keys()].sort()).toEqual([...QUERY_KEYS].sort());
  });

  it("names each active filter as a pill that removes only that filter, sort kept", () => {
    // Every date narrows nothing, but it is not what the page opens on, so it has a pill, which goes back to the week.
    expect(filterPills({ ...DEFAULT_FILTERS, when: EVERY_DATE })).toEqual([{ label: "Every date", when: true, without: DEFAULT_FILTERS }]);
    // The default week narrows too, so it has a pill, which widens to every date.
    expect(filterPills(DEFAULT_FILTERS)).toEqual([{ label: "This week", when: true, without: { ...DEFAULT_FILTERS, when: EVERY_DATE } }]);
    const f: Filters = { ...DEFAULT_FILTERS, when: { preset: "weekend" }, kinds: ["music", "film"], regions: ["Lawrence"], dontMiss: true, recurring: true, saved: true, q: "jazz", sort: "venue" };
    const pills = filterPills(f);
    expect(pills.map((p) => p.label)).toEqual(["This week", "Music", "Film", "Lawrence", "Don't miss", "Always there", "Saved only", "“jazz”"]);
    const without = Object.fromEntries(pills.map((p) => [p.label, p.without]));
    expect(without["This week"]).toEqual({ ...f, when: { preset: "all" } });
    expect(without["Music"]).toEqual({ ...f, kinds: ["film"] });
    expect(without["Lawrence"]).toEqual({ ...f, regions: [] });
    expect(without["Don't miss"]).toEqual({ ...f, dontMiss: false });
    expect(without["Always there"]).toEqual({ ...f, recurring: false });
    expect(without["Saved only"]).toEqual({ ...f, saved: false });
    expect(without["“jazz”"]).toEqual({ ...f, q: "" });
    // Kind pills say which kind they are, so they can carry its icon and tint.
    expect(pills.filter((p) => p.kind !== undefined).map((p) => p.kind)).toEqual(["music", "film"]);
  });

  it("names a shortlist as one pill, Shortlist (N), whose removal clears it and nothing else", () => {
    const f: Filters = { ...DEFAULT_FILTERS, ids: ["evt_a1", "evt_b2"], when: { preset: "weekend" } };
    const pills = filterPills(f);
    expect(pills.map((p) => p.label)).toEqual(["Shortlist (2)", "This week"]);
    expect(pills[0]!.without).toEqual({ ...f, ids: [] });
  });
});

describe("shortlist ids (#132)", () => {
  const withIds = { ...known, ids: ["evt_a1", "evt_b2", "evt_c3"] };
  const parseIds = (s: string) => parseQuery(new URLSearchParams(s), withIds).ids;

  it("reads ids as a comma list, keeping their order", () => {
    expect(parseIds("ids=evt_c3,evt_a1")).toEqual(["evt_c3", "evt_a1"]);
  });

  it("drops unknown, malformed, blank, and repeated ids silently", () => {
    expect(parseIds("ids=evt_zz,evt_b2,,evt_b2,nope,evt_a1")).toEqual(["evt_b2", "evt_a1"]);
    expect(parseIds("ids=")).toEqual([]);
    expect(parseIds("ids=evt_zz")).toEqual([]);
  });

  it("accepts any well-formed id when the published ids are not given", () => {
    expect(parse("ids=evt_zz,bad%20id,evt_a1").ids).toEqual(["evt_zz", "evt_a1"]);
  });

  it("writes ids with plain commas, first, and round-trips with the other filters", () => {
    const f = parseQuery(new URLSearchParams("ids=evt_b2,evt_a1&when=7d"), withIds);
    expect(f).toEqual({ ...DEFAULT_FILTERS, ids: ["evt_b2", "evt_a1"], when: { preset: "7d" } });
    const q = toQuery(f);
    expect(q).toBe("ids=evt_b2,evt_a1&when=7d");
    expect(parseQuery(new URLSearchParams(q), withIds)).toEqual(f);
    expect(isDefault({ ...DEFAULT_FILTERS, ids: [] })).toBe(true);
    expect(isDefault({ ...DEFAULT_FILTERS, ids: ["evt_a1"] })).toBe(false);
  });

  it("builds a shortlist link from ids alone", () => {
    expect(shortlistQuery(["evt_a1", "evt_b2"])).toBe("ids=evt_a1,evt_b2");
  });
});
