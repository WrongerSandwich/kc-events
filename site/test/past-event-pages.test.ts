// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadPublished } from "../src/build/load-dataset";
import { activeEvent, dataset, expired, withArchive, write } from "./fixtures/dataset";

/** What a past event's URL gets (#303): an ended page for 28 days after its last day, then a year of redirect to its venue. */
describe("past event pages", () => {
  const ended = (paths: ReturnType<typeof write>) => loadPublished(paths).ended.map((e) => e.id);
  const redirects = (paths: ReturnType<typeof write>) => loadPublished(paths).redirects;

  it("gives an event expired as past 1 to 28 days ago an ended page, projected as a published event is, and nothing else", () => {
    const p = loadPublished(write(dataset([activeEvent(), expired("evt_00000000000a", "recordBar", 1), expired("evt_00000000000b", "recordBar", 28, "past", { description: "Gone now." })])));
    expect(p.ended.map((e) => e.id)).toEqual(["evt_00000000000a", "evt_00000000000b"]);
    expect(p.ended[0]).toMatchObject({ id: "evt_00000000000a", venue: "recordBar", region: "Central KC", start: "2026-10-04" });
    expect(p.descriptions.evt_00000000000b).toBe("Gone now.");
    expect(p.events.map((e) => e.id)).toEqual(["evt_000000000001"]);
    expect(p.redirects).toEqual({});
  });

  it("gives an active event already past, before the run expires it, the same ended page", () => {
    expect(ended(write(dataset([activeEvent(), activeEvent({ id: "evt_00000000000a", start: "2026-10-03" })])))).toEqual(["evt_00000000000a"]);
  });

  it("goes by a run's last day, so a run that closed yesterday is ended however long ago it opened", () => {
    expect(ended(write(dataset([activeEvent(), expired("evt_00000000000a", "recordBar", 200, "past", { recurrence: "limited-run", end: "2026-10-04" })])))).toEqual(["evt_00000000000a"]);
  });

  it("gives no other expiry reason, cancelled included, an ended page or a redirect", () => {
    for (const reason of ["two-strike", "cancelled", "index-page", "promotion", "not-public", "stale", "outside-geography"]) {
      for (const daysAgo of [3, 60]) {
        const p = loadPublished(write(dataset([activeEvent(), expired("evt_00000000000a", "recordBar", daysAgo, reason)])));
        expect(p.ended, `${reason} ${daysAgo}`).toEqual([]);
        expect(p.redirects, `${reason} ${daysAgo}`).toEqual({});
      }
    }
  });

  it("gives a record that passed without ever being verified, so was never published, nothing", () => {
    const never = (daysAgo: number) => expired("evt_00000000000a", "recordBar", daysAgo, "past", { lastVerified: undefined, verificationFailures: 1 });
    expect(ended(write(dataset([activeEvent(), never(3)])))).toEqual([]);
    expect(redirects(write(dataset([activeEvent(), never(60)])))).toEqual({});
  });

  it("redirects an event 29 to 365 days past to its venue's page, from the dataset or the archive, and nothing past that", () => {
    const p = loadPublished(withArchive(
      [activeEvent(), expired("evt_00000000000a", "recordBar", 29)],
      [expired("evt_00000000000b", "Knuckleheads", 365, "past", { neighborhood: "Northland" }), expired("evt_00000000000c", "recordBar", 366)],
    ));
    expect(p.ended).toEqual([]);
    expect(p.redirects).toEqual({ evt_00000000000a: "/v/recordbar", evt_00000000000b: "/v/knuckleheads" });
  });

  it("goes by an overnight event's first night, as isPast does, so its page is never a 404 in between", () => {
    // 22:00 on 2026-09-06 to 01:00 the next day: its last day is the 6th, 29 days back, where the end's date would be 28.
    const late = expired("evt_00000000000a", "recordBar", 29, "past", { start: "2026-09-06T22:00:00-05:00", end: "2026-09-07T01:00:00-05:00" });
    const p = loadPublished(write(dataset([activeEvent(), late])));
    expect(p.ended).toEqual([]);
    expect(p.redirects).toEqual({ evt_00000000000a: "/v/recordbar" });
  });

  it("takes the dataset's record over the archive's when both hold one id", () => {
    const p = loadPublished(withArchive([activeEvent(), expired("evt_00000000000a", "recordBar", 3)], [expired("evt_00000000000a", "Knuckleheads", 100, "past", { neighborhood: "Northland" })]));
    expect(p.ended.map((e) => [e.id, e.venue])).toEqual([["evt_00000000000a", "recordBar"]]);
    expect(p.redirects).toEqual({});
  });

  it("redirects an event to its venue as the site names it, under the venue's alias", () => {
    const config = `neighborhoods:\n  Central KC: [Crossroads, Downtown]\nvenueAliases:\n  Kauffman Center for the Performing Arts: [Helzberg Hall]\n`;
    const p = loadPublished(write(dataset([activeEvent(), expired("evt_00000000000a", "Helzberg Hall", 60, "past", { neighborhood: "Downtown" })]), config));
    expect(p.redirects).toEqual({ evt_00000000000a: "/v/kauffman-center-for-the-performing-arts" });
  });

  it("redirects nothing when the venue has no page in the build, a street address or generic words", () => {
    expect(redirects(write(dataset([activeEvent(), expired("evt_00000000000a", "1120 Central Avenue, Kansas City, KS 66102", 60), expired("evt_00000000000b", "Galleries", 60)])))).toEqual({});
  });

  describe("a duplicate", () => {
    /** A record folded into `into`, as the job expires one (duplicateOf), once verified, with its own long-gone day. */
    const dup = (id: string, into: string | undefined, over: Record<string, unknown> = {}) =>
      expired(id, "recordBar", 400, "duplicate", { ...(into !== undefined && { duplicateOf: into }), ...over });

    it("gets nothing when it was never verified, so its URL was never published", () => {
      const never = dup("evt_00000000000a", "evt_000000000001", { venue: undefined, lastVerified: undefined, verificationFailures: 1 });
      expect(redirects(write(dataset([activeEvent(), never])))).toEqual({});
    });

    it("redirects to the event page of the live record it was folded into, through a chain of folds, from the archive too", () => {
      const p = loadPublished(withArchive([activeEvent(), dup("evt_00000000000a", "evt_000000000001"), dup("evt_00000000000b", "evt_00000000000a")], [dup("evt_00000000000c", "evt_000000000001")]));
      expect(p.redirects).toEqual({ evt_00000000000a: "/e/evt_000000000001", evt_00000000000b: "/e/evt_000000000001", evt_00000000000c: "/e/evt_000000000001" });
      expect(p.ended).toEqual([]);
    });

    it("redirects to the ended page of a survivor that has ended", () => {
      expect(redirects(write(dataset([activeEvent(), expired("evt_00000000000a", "recordBar", 3), dup("evt_00000000000b", "evt_00000000000a")])))).toEqual({ evt_00000000000b: "/e/evt_00000000000a" });
    });

    it("redirects where the survivor redirects, to its venue", () => {
      expect(redirects(write(dataset([activeEvent(), expired("evt_00000000000a", "recordBar", 60), dup("evt_00000000000b", "evt_00000000000a")])))).toEqual({
        evt_00000000000a: "/v/recordbar",
        evt_00000000000b: "/v/recordbar",
      });
    });

    it("gets nothing when its survivor gets nothing, its chain loops or leaves the records, or it names no survivor", () => {
      const p = loadPublished(write(dataset([
        activeEvent(),
        expired("evt_00000000000a", "recordBar", 3, "two-strike"),
        dup("evt_00000000000b", "evt_00000000000a"),
        expired("evt_00000000000c", "recordBar", 400),
        dup("evt_00000000000d", "evt_00000000000c"),
        dup("evt_00000000000e", "evt_00000000000f"),
        dup("evt_00000000000f", "evt_00000000000e"),
        dup("evt_000000000010", "evt_0000000000ff"),
        dup("evt_000000000011", undefined),
      ])));
      expect(p.redirects).toEqual({});
      expect(p.ended).toEqual([]);
    });
  });

  it("gives a past event in a place outside the geography nothing", () => {
    const config = `neighborhoods:\n  Central KC: [Crossroads]\noutsidePlaces: [Lawrence]\n`;
    const p = loadPublished(write(dataset([activeEvent(), expired("evt_00000000000a", "Liberty Hall", 3, "past", { neighborhood: "Lawrence" })]), config));
    expect(p.ended).toEqual([]);
  });
});
