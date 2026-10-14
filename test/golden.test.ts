import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import { emptyDataset, parseDataset, type Dataset } from "../src/dataset.js";
import { EVENTS_TO_JUDGE } from "../src/curation.js";
import { discoveryQueries } from "../src/discovery.js";
import { parseRunReport, renderReportMarkdown, type RunReport } from "../src/report.js";
import { toLocalDate } from "../src/time.js";
import type { CompletionResult, ModelPort, SearchResult } from "../src/ports.js";
import { fakePorts, type CannedPage } from "./fakes/ports.js";
import { TEST_MODELS, testConfig, testPrompts } from "./fakes/config.js";
import { candidateAt, PAGE, reply, source, WEEK_1, WEEK_2, WEEK_3 } from "./fakes/fixtures.js";

/**
 * Three weekly runs end to end (#100), each pinned as the dataset and the Markdown report it writes, so any
 * change to what `run` produces shows up as a reviewed snapshot diff. Three registry sources: Knuckleheads
 * lists a show that drops off its page while a later one stays (struck in week 2, expired two-strike in
 * week 3); Recordbar's calendar redirects to its events page; the Midland's page is down in week 2 and back
 * in week 3. Discovery finds a promoter's page in week 1 (held for promotion; `promoter` is not in the
 * registry, only what candidateAt cites), and curation flags one show, whose own page is read for its price
 * and age limit in week 1 and kept from that read after (#133).
 */
const knuckleheads = source("Knuckleheads", { neighborhood: "East Bottoms" });
const recordbar = source("Recordbar", { neighborhood: "Crossroads" });
const midland = source("Midland", { neighborhood: "Crossroads" });
const promoter = source("Promoter", { urls: ["https://promoter.test/shows/promoter-night"], neighborhood: "Westport" });

const RECORDBAR_EVENTS = "https://recordbar.test/events";
const PROMOTER_PAGE = promoter.urls[0]!;

const bigShow = candidateAt(knuckleheads, { title: "Big Show", startDate: "2026-10-31", eventLink: 1 });
/** Knuckleheads' calendar, linking Big Show's own page as link 1. */
const KNUCKLEHEADS_PAGE = { status: 200, body: '<html><body>calendar <a href="/events/big-show">Big Show</a></body></html>' };
const BIG_SHOW_PAGE_URL = "https://knuckleheads.test/events/big-show";
const BIG_SHOW_PAGE = { status: 200, body: "<html><body><h1>Big Show</h1><p>Sat, Oct 31 · Show 8:00 PM</p><p>Tickets $30 advance</p><p>21+ only</p></body></html>" };
/** What Big Show's own page gives: its price and age limit, quoted. */
const bigShowPage: CompletionResult = {
  value: {
    date: "2026-10-31",
    time: "20:00",
    timeEvidence: "Sat, Oct 31 · Show 8:00 PM",
    price: "$30 advance",
    priceEvidence: "Tickets $30 advance",
    ages: "21+",
    agesEvidence: "21+ only",
    description: null,
  },
  costUsd: 0.002,
};
const closer = candidateAt(knuckleheads, { title: "Season Closer", startDate: "2026-11-28", dateEvidence: "Sat, Nov 28 · 8:00 PM" });
const goneShow = candidateAt(knuckleheads, { title: "Gone Show", startDate: "2026-11-07", dateEvidence: "Sat, Nov 7 · 8:00 PM" });
const lateSet = candidateAt(recordbar, { title: "Late Set", startDate: "2026-10-24", startTime: "22:00", dateEvidence: "Sat Oct 24, 10pm" });
const arenaNight = candidateAt(midland, { title: "Arena Night", startDate: "2026-11-14", dateEvidence: "November 14, 2026 at 8 PM" });
const promoterNight = candidateAt(promoter, { title: "Promoter Night", startDate: "2026-11-01", venue: "The Truman", venueEvidence: "The Truman, 801 Westport Rd" });

const config = (() => {
  const base = testConfig();
  return { ...base, discovery: { ...base.discovery, enabled: true } };
})();
const registry = { sources: [knuckleheads, recordbar, midland] };

/** The one query a run makes on that date; the horizon's months move with it. */
const queryAt = (now: Date) => {
  const [query] = discoveryQueries(config, toLocalDate(now, config.timezone));
  return query!;
};

/** The model, with curation flagging Big Show by title, since its id is the run's to make. */
function flaggingBigShow(model: ModelPort): ModelPort {
  return {
    async complete(request) {
      if (request.model !== TEST_MODELS.curation) return model.complete(request);
      const listed = JSON.parse(request.messages.at(-1)!.content.split(`${EVENTS_TO_JUDGE}\n\n`)[1]!) as { id: string; title: string }[];
      const judgments = listed.map(({ id, title }) =>
        title === "Big Show" ? { id, dontMiss: true, why: "A rare club date from a band that plays arenas." } : { id, dontMiss: false, why: "" },
      );
      return { value: { judgments }, costUsd: 0.002 } satisfies CompletionResult;
    },
  };
}

async function weekly(now: Date, dataset: Dataset, { pages, completions, searches = {} }: { pages: Record<string, CannedPage>; completions: CompletionResult[]; searches?: Record<string, SearchResult[]> }) {
  const fakes = fakePorts(now, { pages, completions, searches });
  const ports = { ...fakes.ports, model: flaggingBigShow(fakes.ports.model) };
  const result = await run({ config, prompts: testPrompts(), dataset, registry, ports });
  expect(parseDataset(result.dataset, config)).toEqual(result.dataset);
  expect(parseRunReport(JSON.parse(JSON.stringify(result.report)))).toEqual(result.report);
  return result;
}

async function pin(week: number, { dataset, report }: { dataset: Dataset; report: RunReport }) {
  await expect(`${JSON.stringify(dataset, null, 2)}\n`).toMatchFileSnapshot(`__snapshots__/golden/week-${week}.json`);
  await expect(renderReportMarkdown(report)).toMatchFileSnapshot(`__snapshots__/golden/week-${week}.md`);
}

describe("golden three-week scenario", () => {
  it("pins each week's dataset and report", async () => {
    const calendars = (midlandPage: CannedPage): Record<string, CannedPage> => ({
      [knuckleheads.urls[0]!]: KNUCKLEHEADS_PAGE,
      [BIG_SHOW_PAGE_URL]: BIG_SHOW_PAGE,
      [recordbar.urls[0]!]: { ...PAGE, finalUrl: RECORDBAR_EVENTS },
      [midland.urls[0]!]: midlandPage,
      [PROMOTER_PAGE]: PAGE,
    });

    const week1 = await weekly(WEEK_1, emptyDataset(), {
      pages: calendars(PAGE),
      searches: { [queryAt(WEEK_1)]: [{ url: PROMOTER_PAGE, title: "Promoter Night", snippet: "Live at The Truman" }] },
      completions: [reply(bigShow, goneShow, closer), reply(lateSet), reply(arenaNight), reply(promoterNight), bigShowPage],
    });
    await pin(1, week1);

    const week2 = await weekly(WEEK_2, week1.dataset, {
      pages: calendars(new Error("connect ECONNREFUSED")),
      completions: [reply(bigShow, closer), reply(lateSet)],
    });
    await pin(2, week2);

    const week3 = await weekly(WEEK_3, week2.dataset, {
      pages: calendars(PAGE),
      completions: [reply(bigShow, closer), reply(lateSet), reply(arenaNight)],
    });
    await pin(3, week3);

    // The story the snapshots tell, said once in the open so a snapshot update that breaks it fails here too.
    const story = (d: Dataset) => Object.fromEntries(d.events.map((e) => [e.title, `${e.status}${e.expiryReason ? ` ${e.expiryReason}` : ""}, strikes ${e.verificationFailures}, outages ${e.consecutiveOutages}`]));
    expect(story(week2.dataset)).toMatchObject({ "Gone Show": "active, strikes 1, outages 0", "Arena Night": "active, strikes 0, outages 1" });
    expect(story(week3.dataset)).toEqual({
      "Big Show": "active, strikes 0, outages 0",
      "Gone Show": "expired two-strike, strikes 2, outages 0",
      "Season Closer": "active, strikes 0, outages 0",
      "Late Set": "active, strikes 0, outages 0",
      "Arena Night": "active, strikes 0, outages 0",
      "Promoter Night": "unverified, strikes 0, outages 0",
    });
    expect(week3.dataset.events.find((e) => e.title === "Late Set")?.primaryUrl).toBe(RECORDBAR_EVENTS);
    expect(week3.dataset.events.filter((e) => e.dontMiss).map((e) => e.title)).toEqual(["Big Show"]);
    expect(week3.dataset.events.find((e) => e.title === "Big Show")).toMatchObject({ price: "$30 advance", ages: "21+", ownPageRead: { on: "2026-10-02" } });
    expect(week3.dataset.events.find((e) => e.title === "Promoter Night")).toMatchObject({ heldForPromotion: true, lead: { lane: "discovery" } });
  });
});
