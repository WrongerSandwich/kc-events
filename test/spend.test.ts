import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import { emptyDataset, parseDataset, type Dataset } from "../src/dataset.js";
import { renderReportMarkdown } from "../src/report.js";
import type { CompletionResult } from "../src/ports.js";
import type { Source } from "../src/registry.js";
import { fakePorts, type CannedPage } from "./fakes/ports.js";
import { testConfig, testPrompts } from "./fakes/config.js";
import { candidateAt, costing, PAGE, source, WEEK_1, WEEK_1_ISO, WEEK_2 } from "./fakes/fixtures.js";

const ALPHA = source("Alpha");
const BRAVO = source("Bravo");
const CHARLIE = source("Charlie");
const pagesOf = (...sources: Source[]): Record<string, CannedPage> => Object.fromEntries(sources.map((s) => [s.urls[0], PAGE]));
const show = (at: Source) => candidateAt(at, { title: `${at.name} Show` });

async function runAt(
  now: Date,
  dataset: Dataset,
  { sources, pages, completions, spendCapUsd }: { sources: Source[]; pages: Record<string, CannedPage>; completions: CompletionResult[]; spendCapUsd: number },
) {
  const fakes = fakePorts(now, { pages, completions });
  const result = await run({
    config: testConfig({ spendCapUsd }),
    prompts: testPrompts(),
    dataset,
    registry: { sources },
    ports: fakes.ports,
  });
  expect(parseDataset(result.dataset)).toEqual(result.dataset);
  return { ...result, calls: fakes.calls };
}

describe("spend cap", () => {
  it("stops model calls once the cap is reached and reports the spend, the cap, and the shortfall", async () => {
    const { calls, report, dataset } = await runAt(WEEK_1, emptyDataset(), {
      sources: [ALPHA, BRAVO, CHARLIE],
      pages: pagesOf(ALPHA, BRAVO, CHARLIE),
      completions: [costing(0.03, show(ALPHA)), costing(0.03, show(BRAVO)), costing(0.03, show(CHARLIE))],
      spendCapUsd: 0.05,
    });

    expect(calls.filter((c) => c.startsWith("model:"))).toHaveLength(2);
    expect(dataset.events.map((e) => e.title)).toEqual(["Alpha Show", "Bravo Show"]);
    expect(report.spend).toEqual({
      totalUsd: 0.06,
      capUsd: 0.05,
      capHit: true,
      shortfall: { pagesNotExtracted: 1, eventsNotReverified: 0, queriesNotSearched: 0, leadsNotFollowed: 0, eventsNotCurated: 2 },
    });
    expect(report.sources.find((s) => s.name === "Charlie")).toMatchObject({
      result: "fetched",
      extracted: 0,
      detail: expect.stringContaining("spend cap"),
    });
  });

  it("a known event on a page the cap left unread is neither re-verified nor struck", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), {
      sources: [ALPHA, BRAVO],
      pages: pagesOf(ALPHA, BRAVO),
      completions: [costing(0.01, show(ALPHA)), costing(0.01, show(BRAVO))],
      spendCapUsd: 5,
    });

    const second = await runAt(WEEK_2, first.dataset, {
      sources: [ALPHA, BRAVO],
      pages: pagesOf(ALPHA, BRAVO),
      completions: [costing(0.05, show(ALPHA)), costing(0.01, show(BRAVO))],
      spendCapUsd: 0.05,
    });

    const bravo = second.dataset.events.find((e) => e.title === "Bravo Show")!;
    expect(bravo).toMatchObject({ status: "active", lastVerified: WEEK_1_ISO, verificationFailures: 0 });
    expect(second.calls.filter((c) => c.startsWith("model:"))).toHaveLength(1);
    expect(second.report.spend).toMatchObject({ capHit: true, shortfall: { pagesNotExtracted: 1, eventsNotReverified: 0 } });
  });

  it("an event due for re-verification after the cap is hit is not fetched, not struck, and counted in the shortfall", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), {
      sources: [ALPHA, BRAVO],
      pages: pagesOf(ALPHA, BRAVO),
      completions: [costing(0.01, show(ALPHA)), costing(0.01, show(BRAVO))],
      spendCapUsd: 5,
    });

    // Bravo has left the registry, so its show is due for re-verification against its own page.
    const second = await runAt(WEEK_2, first.dataset, {
      sources: [ALPHA],
      pages: pagesOf(ALPHA, BRAVO),
      completions: [costing(0.05, show(ALPHA))],
      spendCapUsd: 0.05,
    });

    expect(second.calls).not.toContain(`fetch:${BRAVO.urls[0]}`);
    const bravo = second.dataset.events.find((e) => e.title === "Bravo Show")!;
    expect(bravo).toMatchObject({ status: "active", verificationFailures: 0, lastVerified: WEEK_1_ISO });
    expect(second.report.counts.reverified).toBe(0);
    expect(second.report.spend).toMatchObject({ capHit: true, shortfall: { pagesNotExtracted: 0, eventsNotReverified: 1 } });
  });

  it("a run under the cap reports its spend and that the cap was not hit", async () => {
    const { report } = await runAt(WEEK_1, emptyDataset(), {
      sources: [ALPHA, BRAVO],
      pages: pagesOf(ALPHA, BRAVO),
      completions: [costing(0.02, show(ALPHA)), costing(0.015, show(BRAVO))],
      spendCapUsd: 5,
    });

    expect(report.spend).toEqual({
      totalUsd: 0.035,
      capUsd: 5,
      capHit: false,
      shortfall: { pagesNotExtracted: 0, eventsNotReverified: 0, queriesNotSearched: 0, leadsNotFollowed: 0, eventsNotCurated: 0 },
    });
  });

  it("a last call that crosses the cap with nothing left to do is not a cap hit", async () => {
    // A recurring event is never curated, so after this one page nothing remains for the cap to cut.
    const trivia = candidateAt(ALPHA, { title: "Trivia", startDate: null, startTime: null, schedule: "every Tuesday", dateEvidence: "Trivia every Tuesday" });
    const { report } = await runAt(WEEK_1, emptyDataset(), {
      sources: [ALPHA],
      pages: pagesOf(ALPHA),
      completions: [costing(0.06, trivia)],
      spendCapUsd: 0.05,
    });

    expect(report.spend).toEqual({
      totalUsd: 0.06,
      capUsd: 0.05,
      capHit: false,
      shortfall: { pagesNotExtracted: 0, eventsNotReverified: 0, queriesNotSearched: 0, leadsNotFollowed: 0, eventsNotCurated: 0 },
    });
  });

  it("a one-off the cap leaves unjudged is a cap hit, counted as not curated", async () => {
    const { report } = await runAt(WEEK_1, emptyDataset(), {
      sources: [ALPHA],
      pages: pagesOf(ALPHA),
      completions: [costing(0.06, show(ALPHA))],
      spendCapUsd: 0.05,
    });

    expect(report.spend).toMatchObject({ capHit: true, shortfall: { eventsNotCurated: 1 } });
    expect(renderReportMarkdown(report)).toContain("1 event not curated");
  });

  it("the Markdown report shows spend against the cap whether or not the cap was hit", async () => {
    const under = await runAt(WEEK_1, emptyDataset(), {
      sources: [ALPHA],
      pages: pagesOf(ALPHA),
      completions: [costing(0.0123, show(ALPHA))],
      spendCapUsd: 5,
    });
    const over = await runAt(WEEK_1, emptyDataset(), {
      sources: [ALPHA, BRAVO],
      pages: pagesOf(ALPHA, BRAVO),
      completions: [costing(0.06, show(ALPHA))],
      spendCapUsd: 0.05,
    });

    const underMd = renderReportMarkdown(under.report);
    expect(underMd).toContain("0.0123 USD of a 5 USD cap.");
    expect(underMd).not.toContain("Cap hit");

    const overMd = renderReportMarkdown(over.report);
    expect(overMd).toContain("0.0600 USD of a 0.05 USD cap.");
    expect(overMd).toContain("Cap hit");
    expect(overMd).toContain("1 page not extracted");
  });
});
