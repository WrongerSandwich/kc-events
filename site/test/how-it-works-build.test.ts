// @vitest-environment node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseRunReport } from "../../src/report";
import { readWeeklyReport, runFigures } from "../src/build/how-it-works";
import { tempDir } from "./fixtures/temp-dir";

/** The end-to-end fixture's report with no mode, no source and no model call: the oldest shape a build may meet. */
const bare = (): Record<string, any> => {
  const { mode: _mode, ...report } = JSON.parse(readFileSync(fileURLToPath(new URL("../e2e/fixtures/runs/2026-10-05.json", import.meta.url)), "utf8"));
  const { modelCalls: _calls, ...spend } = report.spend;
  return { ...report, sources: [], spend: { ...spend, totalUsd: 0 } };
};

/** A dataset path in a fresh directory, with these files in the `runs` directory beside it. */
function runsBeside(files: Record<string, string>): string {
  const dir = tempDir("kc-how-");
  mkdirSync(join(dir, "runs"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, "runs", name), text);
  return join(dir, "events.json");
}

const report = (over: Record<string, unknown>) => JSON.stringify({ ...bare(), ...over });

describe("readWeeklyReport", () => {
  it("passes over a later midweek pass for the newest weekly run", () => {
    const datasetPath = runsBeside({
      "2026-11-09.json": report({ runDate: "2026-11-09", mode: "weekly" }),
      "2026-11-16.json": report({ runDate: "2026-11-16", mode: "weekly" }),
      "2026-11-19.json": report({ runDate: "2026-11-19", mode: "reverify-only", windowDays: 10 }),
    });
    expect(readWeeklyReport(datasetPath, "2026-11-19T06:25:00-06:00")?.runDate).toBe("2026-11-16");
  });

  it("counts a report from before runs had a mode as a weekly one", () => {
    const datasetPath = runsBeside({ "2026-10-05.json": report({ runDate: "2026-10-05" }) });
    expect(readWeeklyReport(datasetPath, "2026-10-05T06:30:00-05:00")?.runDate).toBe("2026-10-05");
  });

  it("never chooses a report dated after the dataset's last run", () => {
    const datasetPath = runsBeside({
      "2026-11-16.json": report({ runDate: "2026-11-16", mode: "weekly" }),
      "2026-11-23.json": report({ runDate: "2026-11-23", mode: "weekly" }),
    });
    expect(readWeeklyReport(datasetPath, "2026-11-16T06:40:27-06:00")?.runDate).toBe("2026-11-16");
  });

  it("opens only the reports: not their Markdown twins, nor a failed run's refused records", () => {
    const datasetPath = runsBeside({
      "2026-11-16.json": report({ runDate: "2026-11-16", mode: "weekly" }),
      "2026-11-16.md": "# Research run 2026-11-16",
      "2026-11-23.failed.json": "not JSON at all",
    });
    expect(readWeeklyReport(datasetPath, "2026-11-23T06:40:00-06:00")?.runDate).toBe("2026-11-16");
  });

  it("finds nothing where there is no runs directory, or no weekly report in it", () => {
    expect(readWeeklyReport(join(tempDir("kc-how-"), "events.json"), "2026-11-16T06:40:27-06:00")).toBeUndefined();
    expect(readWeeklyReport(runsBeside({}), "2026-11-16T06:40:27-06:00")).toBeUndefined();
    const midweekOnly = runsBeside({ "2026-11-19.json": report({ runDate: "2026-11-19", mode: "reverify-only", windowDays: 10 }) });
    expect(readWeeklyReport(midweekOnly, "2026-11-19T06:25:00-06:00")).toBeUndefined();
  });
});

describe("runFigures", () => {
  const sources = (results: string[]) => results.map((result, i) => ({ name: `Source ${i + 1}`, result, extracted: 0 }));

  it("counts the run's length, its sources, its calls and its spend by stage, most spend first", () => {
    const figures = runFigures(
      parseRunReport({
        ...bare(),
        runDate: "2026-11-16",
        startedAt: "2026-11-16T06:17:06-06:00",
        finishedAt: "2026-11-16T06:40:27-06:00",
        counts: { ...bare().counts, found: 413, new: 84, updated: 326 },
        sources: sources(["fetched", "fetched", "failed", "blocked", "excluded"]),
        spend: {
          ...bare().spend,
          totalUsd: 0.54,
          modelCalls: [
            { model: "m", stage: "extraction", ms: 100, costUsd: 0.1 },
            { model: "m", stage: "extraction", ms: 100, costUsd: 0.14 },
            { model: "c", stage: "curation", ms: 100, costUsd: 0.3 },
            { model: "c", stage: "curation", ms: 100, error: "timed out" },
          ],
        },
      }),
    );
    expect(figures).toMatchObject({ runDate: "2026-11-16", minutes: 23, sourcesTried: 4, sourcesFailed: 2, found: 413, new: 84, updated: 326, modelCalls: 4, modelCallsFailed: 1, spendUsd: 0.54, capUsd: 5 });
    expect(figures.stages.map((s) => [s.stage, s.calls])).toEqual([["curation", 2], ["extraction", 2]]);
    expect(figures.stages[0]!.usd).toBeCloseTo(0.3);
    expect(figures.stages[1]!.usd).toBeCloseTo(0.24);
  });

  it("reads a report that records no source and no model call without a bar to draw", () => {
    const figures = runFigures(parseRunReport(bare()));
    expect(figures).toMatchObject({ sourcesTried: 0, sourcesFailed: 0, modelCalls: 0, modelCallsFailed: 0, stages: [] });
  });

  it("counts a call that recorded no stage, and leaves it out of the stages", () => {
    const figures = runFigures(parseRunReport({ ...bare(), spend: { ...bare().spend, totalUsd: 0.2, modelCalls: [{ model: "m", costUsd: 0.2 }] } }));
    expect(figures.modelCalls).toBe(1);
    expect(figures.stages).toEqual([]);
  });

  it("never calls a run shorter than a minute", () => {
    expect(runFigures(parseRunReport({ ...bare(), startedAt: "2026-10-05T06:00:00-05:00", finishedAt: "2026-10-05T06:00:20-05:00" })).minutes).toBe(1);
  });
});
