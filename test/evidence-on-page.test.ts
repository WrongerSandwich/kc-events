import { describe, expect, it } from "vitest";
import { emptyDataset } from "../src/dataset.js";
import { renderReportMarkdown } from "../src/report.js";
import type { CannedPage } from "./fakes/ports.js";
import { runWith } from "./fakes/run.js";
import { candidateAt, knuckleheads, reply, week, WEEK_1 } from "./fakes/fixtures.js";

const CALENDAR_URL = knuckleheads.urls[0]!;
const candidate = (overrides: Record<string, unknown> = {}) => candidateAt(knuckleheads, overrides);
/** The calendar as a venue writes it: the show links its own page, and the venue's address has a footnote. */
const LISTING: CannedPage = {
  status: 200,
  body: `<html><body><h1>Knuckleheads</h1>
<div><a href="/shows/big-show">Big Show</a></div><div>Sat, Oct 31 · Doors 7:00 PM · Show 8:00 PM</div>
<div>Knuckleheads, 1 Main St</div><p>Ages 21+ [3]</p></body></html>`,
};
/** One run over the listing, with no quote the reply makes slipped onto the page by the fakes. */
const runAt = (completions = [reply(candidate())], page: CannedPage = LISTING, now = WEEK_1) =>
  runWith(now, emptyDataset(), { sources: [knuckleheads], pages: { [CALENDAR_URL]: page }, completions, pagesCarryQuotes: false });

/** Cite-or-drop in code (#74): a quote counts only when it is on the page the job read. */
describe("evidence on the page", () => {
  it("a candidate quoted from its page is verified", async () => {
    const { dataset, report } = await runAt();

    expect(dataset.events[0]).toMatchObject({ status: "active", evidence: { date: "Sat, Oct 31 · Doors 7:00 PM · Show 8:00 PM", venue: "Knuckleheads, 1 Main St" } });
    expect(report.counts.quoteNotOnPage).toBe(0);
  });

  it.each([
    ["date", { dateEvidence: "Saturday, October 31 at 8pm" }],
    ["venue", { venueEvidence: "Knuckleheads Saloon, 2715 Rochester" }],
  ])("a %s quote that is not on the page holds the candidate unverified, counted and reported", async (_, overrides) => {
    const { dataset, report } = await runAt([reply(candidate(overrides))]);

    expect(dataset.events[0]).toMatchObject({ status: "unverified" });
    expect(dataset.events[0]).not.toHaveProperty("lastVerified");
    expect(report.counts.quoteNotOnPage).toBe(1);
    expect(renderReportMarkdown(report)).toContain("| Unverified: a quote not on its page | 1 |");
    expect(report.sources[0]!.detail).toContain(`"Big Show" on ${CALENDAR_URL} quoted`);
  });

  it("the job's own link markers are stripped from the quotes, title, venue, and description, and the quote is verified", async () => {
    const { dataset } = await runAt([
      reply(candidate({ title: "Big Show [1]", venue: "Knuckleheads [1]", description: "A big show [1].", dateEvidence: "Big Show [1] Sat, Oct 31", eventLink: 1 })),
    ]);

    expect(dataset.events[0]).toMatchObject({
      status: "active",
      title: "Big Show",
      venue: "Knuckleheads",
      description: "A big show.",
      evidence: { date: "Big Show Sat, Oct 31" },
      eventUrl: "https://knuckleheads.test/shows/big-show",
    });
  });

  it("a time and description read from the page's schema.org event data are quoted from it and verified (#98)", async () => {
    const data = { "@type": "Event", name: "Big Show", startDate: "2026-10-31T20:00:00-05:00", url: "https://knuckleheads.test/shows/big-show", description: "A rockabilly revue." };
    const page: CannedPage = {
      status: 200,
      body: `<html><head><script type="application/ld+json">${JSON.stringify(data)}</script></head><body>
<div><a href="/shows/big-show">Big Show</a> Sat, Oct 31</div><div>Knuckleheads, 1 Main St</div></body></html>`,
    };

    const { dataset, requests } = await runAt(
      [reply(candidate({ dateEvidence: "Big Show [1] | starts 2026-10-31 20:00", description: "A rockabilly revue.", eventLink: 1 }))],
      page,
    );

    expect(requests[0]!.messages[1]!.content).toContain("Big Show [1] | starts 2026-10-31 20:00 | A rockabilly revue.");
    expect(dataset.events[0]).toMatchObject({
      status: "active",
      start: "2026-10-31T20:00:00-05:00",
      description: "A rockabilly revue.",
      evidence: { date: "Big Show | starts 2026-10-31 20:00" },
      eventUrl: "https://knuckleheads.test/shows/big-show",
    });
  });

  it("a bracketed number that is no link marker is page text, and survives", async () => {
    const { dataset } = await runAt([reply(candidate({ venueEvidence: "Knuckleheads, 1 Main St Ages 21+ [3]" }))]);

    expect(dataset.events[0]).toMatchObject({ status: "active", evidence: { venue: "Knuckleheads, 1 Main St Ages 21+ [3]" } });
  });

  it("whitespace, case, curly quotes, dashes, and an ellipsis are not differences", async () => {
    const page: CannedPage = { status: 200, body: "<html><body><p>Nov 1 –\n  Kelly’s   Westport Inn</p><p>Sun, Nov 1 … late</p></body></html>" };

    const { dataset } = await runAt([reply(candidate({ startDate: "2026-11-01", dateEvidence: "SUN, NOV 1 ... late", venue: "Kelly's Westport Inn", venueEvidence: "Nov 1 - Kelly's Westport Inn" }))], page);

    expect(dataset.events[0]).toMatchObject({ status: "active" });
  });

  it("an active event re-read with a quote not on its page is made unverified, not refreshed", async () => {
    const first = await runAt();

    const second = await runWith(week(2), first.dataset, {
      sources: [knuckleheads],
      pages: { [CALENDAR_URL]: LISTING },
      completions: [reply(candidate({ dateEvidence: "October 31st" }))],
      pagesCarryQuotes: false,
    });

    expect(second.dataset.events[0]).toMatchObject({ id: first.dataset.events[0]!.id, status: "unverified" });
    expect(second.report.counts).toMatchObject({ quoteNotOnPage: 1, unverifiedByUncitableReading: 1 });
  });
});
