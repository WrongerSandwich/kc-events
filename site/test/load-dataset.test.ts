// @vitest-environment node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { checkSchemaVersion, loadPublished, MAX_PAYLOAD_BYTES, SITE_EXPECTS_SCHEMA_VERSION } from "../src/build/load-dataset";

const configYaml = `
neighborhoods:
  Central KC: [Crossroads, Downtown]
  Johnson County: [Olathe]
  Lawrence: [Lawrence]
`;

function activeEvent(over: Record<string, unknown> = {}) {
  return {
    id: "evt_000000000001",
    title: "A show",
    start: "2026-10-09T19:00:00-05:00",
    venue: "recordBar",
    neighborhood: "Crossroads",
    primaryUrl: "https://www.therecordbar.com/shows",
    kind: "music",
    recurrence: "one-off",
    dontMiss: false,
    firstSeen: "2026-10-03T16:05:31-05:00",
    lastVerified: "2026-10-03T21:47:36-05:00",
    status: "active",
    verificationFailures: 0,
    lead: { lane: "registry", source: "recordBar" },
    evidence: { date: "Oct 09 7:00 pm", venue: "recordBar presents" },
    ...over,
  };
}

function dataset(events: unknown[], over: Record<string, unknown> = {}) {
  return { schemaVersion: 1, generatedAt: "2026-10-05T06:30:00-05:00", lastSuccessfulRun: "2026-10-05T06:30:00-05:00", events, sourceState: {}, discoveryState: {}, ...over };
}

function write(ds: unknown, config = configYaml) {
  const dir = mkdtempSync(join(tmpdir(), "kc-site-"));
  const datasetPath = join(dir, "events.json");
  const configPath = join(dir, "research.config.yaml");
  writeFileSync(datasetPath, JSON.stringify(ds));
  writeFileSync(configPath, config);
  return { datasetPath, configPath, today: "2026-10-05" };
}

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
});
