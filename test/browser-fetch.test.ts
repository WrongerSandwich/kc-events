import { describe, expect, it } from "vitest";
import { emptyDataset } from "../src/dataset.js";
import { runWith } from "./fakes/run.js";
import { candidateAt, knuckleheads, PAGE, reply, source, WEEK_1, week } from "./fakes/fixtures.js";

// A calendar rendered by script: the registry has the browser fetch it.
const rendered = { ...knuckleheads, fetch: "browser" as const };
const CALENDAR_URL = knuckleheads.urls[0]!;
const plain = source("Elsewhere");
const candidate = () => candidateAt(knuckleheads, { startDate: "2026-11-21", dateEvidence: "Sat, Nov 21 · Show 8:00 PM" });

describe("browser fetch", () => {
  it("fetches a source that opts in through the browser and every other source plainly, and reads both alike", async () => {
    const result = await runWith(WEEK_1, emptyDataset(), {
      sources: [rendered, plain],
      pages: { [CALENDAR_URL]: PAGE, [plain.urls[0]!]: PAGE },
      completions: [reply(candidate()), reply()],
    });

    expect(result.calls.filter((c) => !c.startsWith("model:"))).toEqual([`browser:${CALENDAR_URL}`, `fetch:${plain.urls[0]}`]);
    expect(result.dataset.events).toMatchObject([{ title: "Big Show", status: "active", primaryUrl: CALENDAR_URL }]);
  });

  it("passes the source's selector to wait for", async () => {
    const result = await runWith(WEEK_1, emptyDataset(), {
      sources: [{ ...rendered, waitFor: ".event-card" }],
      pages: { [CALENDAR_URL]: PAGE },
      completions: [reply()],
    });

    expect(result.calls).toContain(`browser:${CALENDAR_URL} waiting for .event-card`);
  });

  it("counts a browser fetch that fails as an outage like any other", async () => {
    const first = await runWith(WEEK_1, emptyDataset(), {
      sources: [rendered, plain],
      pages: { [CALENDAR_URL]: PAGE, [plain.urls[0]!]: PAGE },
      completions: [reply(candidate()), reply()],
    });

    const second = await runWith(week(2), first.dataset, {
      sources: [rendered, plain],
      pages: { [CALENDAR_URL]: new Error("Timeout 15000ms exceeded"), [plain.urls[0]!]: PAGE },
      completions: [reply()],
    });

    expect(second.dataset.events).toEqual([{ ...first.dataset.events[0], consecutiveOutages: 1 }]);
    expect(second.report.sources.find((s) => s.name === knuckleheads.name)).toMatchObject({ result: "failed" });
  });

  it("re-verifies an event from a browser source through the browser when its page is no longer the source's", async () => {
    const first = await runWith(WEEK_1, emptyDataset(), {
      sources: [rendered, plain],
      pages: { [CALENDAR_URL]: PAGE, [plain.urls[0]!]: PAGE },
      completions: [reply(candidate()), reply()],
    });
    const moved = { ...rendered, urls: ["https://knuckleheads.test/shows"] };

    const second = await runWith(week(2), first.dataset, {
      sources: [moved, plain],
      pages: { [moved.urls[0]!]: PAGE, [plain.urls[0]!]: PAGE, [CALENDAR_URL]: PAGE },
      completions: [reply(), reply(), reply(candidate())],
    });

    expect(second.calls).toContain(`browser:${CALENDAR_URL}`);
    expect(second.calls).not.toContain(`fetch:${CALENDAR_URL}`);
    expect(second.report.counts.reverified).toBe(1);
  });
});
