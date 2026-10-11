// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MAX_PICKS, writeGenerated } from "../src/build/write-generated";
import { activeEvent, configYaml, dataset } from "./fixtures/dataset";

/** The value a generated module exports: the JSON after "export const x: T = ". */
function exported(path: string): any {
  return JSON.parse(/ = (.*);\n$/s.exec(readFileSync(path, "utf8"))![1]!);
}

describe("writeGenerated", () => {
  it("writes four modules, the don't-miss one holding only flagged events, and publishes the projection with descriptions", () => {
    const dir = mkdtempSync(join(tmpdir(), "kc-generate-"));
    const datasetPath = join(dir, "events.json");
    const configPath = join(dir, "research.config.yaml");
    writeFileSync(
      datasetPath,
      JSON.stringify(
        dataset([
          activeEvent({ id: "evt_000000000001", dontMiss: true, whyLine: "A rare occasion." }),
          activeEvent({ id: "evt_000000000002", description: "A three-piece playing their first record." }),
          activeEvent({ id: "evt_000000000003", status: "expired", expiryReason: "past" }),
          activeEvent({ id: "evt_000000000004", status: "unverified", venue: undefined, lastVerified: undefined }),
        ]),
      ),
    );
    writeFileSync(configPath, configYaml);
    const outDir = join(dir, "generated");
    const publicDir = join(dir, "public");

    const result = writeGenerated({ datasetPath, configPath, outDir, publicDir, today: "2026-10-05", now: new Date("2026-10-05T14:00:00Z") });

    expect(result).toEqual({ eventCount: 2, buildToday: "2026-10-05" });
    const meta = exported(join(outDir, "meta.ts"));
    expect(meta.buildToday).toBe("2026-10-05");
    expect(meta).not.toHaveProperty("events");
    expect(exported(join(outDir, "events.ts")).map((e: { id: string }) => e.id)).toEqual(["evt_000000000001", "evt_000000000002"]);
    expect(exported(join(outDir, "dont-miss.ts")).map((e: { id: string }) => e.id)).toEqual(["evt_000000000001"]);
    expect(exported(join(outDir, "descriptions.ts"))).toEqual({ evt_000000000002: "A three-piece playing their first record." });
    const published = JSON.parse(readFileSync(join(publicDir, "events.json"), "utf8"));
    expect(Object.keys(published)).toEqual(["schemaVersion", "generatedAt", "lastSuccessfulRun", "events"]);
    expect(published).toMatchObject({ schemaVersion: 2, generatedAt: "2026-10-05T14:00:00.000Z", lastSuccessfulRun: "2026-10-05T06:30:00-05:00" });
    expect(published.events.map((e: { id: string }) => e.id)).toEqual(["evt_000000000001", "evt_000000000002"]);
    expect(published.events[0]).toEqual(exported(join(outDir, "events.ts"))[0]);
    expect(published.events[1]).toEqual({ ...exported(join(outDir, "events.ts"))[1], description: "A three-piece playing their first record." });
  });

  it("leaves an event held for promotion (ADR 0012) out of every generated module and the published events.json, verified reading or not", () => {
    const dir = mkdtempSync(join(tmpdir(), "kc-generate-"));
    const datasetPath = join(dir, "events.json");
    const configPath = join(dir, "research.config.yaml");
    const held = { status: "unverified", heldForPromotion: true, lead: { lane: "discovery", query: "music events in Kansas City" }, primaryUrl: "https://winery.example/events/a-show" };
    writeFileSync(
      datasetPath,
      JSON.stringify(
        dataset([
          activeEvent({ id: "evt_000000000001" }),
          activeEvent({ id: "evt_000000000002", ...held, dontMiss: true, whyLine: "A rare occasion.", description: "Three bands in the barrel room." }),
          activeEvent({ id: "evt_000000000003", ...held, lastVerified: undefined, evidence: {} }),
        ]),
      ),
    );
    writeFileSync(configPath, configYaml);
    const outDir = join(dir, "generated");

    const publicDir = join(dir, "public");

    const result = writeGenerated({ datasetPath, configPath, outDir, publicDir, today: "2026-10-05" });

    expect(result.eventCount).toBe(1);
    expect(exported(join(outDir, "events.ts")).map((e: { id: string }) => e.id)).toEqual(["evt_000000000001"]);
    expect(exported(join(outDir, "dont-miss.ts"))).toEqual([]);
    expect(exported(join(outDir, "descriptions.ts"))).toEqual({});
    const published = readFileSync(join(publicDir, "events.json"), "utf8");
    expect(JSON.parse(published).events.map((e: { id: string }) => e.id)).toEqual(["evt_000000000001"]);
    expect(published).not.toContain("winery.example");
    expect(published).not.toContain("barrel room");
  });

  it("warns when the front page would carry more picks than its budget was sized for, and not at the ceiling", () => {
    const picks = (n: number) =>
      dataset(Array.from({ length: n }, (_, i) => activeEvent({ id: `evt_${String(i + 1).padStart(12, "0")}`, dontMiss: true, whyLine: "A rare occasion." })));
    const run = (n: number) => {
      const dir = mkdtempSync(join(tmpdir(), "kc-generate-"));
      writeFileSync(join(dir, "events.json"), JSON.stringify(picks(n)));
      writeFileSync(join(dir, "research.config.yaml"), configYaml);
      writeGenerated({ datasetPath: join(dir, "events.json"), configPath: join(dir, "research.config.yaml"), outDir: join(dir, "generated"), publicDir: join(dir, "public"), today: "2026-10-05" });
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      run(MAX_PICKS);
      expect(warn).not.toHaveBeenCalled();
      run(MAX_PICKS + 1);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain(`${MAX_PICKS + 1} don't-miss picks, over the ${MAX_PICKS}`);
    } finally {
      warn.mockRestore();
    }
  });
});
