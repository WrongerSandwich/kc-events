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
  it("writes three modules, the don't-miss one holding only flagged events, and publishes the dataset byte for byte", () => {
    const dir = mkdtempSync(join(tmpdir(), "kc-generate-"));
    const datasetPath = join(dir, "events.json");
    const configPath = join(dir, "research.config.yaml");
    // Indented and with a trailing blank line: a re-serialization would not reproduce this.
    const raw =
      JSON.stringify(
        dataset([
          activeEvent({ id: "evt_000000000001", dontMiss: true, whyLine: "A rare occasion." }),
          activeEvent({ id: "evt_000000000002" }),
          activeEvent({ id: "evt_000000000003", status: "expired", expiryReason: "past" }),
        ]),
        null,
        4,
      ) + "\n\n";
    writeFileSync(datasetPath, raw);
    writeFileSync(configPath, configYaml);
    const outDir = join(dir, "generated");
    const publicDir = join(dir, "public");

    const result = writeGenerated({ datasetPath, configPath, outDir, publicDir, today: "2026-10-05" });

    expect(result).toEqual({ eventCount: 2, buildToday: "2026-10-05" });
    const meta = exported(join(outDir, "meta.ts"));
    expect(meta.buildToday).toBe("2026-10-05");
    expect(meta).not.toHaveProperty("events");
    expect(exported(join(outDir, "events.ts")).map((e: { id: string }) => e.id)).toEqual(["evt_000000000001", "evt_000000000002"]);
    expect(exported(join(outDir, "dont-miss.ts")).map((e: { id: string }) => e.id)).toEqual(["evt_000000000001"]);
    expect(readFileSync(join(publicDir, "events.json"), "utf8")).toBe(raw);
  });
});
