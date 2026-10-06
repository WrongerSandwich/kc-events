import { describe, expect, it } from "vitest";
import { emptyDataset, type Dataset, type Event } from "../src/dataset.js";
import type { CompletionResult } from "../src/ports.js";
import type { Source } from "../src/registry.js";
import { renderReportMarkdown } from "../src/report.js";
import type { CannedPage } from "./fakes/ports.js";
import { runWith } from "./fakes/run.js";
import { candidateAt, knuckleheads, PAGE, reply, source, week, WEEK_1, weekIso } from "./fakes/fixtures.js";

// The test config's horizon is 8 weeks; from week 1 (2026-10-02) it ends 2026-11-27, from week 2 on 2026-12-04.
const CALENDAR_URL = knuckleheads.urls[0]!;
// The venue moved its calendar; an event read from the old page keeps it as its primary page, which only re-verification reads.
const moved = { ...knuckleheads, urls: ["https://knuckleheads.test/shows"] };
const elsewhere = source("Elsewhere");

const beyond = candidateAt(knuckleheads, { title: "New Year Show", startDate: "2026-12-31", dateEvidence: "Thu, Dec 31 · Show 9:00 PM" });
const inside = candidateAt(knuckleheads, { startDate: "2026-10-31" });

/** One run over Knuckleheads (moved, if given) and Elsewhere; Elsewhere's page lists nothing. */
function runAt(now: Date, dataset: Dataset, pages: Record<string, CannedPage>, completions: CompletionResult[], knuckleheadsSource: Source = knuckleheads) {
  return runWith(now, dataset, { sources: [knuckleheadsSource, elsewhere], pages: { ...pages, [elsewhere.urls[0]!]: PAGE }, completions });
}

const byTitle = (dataset: Dataset, title: string): Event => dataset.events.find((e) => e.title === title)!;
/** The fields a strike would change. */
const strikeState = ({ status, verificationFailures, consecutiveOutages, expiryReason }: Event) => ({ status, verificationFailures, consecutiveOutages, expiryReason });

/** Week 1: Knuckleheads lists both shows, read verified. */
const firstRun = () => runAt(WEEK_1, emptyDataset(), { [CALENDAR_URL]: PAGE }, [reply(beyond, inside), reply()]);

describe("events that start after the horizon", () => {
  it("are not struck when the registry lane reads their primary page and it does not list them", async () => {
    const first = await firstRun();
    const before = byTitle(first.dataset, "New Year Show");

    const second = await runAt(week(2), first.dataset, { [CALENDAR_URL]: PAGE }, [reply(), reply()]);

    expect(byTitle(second.dataset, "New Year Show")).toEqual(before);
    expect(strikeState(byTitle(second.dataset, "Big Show"))).toMatchObject({ status: "active", verificationFailures: 1 });
    expect(second.report.counts.beyondHorizonUnstruck).toBe(1);
  });

  it("are not struck when re-verification fetches their primary page and it does not list them", async () => {
    const first = await firstRun();
    const before = byTitle(first.dataset, "New Year Show");

    const second = await runAt(week(2), first.dataset, { [moved.urls[0]!]: PAGE, [CALENDAR_URL]: PAGE }, [reply(), reply(), reply()], moved);

    expect(second.calls).toContain(`fetch:${CALENDAR_URL}`);
    expect(byTitle(second.dataset, "New Year Show")).toEqual(before);
    expect(strikeState(byTitle(second.dataset, "Big Show"))).toMatchObject({ status: "active", verificationFailures: 1 });
    expect(second.report.counts.beyondHorizonUnstruck).toBe(1);
  });

  it("keep the strikes and outages they already carry", async () => {
    const first = await firstRun();
    const carrying = { ...first.dataset, events: first.dataset.events.map((e) => ({ ...e, verificationFailures: 1, consecutiveOutages: 2 })) };

    const second = await runAt(week(2), carrying, { [CALENDAR_URL]: PAGE }, [reply(), reply()]);

    expect(strikeState(byTitle(second.dataset, "New Year Show"))).toEqual({ status: "active", verificationFailures: 1, consecutiveOutages: 2, expiryReason: undefined });
    expect(strikeState(byTitle(second.dataset, "Big Show"))).toMatchObject({ status: "expired", expiryReason: "two-strike" });
  });

  it("are struck as before once the horizon reaches them", async () => {
    const first = await firstRun();
    // Week 6 (2026-11-06): the horizon ends 2027-01-01, so the New Year Show is inside it.
    const later = await runAt(week(6), first.dataset, { [CALENDAR_URL]: PAGE }, [reply(), reply()]);

    expect(strikeState(byTitle(later.dataset, "New Year Show"))).toMatchObject({ status: "active", verificationFailures: 1 });
    expect(later.report.counts.beyondHorizonUnstruck).toBe(0);
  });

  it("a run already underway, which started inside the horizon and ends after it, is struck", async () => {
    const run = candidateAt(knuckleheads, { title: "Winter Exhibit", startDate: "2026-11-01", endDate: "2027-02-01", dateEvidence: "Nov 1 – Feb 1" });
    const first = await runAt(WEEK_1, emptyDataset(), { [CALENDAR_URL]: PAGE }, [reply(run), reply()]);

    const second = await runAt(week(2), first.dataset, { [CALENDAR_URL]: PAGE }, [reply(), reply()]);

    expect(strikeState(byTitle(second.dataset, "Winter Exhibit"))).toMatchObject({ status: "active", verificationFailures: 1 });
  });

  it.each<[string, CannedPage]>([
    ["HTTP 404", { status: 404, body: "Not Found" }],
    ["a robots.txt that disallows the job", "robots-blocked"],
  ])("are struck when their primary page, read by the registry lane, is %s", async (_, page) => {
    const first = await firstRun();

    const second = await runAt(week(2), first.dataset, { [CALENDAR_URL]: page }, [reply()]);

    expect(strikeState(byTitle(second.dataset, "New Year Show"))).toMatchObject({ status: "active", verificationFailures: 1 });
    expect(second.report.counts.beyondHorizonUnstruck).toBe(0);
  });

  it("are struck when re-verification finds their primary page gone", async () => {
    const first = await firstRun();

    const second = await runAt(week(2), first.dataset, { [moved.urls[0]!]: PAGE, [CALENDAR_URL]: { status: 404, body: "Not Found" } }, [reply(), reply()], moved);

    expect(strikeState(byTitle(second.dataset, "New Year Show"))).toMatchObject({ status: "active", verificationFailures: 1 });
  });

  it("are refreshed as before when their page does list them", async () => {
    const first = await firstRun();

    const second = await runAt(week(2), first.dataset, { [moved.urls[0]!]: PAGE, [CALENDAR_URL]: PAGE }, [reply(), reply(), reply(beyond)], moved);

    expect(byTitle(second.dataset, "New Year Show")).toMatchObject({ status: "active", verificationFailures: 0, lastVerified: weekIso(2) });
    expect(second.report.counts.reverified).toBe(1);
  });
});

describe("an event expired as two-strike", () => {
  it("comes back active with no strikes when a later run sights it again", async () => {
    const first = await firstRun();
    const missing = (n: number, dataset: Dataset) => runAt(week(n), dataset, { [CALENDAR_URL]: PAGE }, [reply(), reply()]);
    const struck = await missing(3, (await missing(2, first.dataset)).dataset);
    expect(strikeState(byTitle(struck.dataset, "Big Show"))).toMatchObject({ status: "expired", expiryReason: "two-strike" });

    const back = await runAt(week(4), struck.dataset, { [CALENDAR_URL]: PAGE }, [reply(inside), reply()]);

    expect(byTitle(back.dataset, "Big Show")).toMatchObject({
      id: byTitle(first.dataset, "Big Show").id,
      status: "active",
      verificationFailures: 0,
      lastVerified: weekIso(4),
    });
    expect(byTitle(back.dataset, "Big Show").expiryReason).toBeUndefined();
  });
});

describe("the run report", () => {
  it("shows how many events were not struck because they start after the horizon", async () => {
    const first = await firstRun();

    const second = await runAt(week(2), first.dataset, { [CALENDAR_URL]: PAGE }, [reply(), reply()]);

    expect(renderReportMarkdown(second.report)).toContain("| Not struck: starts after the horizon | 1 |");
  });
});
