import { describe, expect, it } from "vitest";
import { emptyDataset, type Dataset, type Event } from "../src/dataset.js";
import { renderReportMarkdown } from "../src/report.js";
import { testConfig } from "./fakes/config.js";
import { runWith } from "./fakes/run.js";
import { candidateAt, knuckleheads, PAGE, reply, source, WEEK_1, WEEK_1_ISO, WEEK_2 } from "./fakes/fixtures.js";

// The two runs of the 2026-10-03 hand run that created the duplicates the committed dataset holds.
const RUN_ONE = "2026-10-01T16:05:31-05:00";
const RUN_TWO = "2026-10-01T21:47:36-05:00";

/** The run config's seed alias list, as #16 gave it. */
const config = testConfig({
  venueAliases: {
    "Kauffman Center for the Performing Arts": ["Muriel Kauffman Theatre", "Helzberg Hall"],
    "Nelson-Atkins Museum of Art": ["Atkins Auditorium", "Tivoli Cinema"],
    "Kansas City Convention Center": ["Bartle Hall", "Bartle Exhibit Hall"],
    "Midwest Trust Center": ["Yardley Hall", "Midwest Trust Center at Johnson County Community College"],
    "Kansas City Power & Light District": ["Kansas City Power & Light", "PBR Big Sky"],
  },
});

let nextId = 0;
/** An active event read from this page, judged and verified at run one unless overridden. */
function event(title: string, venue: string | undefined, primaryUrl: string, start: string, overrides: Partial<Event> = {}): Event {
  const verified = venue !== undefined;
  return {
    id: `evt_${String(++nextId).padStart(12, "0")}`,
    title,
    start,
    ...(verified ? { venue } : {}),
    neighborhood: "Westport",
    primaryUrl,
    kind: "music",
    recurrence: "one-off",
    dontMiss: false,
    firstSeen: RUN_ONE,
    ...(verified ? { lastVerified: RUN_ONE } : {}),
    lastChanged: RUN_ONE,
    lastJudged: RUN_ONE,
    status: verified ? "active" : "unverified",
    verificationFailures: 0,
    consecutiveOutages: 0,
    lead: { lane: "registry", source: "Somewhere" },
    evidence: { date: start, ...(verified ? { venue } : {}) },
    ...overrides,
  };
}

const KAUFFMAN = "https://www.kauffmancenter.org/events/";
const SYMPHONY = "https://www.kcsymphony.org/upcoming-events/";

const pair = (kept: Event, duplicate: Event): [Event, Event] => [kept, duplicate];

/** One record per duplicate group the #16 triage found, shaped like the committed ones. */
function hand() {
  return {
    room: pair(
      event("Wizard of Oz", "Muriel Kauffman Theatre", KAUFFMAN, "2026-10-16", { recurrence: "limited-run" }),
      event("Wizard of Oz", "Kauffman Center for the Performing Arts", "https://kcballet.org/", "2026-10-16", { recurrence: "limited-run" }),
    ),
    college: pair(
      event("Billy Joel Legacy", "Midwest Trust Center at Johnson County Community College", "https://artsjoco.org/acjc/calendar-of-events/", "2026-10-11T19:00:00-05:00"),
      event("Billy Joel Legacy", "Yardley Hall", "https://www.jccc.edu/midwest-trust-center/events/", "2026-10-11T19:00:00-05:00", { firstSeen: RUN_TWO }),
    ),
    hall: pair(
      event("Boozy Book Fest 2026", "Kansas City Convention Center", "https://kcconvention.com/events/", "2026-10-03T16:00:00-05:00"),
      event("Boozy Book Fest 2026", "Bartle Exhibit Hall (A – E)", "https://kcconvention.com/event/boozy-book-fest-2026/", "2026-10-03T16:00:00-05:00"),
    ),
    district: pair(
      event("PBR Outlaw Days Festival", "Kansas City Power & Light", "https://www.powerandlightdistrict.com/events", "2026-10-23T16:00:00-05:00"),
      event("PBR Outlaw Days Festival", "PBR Big Sky", "https://powerandlightdistrict.com/events", "2026-10-23T16:00:00-05:00"),
    ),
    program: pair(
      event("Loving Vincent", "Tivoli Cinema", "https://www.nelson-atkins.org/events/", "2026-10-16T19:00:00-05:00"),
      event("Loving Vincent", "Atkins Auditorium", "https://www.nelson-atkins.org/events/tivoli/", "2026-10-16T19:00:00-05:00"),
    ),
    sameRoom: pair(
      event("Interstellar Live", "Helzberg Hall", KAUFFMAN, "2026-10-23"),
      event("Interstellar Live", "Helzberg Hall", SYMPHONY, "2026-10-23"),
    ),
    venueless: pair(
      event("Baroque at 7:00: Vivaldi's Four Seasons", "Helzberg Hall", KAUFFMAN, "2026-10-14T19:00:00-05:00"),
      event("Baroque at 7:00: Vivaldi's Four Seasons", undefined, SYMPHONY, "2026-10-14"),
    ),
  } satisfies Record<string, [Event, Event]>;
}

/** A run whose only registry page lists nothing; every other page is down, so re-verification holds what it checks. */
const quietRun = (dataset: Dataset, now = WEEK_1) =>
  runWith(now, dataset, { sources: [knuckleheads], pages: { [knuckleheads.urls[0]!]: PAGE }, completions: [reply()], config });

const withEvents = (events: Event[]): Dataset => ({ ...emptyDataset(), events });
const byId = (dataset: Dataset) => new Map(dataset.events.map((e) => [e.id, e]));

describe("folding duplicates", () => {
  it("leaves one record per building and room, program, and venue-less group, the other expired as duplicate", async () => {
    const groups = hand();
    const { dataset, report } = await quietRun(withEvents(Object.values(groups).flat()));

    const after = byId(dataset);
    for (const [name, [kept, duplicate]] of Object.entries(groups)) {
      expect({ name, status: after.get(kept.id)!.status }).toEqual({ name, status: "active" });
      expect({ name, ...after.get(duplicate.id)! }).toMatchObject({ name, status: "expired", expiryReason: "duplicate" });
    }
    expect(report.counts.expired.duplicate).toBe(Object.keys(groups).length);
    expect(renderReportMarkdown(report)).toContain(`| Expired: duplicate | ${Object.keys(groups).length} |`);
  });

  it("keeps the record seen first whatever order the dataset holds them in", async () => {
    const { college } = hand();
    const { dataset } = await quietRun(withEvents([...college].reverse()));

    expect(byId(dataset).get(college[0].id)).toMatchObject({ status: "active" });
    expect(byId(dataset).get(college[1].id)).toMatchObject({ status: "expired", expiryReason: "duplicate" });
  });

  it("gives a kept record that is not active the active duplicate's reading, keeping its own id, first-seen, and lead", async () => {
    const hidden = event("Music of Studio Ghibli", undefined, SYMPHONY, "2026-11-14", { lead: { lane: "registry", source: "Kansas City Symphony" } });
    const verified = event("Music of Studio Ghibli", "Helzberg Hall", KAUFFMAN, "2026-11-14T20:00:00-06:00", { firstSeen: RUN_TWO, lastVerified: RUN_TWO });

    const { dataset } = await quietRun(withEvents([verified, hidden]));

    // Its status and venue changed, so curation judges it again this run.
    expect(byId(dataset).get(hidden.id)).toMatchObject({
      id: hidden.id,
      firstSeen: RUN_ONE,
      lead: hidden.lead,
      lastChanged: WEEK_1_ISO,
      lastJudged: WEEK_1_ISO,
      status: "active",
      venue: "Helzberg Hall",
      primaryUrl: KAUFFMAN,
      start: "2026-11-14T20:00:00-06:00",
      lastVerified: RUN_TWO,
      evidence: verified.evidence,
    });
    expect(byId(dataset).get(verified.id)).toMatchObject({ status: "expired", expiryReason: "duplicate" });
  });

  it("folds nothing that does not match: two venues, or a venue-less record with two candidates", async () => {
    const separate = [
      event("Open Mic", "Bar A", "https://bara.test/", "2026-10-14"),
      event("Open Mic", "Bar B", "https://barb.test/", "2026-10-14"),
      event("Nutcracker", "Muriel Kauffman Theatre", KAUFFMAN, "2026-11-28", { recurrence: "limited-run" }),
      event("Nutcracker", undefined, "https://kcballet.org/", "2026-11-28", { recurrence: "limited-run" }),
      event("Nutcracker", undefined, "https://kcballet.org/performances/", "2026-11-28", { recurrence: "limited-run" }),
    ];

    const { dataset, report } = await quietRun(withEvents(separate));

    expect(dataset.events.map((e) => e.status)).toEqual(["active", "active", "active", "unverified", "unverified"]);
    expect(report.counts.expired.duplicate).toBe(0);
  });

  it("never folds a recurring event", async () => {
    const recurring = (primaryUrl: string): Event => {
      const { start: _start, ...e } = event("Trivia Night", "Bar A", primaryUrl, "2026-10-14", { recurrence: "recurring", schedule: "every Tuesday at 7pm" });
      return { ...e, evidence: { date: "Tuesdays, 7pm", venue: "Bar A" } };
    };

    const { dataset } = await quietRun(withEvents([recurring("https://bara.test/"), recurring("https://bara.test/trivia")]));

    expect(dataset.events.map((e) => e.status)).toEqual(["active", "active"]);
  });

  it("does not revive a duplicate when its page lists the event again; the record it was folded into takes the sighting", async () => {
    const { room } = hand();
    const [kept, duplicate] = room;
    const first = await quietRun(withEvents(room));
    const ballet = source("Kansas City Ballet", { urls: [duplicate.primaryUrl] });

    const second = await runWith(WEEK_2, first.dataset, {
      sources: [ballet],
      pages: { [duplicate.primaryUrl]: PAGE },
      completions: [reply(candidateAt(ballet, { title: "Wizard of Oz", startDate: "2026-10-16", startTime: null, venue: "Kauffman Center for the Performing Arts" }))],
      config,
    });

    expect(second.dataset.events).toHaveLength(2);
    expect(byId(second.dataset).get(duplicate.id)).toMatchObject({ status: "expired", expiryReason: "duplicate" });
    expect(byId(second.dataset).get(kept.id)).toMatchObject({ status: "active", primaryUrl: duplicate.primaryUrl });
    expect(second.report.counts).toMatchObject({ new: 0, found: 1 });
  });

  it("does not hide an active event when another page lists it with no venue", async () => {
    const listed = event("Interstellar Live", "Helzberg Hall", KAUFFMAN, "2026-10-23");
    const symphony = source("Kansas City Symphony", { urls: [SYMPHONY] });

    const { dataset, report } = await runWith(WEEK_1, withEvents([listed]), {
      sources: [symphony],
      pages: { [SYMPHONY]: PAGE },
      completions: [reply(candidateAt(symphony, { title: "Interstellar Live", startDate: "2026-10-23", startTime: null, venue: null, venueEvidence: null }))],
      config,
    });

    expect(dataset.events).toEqual([expect.objectContaining({ id: listed.id, status: "active", primaryUrl: KAUFFMAN })]);
    expect(report.counts.unverifiedByUncitableReading).toBe(0);
  });

  it("does not cancel an active event when another page lists it as cancelled with no venue", async () => {
    const listed = event("Interstellar Live", "Helzberg Hall", KAUFFMAN, "2026-10-23");
    const symphony = source("Kansas City Symphony", { urls: [SYMPHONY] });

    const { dataset, report } = await runWith(WEEK_1, withEvents([listed]), {
      sources: [symphony],
      pages: { [SYMPHONY]: PAGE },
      completions: [reply(candidateAt(symphony, { title: "Interstellar Live", startDate: "2026-10-23", startTime: null, venue: null, venueEvidence: null, notice: "cancelled" }))],
      config,
    });

    expect(dataset.events).toEqual([expect.objectContaining({ id: listed.id, status: "active" })]);
    expect(report.counts.expired.cancelled).toBe(0);
  });
});
