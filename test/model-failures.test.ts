import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import { emptyDataset, parseDataset, type Dataset } from "../src/dataset.js";
import type { SearchResult } from "../src/ports.js";
import type { Source } from "../src/registry.js";
import { renderReportMarkdown } from "../src/report.js";
import { CURATION_BATCH_SIZE } from "../src/curation.js";
import { fakePorts, type CannedPage, type ScriptedReply } from "./fakes/ports.js";
import { testConfig, testPrompts } from "./fakes/config.js";
import { candidateAt, judging, PAGE, reply, source, WEEK_1, WEEK_1_ISO, WEEK_2 } from "./fakes/fixtures.js";

const ALPHA = source("Alpha");
const BRAVO = source("Bravo");
const ALPHA_URL = ALPHA.urls[0]!;
const BRAVO_URL = BRAVO.urls[0]!;
const show = (at: Source) => candidateAt(at, { title: `${at.name} Show` });
/** What the run of 2026-10-06 died of: the connection reset partway through a model reply. */
const RESET = new TypeError("terminated");

/** The one discovery query the test config makes in each of the two weeks. */
const QUERIES = ["music events in Kansas City, October to November 2026", "music events in Kansas City, October to December 2026"];
const PROMOTER_PAGE = "https://promoter.test/shows/big-show";
const PROMOTER = source("Promoter", { urls: [PROMOTER_PAGE] });
const toPromoter: SearchResult[] = [{ url: PROMOTER_PAGE, title: "Big Show", snippet: "Big Show in Kansas City" }];

interface RunOptions {
  sources?: Source[];
  pages?: Record<string, CannedPage>;
  completions?: ScriptedReply[];
  curations?: ScriptedReply[];
  discovery?: boolean;
  spendCapUsd?: number;
}

function runAt(now: Date, dataset: Dataset, { sources = [], pages = {}, completions = [], curations = [], discovery = false, spendCapUsd = 5 }: RunOptions) {
  const fakes = fakePorts(now, { pages, completions, curations, searches: Object.fromEntries(QUERIES.map((q) => [q, toPromoter])) });
  const config = testConfig({ spendCapUsd });
  const go = () =>
    run({
      config: { ...config, discovery: { ...config.discovery, enabled: discovery } },
      prompts: testPrompts(),
      dataset,
      registry: { sources },
      ports: fakes.ports,
    });
  return { go, calls: fakes.calls };
}

async function completedRun(now: Date, dataset: Dataset, options: RunOptions) {
  const { go, calls } = runAt(now, dataset, options);
  const result = await go();
  expect(parseDataset(result.dataset)).toEqual(result.dataset);
  return { ...result, calls };
}

/** Week one: Alpha and Bravo each list their show, read and judged. */
const firstWeek = () =>
  completedRun(WEEK_1, emptyDataset(), { sources: [ALPHA, BRAVO], pages: { [ALPHA_URL]: PAGE, [BRAVO_URL]: PAGE }, completions: [reply(show(ALPHA)), reply(show(BRAVO))] });

describe("a model call that throws", () => {
  it("on a registry page leaves that page unread: the run completes, nothing on it is struck, and the source names the page and the error", async () => {
    const first = await firstWeek();

    const second = await completedRun(WEEK_2, first.dataset, {
      sources: [ALPHA, BRAVO],
      pages: { [ALPHA_URL]: PAGE, [BRAVO_URL]: PAGE },
      completions: [RESET, reply(show(BRAVO))],
    });

    const alphaShow = second.dataset.events.find((e) => e.title === "Alpha Show")!;
    expect(alphaShow).toEqual(first.dataset.events.find((e) => e.title === "Alpha Show"));
    expect(alphaShow).toMatchObject({ status: "active", lastVerified: WEEK_1_ISO, verificationFailures: 0 });
    // Unread, so re-verification does not fetch it again either.
    expect(second.calls.filter((c) => c === `fetch:${ALPHA_URL}`)).toHaveLength(1);
    expect(second.report.sources.find((s) => s.name === "Alpha")).toMatchObject({
      result: "fetched",
      extracted: 0,
      detail: `${ALPHA_URL} not extracted: the model call failed (terminated)`,
    });
    expect(second.report.spend.capHit).toBe(false);
  });

  it("on a discovery page leaves that page unread: the run completes, nothing on it is struck, and the discovery problems name the page and the error", async () => {
    const first = await completedRun(WEEK_1, emptyDataset(), {
      sources: [ALPHA],
      pages: { [ALPHA_URL]: PAGE, [PROMOTER_PAGE]: PAGE },
      completions: [reply(show(ALPHA)), reply(candidateAt(PROMOTER, { title: "Big Show", venue: "The Truman" }))],
      discovery: true,
    });

    const second = await completedRun(WEEK_2, first.dataset, {
      sources: [ALPHA],
      pages: { [ALPHA_URL]: PAGE, [PROMOTER_PAGE]: PAGE },
      completions: [reply(show(ALPHA)), RESET],
      discovery: true,
    });

    const bigShow = second.dataset.events.find((e) => e.title === "Big Show")!;
    expect(bigShow).toEqual(first.dataset.events.find((e) => e.title === "Big Show"));
    expect(second.calls.filter((c) => c === `fetch:${PROMOTER_PAGE}`)).toHaveLength(1);
    expect(second.report.discovery).toMatchObject({ pagesExtracted: 0, problems: [`${PROMOTER_PAGE} not extracted: the model call failed (terminated)`] });
  });

  it("on re-verification leaves the event as it was and records the failure in the report", async () => {
    const first = await firstWeek();

    // Bravo has left the registry, so its show is due for re-verification against its own page.
    const second = await completedRun(WEEK_2, first.dataset, {
      sources: [ALPHA],
      pages: { [ALPHA_URL]: PAGE, [BRAVO_URL]: PAGE },
      completions: [reply(show(ALPHA)), RESET],
    });

    expect(second.calls).toContain(`fetch:${BRAVO_URL}`);
    expect(second.dataset.events.find((e) => e.title === "Bravo Show")).toEqual(first.dataset.events.find((e) => e.title === "Bravo Show"));
    expect(second.report.counts).toMatchObject({ reverified: 0, expired: { "two-strike": 0 } });
    expect(second.report.reverification.problems).toEqual([`${BRAVO_URL} not re-read: the model call failed (terminated); 1 event left unchanged`]);
    expect(renderReportMarkdown(second.report)).toContain(`## Re-verification\n\n- ${BRAVO_URL} not re-read`);
  });

  it("on curation leaves that batch unjudged and says why in the curation problems", async () => {
    const { dataset, report } = await completedRun(WEEK_1, emptyDataset(), {
      sources: [ALPHA],
      pages: { [ALPHA_URL]: PAGE },
      completions: [reply(show(ALPHA))],
      curations: [RESET],
    });

    expect(dataset.events).toHaveLength(1);
    expect(dataset.events[0]).toMatchObject({ status: "active", dontMiss: false });
    expect(dataset.events[0]!.lastJudged).toBeUndefined();
    expect(report.curation).toMatchObject({ calls: 1, judged: 0, problems: ["a curation call was not read: the model call failed (terminated); 1 event(s) left unjudged"] });
  });

  it("on curation leaves later batches to be judged", async () => {
    const shows = Array.from({ length: CURATION_BATCH_SIZE + 1 }, (_, i) => candidateAt(ALPHA, { title: `Show ${i + 1}` }));
    const { dataset, report } = await completedRun(WEEK_1, emptyDataset(), {
      sources: [ALPHA],
      pages: { [ALPHA_URL]: PAGE },
      completions: [reply(...shows)],
      curations: [RESET],
    });

    expect(report.curation).toMatchObject({ calls: 2, judged: 1 });
    expect(dataset.events.filter((e) => e.lastJudged !== undefined).map((e) => e.title)).toEqual([`Show ${CURATION_BATCH_SIZE + 1}`]);
  });
});

describe("the model fuse", () => {
  it("a run in which every model call fails throws, saying no model call succeeded", async () => {
    const { go } = runAt(WEEK_1, emptyDataset(), { sources: [ALPHA, BRAVO], pages: { [ALPHA_URL]: PAGE, [BRAVO_URL]: PAGE }, completions: [RESET, RESET] });

    await expect(go()).rejects.toThrow("no model call succeeded");
  });

  it("a run whose only successful call is curation does not trip it", async () => {
    const first = await firstWeek();

    const second = await completedRun(WEEK_2, first.dataset, {
      sources: [ALPHA, BRAVO],
      pages: { [ALPHA_URL]: PAGE, [BRAVO_URL]: PAGE },
      completions: [RESET, reply(candidateAt(BRAVO, { title: "Bravo Show", startDate: "2026-11-01", dateEvidence: "Sun, Nov 1 · Show 8:00 PM" }))],
      curations: [judging(0.01)],
    });

    expect(second.report.sources.find((s) => s.name === "Alpha")!.detail).toContain("the model call failed");
  });

  it("a run that makes no model call does not trip it", async () => {
    // A page robots.txt disallows is not read, and blocked is not failed, so the run goes on with nothing to extract.
    const { go, calls } = runAt(WEEK_1, emptyDataset(), { sources: [ALPHA], pages: { [ALPHA_URL]: "robots-blocked" } });

    await expect(go()).resolves.toBeDefined();
    expect(calls.filter((c) => c.startsWith("model:"))).toEqual([]);
  });

  it("a call the spend cap refuses counts as neither a failure nor a success", async () => {
    const { go, calls } = runAt(WEEK_1, emptyDataset(), { sources: [ALPHA], pages: { [ALPHA_URL]: PAGE }, spendCapUsd: 0 });

    const { report } = await go();

    expect(calls.filter((c) => c.startsWith("model:"))).toEqual([]);
    expect(report.spend).toMatchObject({ capHit: true, shortfall: { pagesNotExtracted: 1 } });
  });
});
