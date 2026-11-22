/**
 * Build-time only: the figures the How it works page states, so that none of them is typed by hand from a run. The
 * newest weekly run's come from its report, in the `runs` directory beside the dataset.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseRunReport, type RunReport } from "../../../src/report.ts";
import { localDate } from "../lib/dates";
import type { RunFigures } from "../lib/types";

/** A report's file name: its run date. Its Markdown twin and a failed run's refused records (`.failed.json`) are not reports. */
const REPORT_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;

/**
 * The newest weekly run's report on or before the day of the dataset's last run: a midweek pass (#253) is passed over,
 * since it reads no list and judges almost nothing, and so is a report dated later than the dataset, which is another
 * dataset's. Nothing when there is no such report. A report that does not parse throws, as the changes page's does.
 */
export function readWeeklyReport(datasetPath: string, lastSuccessfulRun: string): RunReport | undefined {
  const dir = join(dirname(datasetPath), "runs");
  if (!existsSync(dir)) return undefined;
  const lastDay = localDate(lastSuccessfulRun);
  const days = readdirSync(dir)
    .flatMap((name) => REPORT_FILE.exec(name)?.[1] ?? [])
    .filter((day) => day <= lastDay)
    .sort()
    .reverse();
  for (const day of days) {
    const report = parseRunReport(JSON.parse(readFileSync(join(dir, `${day}.json`), "utf8")));
    if (report.mode === "weekly") return report;
  }
  return undefined;
}

/** A weekly report's figures for the page's strip and its spend bar. */
export function runFigures(report: RunReport): RunFigures {
  const calls = report.spend.modelCalls;
  const stages = new Map<string, { stage: string; calls: number; usd: number }>();
  for (const call of calls) {
    if (call.stage === undefined) continue; // a run from before calls recorded their stage (#257)
    const row = stages.get(call.stage) ?? { stage: call.stage, calls: 0, usd: 0 };
    row.calls += 1;
    row.usd += call.costUsd ?? 0;
    stages.set(call.stage, row);
  }
  const { sources } = report;
  return {
    runDate: report.runDate,
    minutes: Math.max(1, Math.round((Date.parse(report.finishedAt) - Date.parse(report.startedAt)) / 60_000)),
    sourcesTried: sources.filter((s) => s.result !== "excluded").length,
    sourcesFailed: sources.filter((s) => s.result === "failed" || s.result === "blocked").length,
    found: report.counts.found,
    new: report.counts.new,
    updated: report.counts.updated,
    modelCalls: calls.length,
    modelCallsFailed: calls.filter((c) => "error" in c).length,
    spendUsd: report.spend.totalUsd,
    capUsd: report.spend.capUsd,
    stages: [...stages.values()].sort((a, b) => b.usd - a.usd),
  };
}
