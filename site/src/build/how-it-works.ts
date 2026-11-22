/**
 * Build-time only: the figures the How it works page states, so that none of them is typed by hand from a run. The
 * newest weekly run's come from its report, in the `runs` directory beside the dataset.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RunConfig } from "../../../src/config.ts";
import { parseRunReport, type RunReport } from "../../../src/report.ts";
import { localDate } from "../lib/dates";
import { cronWhen } from "../lib/how-it-works";
import type { HowItWorksConstants, PublishedHowItWorks, RunFigures } from "../lib/types";

/**
 * The job's constants the page states, as literals: importing them would load the run's whole module graph in the
 * generate step, which a production build has tripped on before (test/import-order.test.ts in the job).
 * test/how-it-works-constants.test.ts holds every one to where the job defines it.
 */
export const CONSTANTS = {
  strikesToExpire: 2,
  outagesToUnverify: 3,
  runsToStale: 4,
  horizonSlackDays: 2,
  fuzzyDateWindowDays: 3,
  failingSourceRuns: 3,
  emptyReadingGuard: 3,
  reverifyDays: 10,
  archiveAfterWeeks: 8,
  curationBatchSize: 25,
  whyLineCap: 200,
  maxPageChars: 70_000,
  maxBodyBytes: 5_000_000,
  defaultCrawlDelayMs: 1_000,
  maxCrawlDelayMs: 10_000,
  calibrationLow: 25,
  calibrationHigh: 35,
  minPublished: 50,
  staleAfterDays: 9,
} as const satisfies HowItWorksConstants;

/** The cron lines and waits in scripts/, which are shell and so cannot be imported; the same test holds them. */
export const SCHEDULE = {
  weeklyCron: "17 6 * * 1",
  midweekCron: "17 6 * * 4",
  deployCron: "5 0 * * *",
  runTimeoutMinutes: 90,
  deployWaitMinutes: 15,
} as const;

/**
 * The page's times come from the cron lines, but its sentences and its diagrams' marks say "Monday" and "Thursday" in
 * words (the lede, the week, the steps' two marks, Strike or outage). A cron line moved to another day would leave
 * those standing, so the build refuses one until the page's words are changed with it.
 */
export function checkScheduleDays(schedule: { weeklyCron: string; midweekCron: string }): void {
  for (const [cron, days, what] of [[schedule.weeklyCron, "Mondays", "weekly run"], [schedule.midweekCron, "Thursdays", "midweek pass"]] as const) {
    if (cronWhen(cron).days !== days) {
      throw new Error(`the ${what}'s cron line is "${cron}", but the How it works page says it runs on ${days}: change the days named in site/src/pages/about/how-it-works.astro and site/src/components/how/sections/, then this check`);
    }
  }
}

/** Everything the How it works page is given: the config's settings, the literals above, what is published, and the newest weekly run. */
export function howItWorks(opts: { config: RunConfig; datasetPath: string; lastSuccessfulRun: string; activeEvents: number; picks: number }): PublishedHowItWorks {
  const { config } = opts;
  checkScheduleDays(SCHEDULE);
  const report = readWeeklyReport(opts.datasetPath, opts.lastSuccessfulRun);
  return {
    settings: {
      horizonWeeks: config.horizonWeeks,
      spendCapUsd: config.spendCapUsd,
      extractionReads: config.extractionReads,
      concurrency: config.concurrency,
      ownPageReadsPerRun: config.ownPageReadsPerRun,
      extractionModel: config.models.extraction,
      curationModel: config.models.curation,
      discoveryCadence: config.discovery.cadence,
      discoveryResultsPerQuery: config.discovery.resultsPerQuery,
      // One search for each kind but the catch-all (discoveryQueries in the job's src/discovery.ts).
      discoverySearches: config.kinds.filter((kind) => kind !== "other").length,
    },
    constants: CONSTANTS,
    schedule: SCHEDULE,
    counts: { activeEvents: opts.activeEvents, picks: opts.picks },
    ...(report !== undefined && { run: runFigures(report) }),
  };
}

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
