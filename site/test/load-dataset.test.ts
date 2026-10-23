// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { parseConfig } from "../../src/config";
import type { Event } from "../../src/dataset";
import { checkSchemaVersion, LAST_RUN, loadPublished, MAX_PAYLOAD_BYTES, MIN_PUBLISHED, project, SITE_EXPECTS_SCHEMA_VERSION } from "../src/build/load-dataset";
import { activeEvent, configYaml, dataset, write } from "./fixtures/dataset";

describe("loadPublished", () => {
  it("keeps active, non-past events and projects them with a region", () => {
    const p = loadPublished(write(dataset([
      activeEvent(),
      activeEvent({ id: "evt_000000000002", status: "unverified", lastVerified: undefined, evidence: {} }),
      activeEvent({ id: "evt_000000000003", status: "expired", expiryReason: "past" }),
      activeEvent({ id: "evt_000000000004", start: "2026-10-04" }),
      activeEvent({ id: "evt_000000000005", neighborhood: "Olathe" }),
      activeEvent({ id: "evt_000000000006", recurrence: "recurring", start: undefined, schedule: "Every Tuesday" }),
    ])));
    expect(p.events.map((e) => e.id)).toEqual(["evt_000000000001", "evt_000000000005", "evt_000000000006"]);
    expect(p.events[0]).toEqual({
      id: "evt_000000000001", title: "A show", start: "2026-10-09T19:00:00-05:00", venue: "recordBar", neighborhood: "Crossroads", region: "Central KC",
      primaryUrl: "https://www.therecordbar.com/shows", kind: "music", recurrence: "one-off", dontMiss: false, lastVerified: "2026-10-03T21:47:36-05:00",
    });
    expect(p.events[1]!.region).toBe("Johnson County");
    expect(p.regions).toEqual(["Central KC", "Johnson County", "Lawrence", "Elsewhere in the metro"]);
    expect(p.kinds).toContain("music");
    expect(p.lastSuccessfulRun).toBe("2026-10-05T06:30:00-05:00");
    expect(p.buildToday).toBe("2026-10-05");
    expect(p.timeZone).toBe("America/Chicago");
  });

  it("carries the event's own page through when the job found one", () => {
    const p = loadPublished(write(dataset([activeEvent({ eventUrl: "https://www.therecordbar.com/shows/a-show" }), activeEvent({ id: "evt_000000000002" })])));
    expect(p.events[0]!.eventUrl).toBe("https://www.therecordbar.com/shows/a-show");
    expect(p.events[1]).not.toHaveProperty("eventUrl");
  });

  it("keeps descriptions out of the events and hands them over by id, for published events only", () => {
    const p = loadPublished(write(dataset([
      activeEvent({ description: "A three-piece playing their first record." }),
      activeEvent({ id: "evt_000000000002" }),
      activeEvent({ id: "evt_000000000003", start: "2026-10-04", description: "Already over." }),
    ])));
    expect(p.events.map((e) => e.id)).toEqual(["evt_000000000001", "evt_000000000002"]);
    expect(p.events[0]).not.toHaveProperty("description");
    expect(p.descriptions).toEqual({ evt_000000000001: "A three-piece playing their first record." });
  });

  it("maps a neighborhood that names a region to that region, and anything else unlisted to the catch-all", () => {
    const p = loadPublished(write(dataset([
      activeEvent({ neighborhood: "Johnson County" }),
      activeEvent({ id: "evt_000000000002", neighborhood: "Elsewhere in the metro" }),
      activeEvent({ id: "evt_000000000003", neighborhood: "Atlantis" }),
    ])));
    expect(p.events.map((e) => e.region)).toEqual(["Johnson County", "Elsewhere in the metro", "Elsewhere in the metro"]);
  });

  it("warns about published events that land in the catch-all by an off-list neighborhood, not about a region-named one", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      loadPublished(write(dataset([
        activeEvent({ neighborhood: "Johnson County" }),
        activeEvent({ id: "evt_000000000002", neighborhood: "Elsewhere in the metro" }),
        activeEvent({ id: "evt_000000000003", neighborhood: "Atlantis" }),
        activeEvent({ id: "evt_000000000004", neighborhood: "Narnia", start: "2026-10-04" }),
      ])));
      expect(warn).toHaveBeenCalledTimes(1);
      const msg = String(warn.mock.calls[0]![0]);
      expect(msg).toContain("Atlantis (1)");
      expect(msg).not.toContain("Johnson County");
      expect(msg).not.toContain("Narnia");
    } finally {
      warn.mockRestore();
    }
  });

  describe("venue aliases (#91)", () => {
    const withAliases = `${configYaml}
venueAliases:
  Kauffman Center for the Performing Arts: [Kauffman Center, Helzberg Hall]
  Lied Center of Kansas: [Main Auditorium]
`;
    const venues = (...names: string[]) => names.map((venue, i) => activeEvent({ id: `evt_${String(i + 1).padStart(12, "0")}`, venue }));

    it("shows an aliased name at its venue, with the page's name as the room when that was a room", () => {
      const p = loadPublished(write(dataset(venues("Helzberg Hall", "The Kauffman Center for the Performing Arts", "Kauffman Center", "Main Auditorium", "recordBar")), withAliases));
      expect(p.events.map((e) => [e.venue, e.room])).toEqual([
        ["Kauffman Center for the Performing Arts", "Helzberg Hall"],
        ["Kauffman Center for the Performing Arts", undefined],
        ["Kauffman Center for the Performing Arts", undefined],
        ["Lied Center of Kansas", "Main Auditorium"],
        ["recordBar", undefined],
      ]);
      expect(p.events[1]).not.toHaveProperty("room");
    });

    it("warns about a published venue that is only generic words or a street address, so the alias list can catch up", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        loadPublished(write(dataset(venues("Main Auditorium", "Galleries", "Galleries", "1801 East 18th Street", "8216 N Michigan Ct, Kansas City, MO 64118", "1900 Building", "recordBar")), withAliases));
        expect(warn).toHaveBeenCalledTimes(1);
        const msg = String(warn.mock.calls[0]![0]);
        expect(msg).toContain("Galleries (2)");
        expect(msg).toContain("1801 East 18th Street (1)");
        expect(msg).toContain("8216 N Michigan Ct, Kansas City, MO 64118 (1)");
        expect(msg).not.toContain("Main Auditorium");
        expect(msg).not.toContain("1900 Building");
        expect(msg).not.toContain("recordBar");
      } finally {
        warn.mockRestore();
      }
    });
  });

  it("carries the price and age limit an own page gave, and none of their quotes (#133)", () => {
    const quotes = { price: { page: "https://www.therecordbar.com/shows/a-show", quote: "Tickets $25" }, ages: { page: "https://www.therecordbar.com/shows/a-show", quote: "21+ only" } };
    const p = loadPublished(write(dataset([activeEvent({ eventUrl: "https://www.therecordbar.com/shows/a-show", price: "$25", ages: "21+", evidence: { ...activeEvent().evidence, ...quotes } })])));
    expect(p.events[0]).toMatchObject({ price: "$25", ages: "21+" });
    expect(JSON.stringify(p.events[0])).not.toContain("Tickets");
  });

  it("carries a run's days, and not their quote; a run without days carries none (#143)", () => {
    const run = { recurrence: "limited-run" as const, start: "2026-10-14", end: "2026-11-01", eventUrl: "https://www.therecordbar.com/shows/a-show" };
    const quote = { days: { page: "https://www.therecordbar.com/shows/a-show", quote: "Fridays through Sundays" } };
    const p = loadPublished(write(dataset([activeEvent({ ...run, days: ["Fri", "Sat", "Sun"], evidence: { ...activeEvent().evidence, ...quote } })])));
    expect(p.events[0]).toMatchObject({ days: [5, 6, 0], daysLine: "Fri–Sun" });
    expect(JSON.stringify(p.events[0])).not.toContain("Fridays through");
    expect(loadPublished(write(dataset([activeEvent(run)]))).events[0]).not.toHaveProperty("days");
    expect(loadPublished(write(dataset([activeEvent(run)]))).events[0]).not.toHaveProperty("daysLine");
  });

  it.each(["javascript:alert(1)", "data:text/html,hi", "https://www.therecordbar.com/a\nb"])("refuses %j as a link, in the dataset and in the projection", (url) => {
    expect(() => loadPublished(write(dataset([activeEvent({ eventUrl: url })])))).toThrow(/http/);
    const e = { ...activeEvent(), consecutiveOutages: 0 } as Event;
    expect(() => project({ ...e, primaryUrl: url }, parseConfig({}))).toThrow(/http or https/);
    expect(() => project({ ...e, eventUrl: url }, parseConfig({}))).toThrow(/http or https/);
    expect(project(e, parseConfig({})).primaryUrl).toBe(e.primaryUrl);
  });

  it("refuses a duplicate id among active events even when one is past", () => {
    expect(() => loadPublished(write(dataset([activeEvent(), activeEvent({ start: "2026-10-04" })])))).toThrow(/evt_000000000001/);
  });

  it("refuses a job schema version the site was not written against", () => {
    // The guard loadPublished runs on the job's DATASET_SCHEMA_VERSION: a deliberate bump in the job fails the build here.
    expect(() => checkSchemaVersion(SITE_EXPECTS_SCHEMA_VERSION + 1)).toThrow(/schema version 2 but the site expects 1/);
    expect(() => checkSchemaVersion(SITE_EXPECTS_SCHEMA_VERSION)).not.toThrow();
  });

  it("refuses a dataset file in a schema the job does not accept", () => {
    expect(() => loadPublished(write(dataset([activeEvent()], { schemaVersion: 2 })))).toThrow(/schemaVersion/);
  });

  it("refuses a dataset no run has written, a duplicate id, and an oversized payload", () => {
    expect(() => loadPublished(write(dataset([activeEvent()], { lastSuccessfulRun: null, generatedAt: null })))).toThrow(/no successful run/i);
    expect(() => loadPublished(write(dataset([activeEvent(), activeEvent()])))).toThrow(/evt_000000000001/);
    const big = Array.from({ length: Math.ceil(MAX_PAYLOAD_BYTES / 200) + 1 }, (_, i) => activeEvent({ id: `evt_${String(i).padStart(12, "0")}`, title: "x".repeat(150) }));
    expect(() => loadPublished(write(dataset(big)))).toThrow(/payload/i);
  });

  describe("what the pages cannot render (#92)", () => {
    it("refuses a one-off with no start, naming the event", () => {
      expect(() => loadPublished(write(dataset([activeEvent({ start: undefined, end: "2026-10-09" })])))).toThrow(/evt_000000000001.*one-off.*start/);
    });

    it.each([
      ["date before date", "2026-10-10", "2026-10-09"],
      ["time before time on the same day", "2026-10-09T19:00:00-05:00", "2026-10-09T18:00:00-05:00"],
      ["date before a timed start's day", "2026-10-09T19:00:00-05:00", "2026-10-08"],
    ])("refuses an end before its start (%s)", (_, start, end) => {
      expect(() => loadPublished(write(dataset([activeEvent({ recurrence: "limited-run", start, end })])))).toThrow(/evt_000000000001.*end.*before/);
    });

    it("accepts an end on its start's day, by date against a time, and a timed end equal to the start", () => {
      const p = loadPublished(write(dataset([
        activeEvent({ start: "2026-10-09T19:00:00-05:00", end: "2026-10-09" }),
        activeEvent({ id: "evt_000000000002", start: "2026-10-09", end: "2026-10-09T23:00:00-05:00" }),
        activeEvent({ id: "evt_000000000003", start: "2026-10-09T19:00:00-05:00", end: "2026-10-09T19:00:00-05:00" }),
        activeEvent({ id: "evt_000000000004", recurrence: "limited-run", start: undefined, end: "2026-10-20" }),
      ])));
      expect(p.events).toHaveLength(4);
    });

    it("refuses a kind the config does not list", () => {
      expect(() => loadPublished(write(dataset([activeEvent({ kind: "circus" })])))).toThrow(/evt_000000000001.*kind "circus"/);
    });

    it.each(["evt_1", "evt_00000000000G", "evt_0000000000001", "evt_00000000000a\"><x", "EVT_000000000001"])("refuses the id %j", (id) => {
      expect(() => loadPublished(write(dataset([activeEvent({ id })])))).toThrow(/id/);
    });

    it(`refuses fewer than ${MIN_PUBLISHED} published events unless SITE_ALLOW_SMALL=1, which the tests set (audit E14)`, () => {
      const many = (n: number) => Array.from({ length: n }, (_, i) => activeEvent({ id: `evt_${String(i + 1).padStart(12, "0")}` }));
      const small = write(dataset(many(MIN_PUBLISHED - 1)));
      expect(loadPublished(small).events).toHaveLength(MIN_PUBLISHED - 1);
      vi.stubEnv("SITE_ALLOW_SMALL", undefined);
      try {
        expect(() => loadPublished(small)).toThrow(new RegExp(`${MIN_PUBLISHED - 1} events.*fewer than ${MIN_PUBLISHED}.*SITE_ALLOW_SMALL=1`));
        expect(() => loadPublished(write(dataset([activeEvent({ status: "unverified", lastVerified: undefined, evidence: {} })])))).toThrow(/ 0 events/);
        expect(loadPublished(write(dataset(many(MIN_PUBLISHED)))).events).toHaveLength(MIN_PUBLISHED);
        vi.stubEnv("SITE_ALLOW_SMALL", "1");
        expect(loadPublished(small).events).toHaveLength(MIN_PUBLISHED - 1);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("refuses to publish nothing when the dataset has active events, and allows it when it has none", () => {
      expect(() => loadPublished(write(dataset([activeEvent({ start: "2026-10-01" })])))).toThrow(/no event to publish/);
      expect(loadPublished(write(dataset([activeEvent({ status: "unverified", lastVerified: undefined, evidence: {} })]))).events).toEqual([]);
    });

    it("refuses a build date more than 14 days from the last successful run, either way", () => {
      const files = write(dataset([activeEvent({ recurrence: "limited-run", start: "2026-09-01", end: "2026-12-31" })]));
      expect(loadPublished({ ...files, today: "2026-10-19" }).buildToday).toBe("2026-10-19");
      expect(loadPublished({ ...files, today: "2026-09-21" }).buildToday).toBe("2026-09-21");
      expect(() => loadPublished({ ...files, today: "2026-10-20" })).toThrow(/2026-10-20.*14 days.*2026-10-05/);
      expect(() => loadPublished({ ...files, today: "2026-09-20" })).toThrow(/14 days/);
    });

    describe("a production build with no known origin", () => {
      const files = write(dataset([activeEvent()]));
      const unset = () => {
        for (const name of ["SITE_ORIGIN", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL", "NODE_ENV"]) vi.stubEnv(name, undefined);
      };

      it("throws on Vercel or under NODE_ENV=production, and passes once an origin is set", () => {
        try {
          unset();
          expect(() => loadPublished(files)).not.toThrow();
          vi.stubEnv("VERCEL", "1");
          expect(() => loadPublished(files)).toThrow(/origin/);
          vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "kc-this-week.vercel.app");
          expect(() => loadPublished(files)).not.toThrow();
          unset();
          vi.stubEnv("NODE_ENV", "production");
          expect(() => loadPublished(files)).toThrow(/SITE_ORIGIN/);
          vi.stubEnv("SITE_ORIGIN", "https://www.kcthisweek.com");
          expect(() => loadPublished(files)).not.toThrow();
        } finally {
          vi.unstubAllEnvs();
        }
      });
    });
  });

  describe("the build's date", () => {
    const { today: _today, ...files } = write(dataset([activeEvent({ recurrence: "limited-run", start: "2026-10-01", end: "2026-10-31" })]));

    it("refuses a malformed SITE_TODAY or explicit today rather than skewing the past filter", () => {
      try {
        for (const bad of ["tomorrow", "2026-10-5", "2026-02-30", "20261005", ""]) {
          vi.stubEnv("SITE_TODAY", bad);
          expect(() => loadPublished(files), bad).toThrow(/SITE_TODAY|today/i);
        }
        vi.stubEnv("SITE_TODAY", undefined);
        expect(() => loadPublished({ ...files, today: "soon" })).toThrow(/today/i);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("is an explicit today first, then SITE_TODAY, then the clock in the configured zone", () => {
      vi.useFakeTimers({ now: new Date("2026-10-20T03:30:00Z") }); // still Oct 19 in Chicago
      try {
        vi.stubEnv("SITE_TODAY", "2026-10-12");
        expect(loadPublished({ ...files, today: "2026-10-05" }).buildToday).toBe("2026-10-05");
        expect(loadPublished(files).buildToday).toBe("2026-10-12");
        vi.stubEnv("SITE_TODAY", undefined);
        expect(loadPublished(files).buildToday).toBe("2026-10-19");
      } finally {
        vi.unstubAllEnvs();
        vi.useRealTimers();
      }
    });

    it("is the last successful run's local day for SITE_TODAY=last-run, whatever the clock says (the site tests' build)", () => {
      vi.useFakeTimers({ now: new Date("2027-06-01T12:00:00Z") });
      try {
        vi.stubEnv("SITE_TODAY", LAST_RUN);
        expect(loadPublished(files).buildToday).toBe("2026-10-05");
        vi.stubEnv("SITE_TODAY", undefined);
        expect(loadPublished({ ...files, today: LAST_RUN }).buildToday).toBe("2026-10-05");
      } finally {
        vi.unstubAllEnvs();
        vi.useRealTimers();
      }
    });
  });
});
