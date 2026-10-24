import { describe, expect, it } from "vitest";
import { parseRunReport, renderReportMarkdown, type RunReport } from "../src/report.js";

/** A report with every section holding something, so the snapshot pins each one's wording. */
const full: RunReport = {
  runDate: "2026-10-16",
  startedAt: "2026-10-16T22:15:00-05:00",
  finishedAt: "2026-10-16T22:41:07-05:00",
  horizonWeeks: 8,
  counts: {
    found: 120,
    new: 9,
    updated: 80,
    reverified: 31,
    heldUnverified: 4,
    heldThroughOutage: 3,
    heldSourceExcluded: 2,
    beyondHorizonUnstruck: 1,
    beyondListingUnstruck: 1,
    unverifiedByOutageLimit: 1,
    unverifiedByUncitableReading: 1,
    keptOnStoredCitation: 1,
    venuelessAmbiguous: 1,
    heldForPromotion: 5,
    releasedForPromotion: 2,
    outsideGeography: 6,
    skippedPromotion: 2,
    skippedNotPublic: 1,
    overCap: 1,
    unusableDates: 1,
    quoteNotOnPage: 2,
    expired: { past: 12, "two-strike": 3, cancelled: 1, "index-page": 1, duplicate: 2, promotion: 1, "not-public": 1, stale: 1 },
    archived: 7,
  },
  spend: {
    totalUsd: 5.01234,
    capUsd: 5,
    capHit: true,
    shortfall: { pagesNotExtracted: 2, eventsNotReverified: 1, queriesNotSearched: 3, leadsNotFollowed: 1, eventsNotCurated: 4, ownPagesNotRead: 0 },
    modelCalls: [{ model: "test/extraction", servedBy: { model: "test/extraction", provider: "Test", generationId: "gen-1" }, costUsd: 0.01 }, { model: "test/curation", error: "timed out" }],
  },
  discovery: {
    enabled: true,
    queries: 10,
    aggregatorPages: 1,
    pagesExtracted: 4,
    problems: ["https://lead.test/a: HTTP 403"],
    leadsOnExcludedSources: [{ source: "Old Hall", reason: "closed for good", leads: 2 }],
  },
  reverification: { problems: ["https://venue.test/calendar: the model call threw"] },
  curation: { calls: 2, judged: 14, flagged: 1, problems: ["evt_1: flagged with no why-line"] },
  sources: [
    { name: "Knuckleheads", result: "fetched", extracted: 12 },
    { name: "Pipe | Hall", result: "failed", extracted: 0, detail: "HTTP 503 | retry later\n  then gave up" },
    { name: "Blocked Place", result: "blocked", extracted: 0, detail: "robots.txt disallows the page" },
  ],
  ownPages: [
    {
      source: "Lied",
      read: 3,
      timed: 2,
      priced: 0,
      aged: 0,
      dayed: 0,
      described: 0,
      kept: 0,
      dateDisagreements: 1,
      failed: 0,
      problems: ["\"Show\": https://lied.test/event/show gives 2026-10-13, the list 2026-10-12; nothing taken"],
    },
    { source: "Picks", read: 2, timed: 0, priced: 2, aged: 1, dayed: 1, described: 1, kept: 4, dateDisagreements: 0, failed: 0, problems: [] },
  ],
  failingSources: ["Pipe | Hall"],
  offListNeighborhoods: [{ stored: "Downtown East", placed: "Crossroads", events: 2 }],
  venueNeighborhoods: [{ venue: "Bruce R. Watkins Cultural Heritage Center", placed: "Swope Park", events: 2 }],
  unmappableNeighborhoods: [
    { eventId: "evt_1", eventTitle: "Barn Dance", venue: "Red Barn", proposed: "Kearney", listedBefore: false },
    { eventId: "evt_2", eventTitle: "Pop-up", listedBefore: false },
    { eventId: "evt_3", eventTitle: "Corn Maze", venue: "Some Farm", proposed: "Louisburg", listedBefore: true },
  ],
  promotionSuggestions: [{ host: "promoter.test", runsSeen: 2, exampleUrl: "https://promoter.test/show", heldEvents: 3 }],
  heldForPromotion: [{ host: "promoter.test", events: 3 }],
  releasedForPromotion: [{ host: "newvenue.test", events: 2 }],
  outageLimited: [{ title: "Quiet Show", primaryUrl: "https://down.test/calendar" }],
  uncitableReadings: [{ title: "Wobble Night", primaryUrl: "https://venue.test/calendar" }],
  keptOnStoredCitation: [{ title: "Steady Night", primaryUrl: "https://venue.test/calendar", failedQuote: 'quoted "Fri · Buy Tickets" for its date' }],
  cancellationsFromElsewhere: [{ title: "Big Show", primaryUrl: "https://venue.test/calendar", reportedBy: "https://blog.test/news" }],
  skippedAsExpired: [{ title: "Speed Dating", primaryUrl: "https://venue.test/calendar", reason: "promotion" }],
  identityChurn: [{ title: "Big Show: Encore", primaryUrl: "https://venue.test/calendar", was: { title: "Big Show", primaryUrl: "https://venue.test/old" } }],
  likelyDuplicates: [
    {
      a: { id: "evt_000000000001", title: "GloWild", primaryUrl: "https://zoo.test/events", firstDay: "2026-10-01", end: "2026-12-27" },
      b: { id: "evt_000000000002", title: "GloWild", primaryUrl: "https://zoo.test/", firstDay: "2026-11-01", end: "2026-11-30" },
    },
    {
      a: { id: "evt_000000000003", title: "Open Studio", primaryUrl: "https://venue.test/calendar", firstDay: null, end: null },
      b: { id: "evt_000000000004", title: "Open Studio Night", primaryUrl: "https://venue.test/calendar", firstDay: null, end: null },
    },
  ],
};

describe("the run report", () => {
  it("renders every section, escaping a table cell's pipe and newline", () => {
    expect(renderReportMarkdown(full)).toMatchInlineSnapshot(`
      "# Run report 2026-10-16

      Started 2026-10-16T22:15:00-05:00, finished 2026-10-16T22:41:07-05:00. Horizon 8 weeks.

      ## Counts

      | Count | Value |
      | --- | ---: |
      | Found | 120 |
      | New | 9 |
      | Updated | 80 |
      | Re-verified | 31 |
      | Held unverified | 4 |
      | Held through an outage | 3 |
      | Held: lead source excluded | 2 |
      | Not struck: starts after the horizon | 1 |
      | Not struck: starts after the last date the page listed | 1 |
      | Unverified by outage limit | 1 |
      | Unverified by an uncitable re-reading | 1 |
      | Kept on its stored citation | 1 |
      | Not created: a venue-less sighting fitting more than one known event, none preferred | 1 |
      | Held for promotion | 5 |
      | Released for promotion | 2 |
      | Dropped: outside geography | 6 |
      | Skipped as promotion | 2 |
      | Skipped as not public | 1 |
      | Dropped: a field past its length cap | 1 |
      | Uncitable: a date or time that does not exist, or an end before the start | 1 |
      | Unverified: a quote not on its page | 2 |
      | Stored neighborhoods off the list, placed again | 2 |
      | Expired: past | 12 |
      | Expired: two-strike | 3 |
      | Expired: cancelled | 1 |
      | Expired: index-page | 1 |
      | Expired: duplicate | 2 |
      | Expired: promotion | 1 |
      | Expired: not-public | 1 |
      | Expired: stale | 1 |
      | Archived: expired more than 8 weeks back | 7 |
      | Identity churn: title or primary page changed | 1 |

      ## Spend

      5.0123 USD of a 5 USD cap. **Cap hit: no model calls were made after it.** Shortfall: 2 pages not extracted, 1 event not re-verified, 3 discovery searches not made, 1 discovery lead not followed, 4 events not curated, 0 own pages not read; they stay as they were and are checked next run.

      ## Sources

      | Source | Result | Extracted | Detail |
      | --- | --- | ---: | --- |
      | Knuckleheads | fetched | 12 |  |
      | Pipe \\| Hall | failed | 0 | HTTP 503 \\| retry later then gave up |
      | Blocked Place | blocked | 0 | robots.txt disallows the page |

      ## Own pages

      - Lied: 3 own pages read, 2 times, 0 prices, 0 age limits, 0 runs' days, 0 descriptions filled, 0 kept from an earlier read, 1 date disagreement, 0 failures
      - Lied: "Show": https://lied.test/event/show gives 2026-10-13, the list 2026-10-12; nothing taken
      - Picks: 2 own pages read, 0 times, 2 prices, 1 age limit, 1 run's days, 1 description filled, 4 kept from an earlier read, 0 date disagreements, 0 failures

      ## Discovery

      10 searches, 1 index page read for links, 4 primary pages extracted.

      - 2 leads not followed: Old Hall is excluded (closed for good)

      - https://lead.test/a: HTTP 403

      ## Re-verification

      - https://venue.test/calendar: the model call threw

      ## Curation

      14 events judged in 2 calls, 1 flagged don't-miss.

      - evt_1: flagged with no why-line

      ## Failing sources

      - Pipe | Hall

      ## Unmappable neighborhoods

      In the catch-all as the run ends: 3 events, 1 of them in an earlier report.

      - Barn Dance at Red Barn: the extractor proposed "Kearney"
      - 1 new one with no venue

      ## Stored neighborhoods off the list

      - "Downtown East": 2 events placed in Crossroads

      ## Venue neighborhoods

      - Bruce R. Watkins Cultural Heritage Center: 2 events placed in Swope Park by venueNeighborhoods

      ## Unverified by outage limit

      - Quiet Show: https://down.test/calendar

      ## Unverified by an uncitable re-reading

      - Wobble Night: https://venue.test/calendar

      ## Kept on its stored citation

      - Steady Night: https://venue.test/calendar (quoted "Fri · Buy Tickets" for its date)

      ## Cancellations from elsewhere

      - https://blog.test/news says Big Show (https://venue.test/calendar) is cancelled; the event was left as it was

      ## Skipped: expired as a promotion or not public

      - Speed Dating: https://venue.test/calendar (expired as promotion; left so)

      ## Identity churn

      - Big Show (https://venue.test/old) is now Big Show: Encore (https://venue.test/calendar)

      ## Likely duplicates

      - GloWild (evt_000000000001, 2026-10-01 to 2026-12-27, https://zoo.test/events) and GloWild (evt_000000000002, 2026-11-01 to 2026-11-30, https://zoo.test/)
      - Open Studio (evt_000000000003, recurring, https://venue.test/calendar) and Open Studio Night (evt_000000000004, recurring, https://venue.test/calendar)

      ## Held for promotion

      - promoter.test: 3 events held
      - newvenue.test: 2 events released

      ## Promotion suggestions

      - promoter.test: events found in 2 runs, 3 held events promotion would release, e.g. https://promoter.test/show
      "
    `);
  });

  it("parses through the schema as it is", () => {
    expect(parseRunReport(JSON.parse(JSON.stringify(full)))).toEqual(full);
  });

  it("fills the fields a report from before them does not carry", () => {
    const { reverification, offListNeighborhoods, venueNeighborhoods, heldForPromotion, releasedForPromotion, outageLimited, uncitableReadings, keptOnStoredCitation, cancellationsFromElsewhere, skippedAsExpired, identityChurn, likelyDuplicates, ...older } = full;
    const { archived, heldThroughOutage, quoteNotOnPage, keptOnStoredCitation: keptCount, expired, ...counts } = full.counts;
    const { stale, ...expiredBefore } = expired;
    const parsed = parseRunReport({ ...older, counts: { ...counts, expired: expiredBefore }, spend: { ...full.spend, modelCalls: undefined } });

    expect(parsed.counts).toMatchObject({ archived: 0, heldThroughOutage: 0, quoteNotOnPage: 0, keptOnStoredCitation: 0, expired: { ...expiredBefore, stale: 0 } });
    expect(parsed).toMatchObject({ reverification: { problems: [] }, offListNeighborhoods: [], venueNeighborhoods: [], identityChurn: [], likelyDuplicates: [], keptOnStoredCitation: [], skippedAsExpired: [], spend: { modelCalls: [] } });
  });

  it("refuses a key it does not name", () => {
    expect(() => parseRunReport({ ...full, renamed: 1 })).toThrow();
    expect(() => parseRunReport({ ...full, counts: { ...full.counts, fuond: 1 } })).toThrow();
  });
});
