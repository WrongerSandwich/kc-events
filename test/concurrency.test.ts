import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import { emptyDataset, type Dataset } from "../src/dataset.js";
import type { FetchPort, ModelPort, SearchResult } from "../src/ports.js";
import type { Source } from "../src/registry.js";
import { fakePorts, type CannedPage, type ScriptedReply } from "./fakes/ports.js";
import { TEST_MODELS, testConfig, testPrompts } from "./fakes/config.js";
import { candidateAt, PAGE, reply, source, WEEK_1 } from "./fakes/fixtures.js";

const settle = () => new Promise((resolve) => setImmediate(resolve));

/**
 * The fake model, its extraction calls held open a moment each, counting how many are in flight at once. The
 * scripted reply is taken when the call goes out, so the replies follow the order the calls are made in.
 */
function timed(model: ModelPort) {
  const seen = { inFlight: 0, most: 0 };
  const port: ModelPort = {
    async complete(request) {
      if (request.model !== TEST_MODELS.extraction) return model.complete(request);
      seen.inFlight++;
      seen.most = Math.max(seen.most, seen.inFlight);
      try {
        const result = await model.complete(request);
        await settle();
        await settle();
        return result;
      } finally {
        seen.inFlight--;
      }
    },
  };
  return { port, seen };
}

async function runAt(concurrency: number, { sources, pages, completions, dataset = emptyDataset(), fetcher = (f) => f, searches }: {
  sources: Source[];
  searches?: Record<string, SearchResult[]>;
  pages: Record<string, CannedPage>;
  completions: ScriptedReply[];
  dataset?: Dataset;
  /** The fake fetcher as the run gets it: slowed, say. */
  fetcher?: (fetcher: FetchPort) => FetchPort;
}) {
  const fakes = fakePorts(WEEK_1, { pages, completions, ...(searches ? { searches } : {}) });
  const { port, seen } = timed(fakes.ports.model);
  const base = testConfig({ concurrency });
  const config = searches ? { ...base, discovery: { ...base.discovery, enabled: true, aggregatorHosts: ["listings.test"] } } : base;
  const result = await run({ config, prompts: testPrompts(), dataset, registry: { sources }, ports: { ...fakes.ports, fetcher: fetcher(fakes.ports.fetcher), model: port } });
  return { ...result, seen, calls: fakes.calls };
}

/** Everything a run writes but the times it started and finished, which a real clock would move. */
const written = ({ dataset, report }: Awaited<ReturnType<typeof runAt>>) => ({ dataset, report });

const venues = ["Knuckleheads", "RecordBar", "Midland", "Truman", "Granada"].map((name) => source(name));
const calendars = Object.fromEntries(venues.map((v) => [v.urls[0]!, PAGE]));
const showsAt = venues.map((v, i) => reply(candidateAt(v, { title: `Show ${i + 1}` })));

describe("pages read several at once (#252)", () => {
  it("registry pages: their calls overlap up to the setting, and the run writes what it writes one page at a time", async () => {
    const one = await runAt(1, { sources: venues, pages: calendars, completions: showsAt });
    const several = await runAt(3, { sources: venues, pages: calendars, completions: showsAt });

    expect(one.seen.most).toBe(1);
    expect(several.seen.most).toBe(3);
    expect(written(several)).toEqual(written(one));
    expect(several.dataset.events.map((e) => [e.title, e.lead])).toEqual(venues.map((v, i) => [`Show ${i + 1}`, { lane: "registry", source: v.name }]));
  });

  it("discovery leads: an aggregator's links and the leads around it overlap, and the run writes what it writes one lead at a time", async () => {
    const query = "music events in Kansas City, October to November 2026";
    const leadAt = (host: string) => `https://${host}.test/shows/a-show`;
    const hosts = ["alpha", "bravo", "charlie", "delta", "echo"];
    const listing = "https://www.listings.test/kc/this-week";
    const lead = (url: string) => ({ url, title: "A lead", snippet: "Something on in Kansas City" });
    const pages: Record<string, CannedPage> = {
      ...Object.fromEntries(hosts.map((h) => [leadAt(h), PAGE])),
      [listing]: { status: 200, body: `<html><body><a href="${leadAt("charlie")}">C</a><a href="${leadAt("delta")}">D</a><a href="${leadAt("alpha")}">A again</a></body></html>` },
    };
    const searches = { [query]: [lead(leadAt("alpha")), lead(leadAt("bravo")), lead(listing), lead(leadAt("echo"))] };
    const completions = hosts.map((h) => reply(candidateAt(source(h, { urls: [leadAt(h)] }), { title: `${h} show`, venue: "The Truman", venueEvidence: "The Truman, 801 Westport Rd" })));
    // The replies go in the order the leads are reached: alpha, bravo, the listing's charlie and delta (alpha is not read twice), then echo.
    const one = await runAt(1, { sources: [], pages, completions, searches });
    const several = await runAt(3, { sources: [], pages, completions, searches });

    expect(one.seen.most).toBe(1);
    expect(several.seen.most).toBe(3);
    expect(written(several)).toEqual(written(one));
    expect(several.dataset.events.map((e) => e.title)).toEqual(["alpha show", "bravo show", "charlie show", "delta show", "echo show"]);
  });

  it("re-verification: pages no lane read this run overlap, and the run writes what it writes one page at a time", async () => {
    const { dataset: stored } = await runAt(1, { sources: venues, pages: calendars, completions: showsAt });
    // The sources are gone from the registry, so no lane reads their pages and each is re-verified; the third no longer lists its show.
    const later = showsAt.map((shows, i) => (i === 2 ? reply() : shows));
    const one = await runAt(1, { sources: [], pages: calendars, completions: later, dataset: stored });
    const several = await runAt(3, { sources: [], pages: calendars, completions: later, dataset: stored });

    expect(one.seen.most).toBe(1);
    expect(several.seen.most).toBe(3);
    expect(written(several)).toEqual(written(one));
    expect(several.dataset.events.map((e) => [e.title, e.verificationFailures])).toEqual(venues.map((_, i) => [`Show ${i + 1}`, i === 2 ? 1 : 0]));
  });

  it("re-verification: a page that comes back last still has its call made first, so its reply is its own", async () => {
    const { dataset: stored } = await runAt(1, { sources: venues, pages: calendars, completions: showsAt });
    const firstPage = venues[0]!.urls[0]!;
    const slowingFirst = (plain: FetchPort): FetchPort => ({
      fetch: async (url, options) => {
        if (url === firstPage) for (let n = 0; n < 20; n++) await settle();
        return plain.fetch(url, options);
      },
    });
    const later = showsAt.map((shows, i) => (i === 2 ? reply() : shows));
    const one = await runAt(1, { sources: [], pages: calendars, completions: later, dataset: stored });
    const several = await runAt(3, { sources: [], pages: calendars, completions: later, dataset: stored, fetcher: slowingFirst });

    expect(written(several)).toEqual(written(one));
  });

  it("own pages: their reads overlap, and the report's lines and problems come out as one page at a time", async () => {
    const lied = source("Lied", { neighborhood: "Lawrence", readEventPages: true });
    const slugs = ["one", "two", "three", "four", "five"];
    const ownUrl = (slug: string) => `https://lied.test/event/${slug}/`;
    const list: CannedPage = { status: 200, body: `<html><body>${slugs.map((s) => `<div><a href="/event/${s}/">Talk ${s}</a> Monday, October 12 · Lied Center</div>`).join("")}</body></html>` };
    const ownPage = (slug: string): CannedPage => ({ status: 200, body: `<html><body><h1>Talk ${slug}</h1><p>Monday • October 12, 2026 • 7:00 pm</p></body></html>` });
    const listReply = reply(
      ...slugs.map((s, i) => candidateAt(lied, { title: `Talk ${s}`, startDate: "2026-10-12", startTime: null, eventLink: i + 1, dateEvidence: "Monday, October 12", venueEvidence: "Lied Center" })),
    );
    const ownReply = (date = "2026-10-12"): ScriptedReply => ({
      value: { date, time: "19:00", timeEvidence: "Monday • October 12, 2026 • 7:00 pm", price: null, priceEvidence: null, ages: null, agesEvidence: null, days: null, daysEvidence: null, daysLink: null, description: null },
      costUsd: 0.002,
    });
    // Talk two's page is gone, so it makes no call; talk four's gives another date.
    const pages = { [lied.urls[0]!]: list, ...Object.fromEntries(slugs.map((s) => [ownUrl(s), s === "two" ? { status: 404, body: "" } : ownPage(s)])) };
    const completions = [listReply, ownReply(), ownReply(), ownReply("2026-10-13"), ownReply()];

    const one = await runAt(1, { sources: [lied], pages, completions });
    const several = await runAt(3, { sources: [lied], pages, completions });

    expect(one.seen.most).toBe(1);
    expect(several.seen.most).toBe(3);
    expect(written(several)).toEqual(written(one));
    expect(several.report.ownPages[0]).toMatchObject({ read: 4, timed: 3, failed: 1, dateDisagreements: 1 });
    expect(several.report.ownPages[0]!.problems.map((p) => p.split(":")[0])).toEqual(['"Talk two"', '"Talk four"']);
  });
});
