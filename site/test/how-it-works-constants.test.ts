// @vitest-environment node
/**
 * The How it works page states the job's constants and schedule. They are literals in the site's build (CONSTANTS and
 * SCHEDULE), so that the generate step takes no new import from the job; this file holds each one to where the job
 * defines it, and fails when one is changed there and not here.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_CRAWL_DELAY_MS, MAX_BODY_BYTES, MAX_CRAWL_DELAY_MS } from "../../src/adapters/fetch-policy";
import { ARCHIVE_AFTER_WEEKS } from "../../src/archive";
import { CURATION_BATCH_SIZE, WHY_LINE_CAP } from "../../src/curation";
import { CALIBRATION } from "../../src/curation-compare";
import { HORIZON_SLACK_DAYS, OUTAGES_TO_UNVERIFY, RUNS_TO_STALE, STRIKES_TO_EXPIRE } from "../../src/expiry";
import { MAX_PAGE_CHARS } from "../../src/extraction";
import { FUZZY_DATE_WINDOW_DAYS } from "../../src/identity";
import { EMPTY_READING_GUARD, FAILING_SOURCE_THRESHOLD } from "../../src/run";
import { CONSTANTS, SCHEDULE } from "../src/build/how-it-works";
import { MIN_PUBLISHED } from "../src/build/load-dataset";
import { siteConfig } from "../src/site.config";

const repoFile = (path: string) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");

describe("the constants the How it works page states", () => {
  const held = new Set<string>();
  const holds = (key: keyof typeof CONSTANTS, theJobs: number) => {
    held.add(key);
    expect(CONSTANTS[key], key).toBe(theJobs);
  };

  it("are the job's", () => {
    holds("strikesToExpire", STRIKES_TO_EXPIRE);
    holds("outagesToUnverify", OUTAGES_TO_UNVERIFY);
    holds("runsToStale", RUNS_TO_STALE);
    holds("horizonSlackDays", HORIZON_SLACK_DAYS);
    holds("fuzzyDateWindowDays", FUZZY_DATE_WINDOW_DAYS);
    holds("failingSourceRuns", FAILING_SOURCE_THRESHOLD);
    holds("emptyReadingGuard", EMPTY_READING_GUARD);
    holds("archiveAfterWeeks", ARCHIVE_AFTER_WEEKS);
    holds("curationBatchSize", CURATION_BATCH_SIZE);
    holds("whyLineCap", WHY_LINE_CAP);
    holds("maxPageChars", MAX_PAGE_CHARS);
    holds("maxBodyBytes", MAX_BODY_BYTES);
    holds("defaultCrawlDelayMs", DEFAULT_CRAWL_DELAY_MS);
    holds("maxCrawlDelayMs", MAX_CRAWL_DELAY_MS);
    holds("calibrationLow", CALIBRATION.low);
    holds("calibrationHigh", CALIBRATION.high);
  });

  it("are the midweek pass's window, read from the command's source (importing it would load the network adapters)", () => {
    const days = /^const REVERIFY_DAYS = (\d+);/m.exec(repoFile("src/research.ts"));
    expect(days, "REVERIFY_DAYS in src/research.ts").not.toBeNull();
    holds("reverifyDays", Number(days![1]));
  });

  it("are the site's own", () => {
    holds("minPublished", MIN_PUBLISHED);
    holds("staleAfterDays", siteConfig.staleAfterDays);
  });

  afterAll(() => {
    // A constant added to the page with no line above would be stated and never held.
    expect([...held].sort()).toEqual(Object.keys(CONSTANTS).sort());
  });
});

describe("the schedule the How it works page states", () => {
  it("is the cron lines the home machine's setup installs", () => {
    const setup = repoFile("scripts/home-run-setup.sh");
    expect(setup).toContain(`CRON_SCHEDULE="${SCHEDULE.weeklyCron}"`);
    expect(setup).toContain(`MIDWEEK_SCHEDULE="${SCHEDULE.midweekCron}"`);
    expect(setup).toContain(`DEPLOY_SCHEDULE="${SCHEDULE.deployCron}"`);
  });

  it("is the weekly run's timeout and its wait on the deploy", () => {
    expect(repoFile("scripts/weekly-run.sh")).toContain(`timeout -k 2m ${SCHEDULE.runTimeoutMinutes}m pnpm research`);
    expect(repoFile("scripts/deploy-checks.sh")).toContain(`VERCEL_WAIT_SECONDS:-${SCHEDULE.deployWaitMinutes * 60}}`);
  });
});
