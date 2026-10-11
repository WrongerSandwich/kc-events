// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeGenerated } from "../src/build/write-generated";
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
});
