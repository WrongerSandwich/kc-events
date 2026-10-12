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
const WWI = "https://www.theworldwar.org/events";

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
    // #32: one reading of the museum's calendar puts the series name in front, the other does not.
    series: pair(
      event("Pershing Lecture Series | The Wars Before the War: The Boer Wars", "National WWI Museum and Memorial", WWI, "2026-11-18T18:30:00-06:00"),
      event("The Wars Before the War: The Boer Wars", "National WWI Museum and Memorial", WWI, "2026-11-18T18:30:00-06:00", { firstSeen: RUN_TWO }),
    ),
    // #28: the calendar and the show's own page word the venue in a different order, a day apart.
    reordered: pair(
      event("127th Livestock Show", "New American Royal Campus", "https://www.americanroyal.com/calendar/", "2026-10-08", { recurrence: "limited-run", end: "2026-10-25" }),
      event("127th Livestock Show", "American Royal New Campus", "https://www.americanroyal.com/events/fall-livestock-show/", "2026-10-09", {
        recurrence: "limited-run",
        end: "2026-10-25",
        firstSeen: RUN_TWO,
      }),
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
  it("leaves one record per building and room, program, series, reordered venue name, and venue-less group, the other expired as duplicate", async () => {
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

  it("keeps the judgment of whichever record of the pair was judged later (#79)", async () => {
    const flag = { dontMiss: true, whyLine: "The festival's only Kansas City stop this year." };
    const [keptOld, flaggedLater] = hand().college;
    const [keptLater, flaggedOld] = hand().college;
    const [neverJudged] = hand().room;

    const takes = await quietRun(withEvents([keptOld, { ...flaggedLater, ...flag, lastJudged: RUN_TWO }]));
    const keeps = await quietRun(withEvents([{ ...keptLater, lastJudged: RUN_TWO }, { ...flaggedOld, ...flag }]));
    const unjudged = (({ lastJudged: _, ...e }) => e)(neverJudged);
    const fromUnjudged = await quietRun(withEvents([unjudged, { ...hand().room[1], ...flag }]));

    expect(byId(takes.dataset).get(keptOld.id)).toMatchObject({ status: "active", ...flag, lastJudged: RUN_TWO });
    expect(byId(keeps.dataset).get(keptLater.id)).toMatchObject({ status: "active", dontMiss: false, lastJudged: RUN_TWO });
    expect(byId(keeps.dataset).get(keptLater.id)).not.toHaveProperty("whyLine");
    expect(byId(fromUnjudged.dataset).get(neverJudged.id)).toMatchObject({ status: "active", ...flag, lastJudged: RUN_ONE });
  });

  it("folds nothing that does not match: two venues, a venue-less record with two candidates on other hosts, or two events in one series", async () => {
    const separate = [
      event("Poetry Reading", "Bar A", "https://bara.test/", "2026-10-14"),
      event("Poetry Reading", "Bar B", "https://barb.test/", "2026-10-14"),
      event("Nutcracker", "Muriel Kauffman Theatre", KAUFFMAN, "2026-11-28", { recurrence: "limited-run" }),
      event("Nutcracker", undefined, "https://kccrossroads.org/", "2026-11-28", { recurrence: "limited-run" }),
      event("Nutcracker", undefined, "https://www.inkansascity.com/arts/", "2026-11-28", { recurrence: "limited-run" }),
      event("Pershing Lecture Series | The Boer Wars", "National WWI Museum and Memorial", WWI, "2026-11-18T18:30:00-06:00"),
      event("Pershing Lecture Series | The Zulu War", "National WWI Museum and Memorial", WWI, "2026-11-18T18:30:00-06:00"),
    ];

    const { dataset, report } = await quietRun(withEvents(separate));

    expect(dataset.events.map((e) => e.status)).toEqual(["active", "active", "active", "unverified", "unverified", "active", "active"]);
    expect(report.counts.expired.duplicate).toBe(0);
  });

  it("folds two recurring records at one venue, the record seen first keeping the fuller schedule (#119)", async () => {
    const crossroads = "Crossroads Arts District";
    const recurring = (title: string, schedule: string, overrides: Partial<Event> = {}): Event => {
      const { start: _start, ...e } = event(title, crossroads, "https://kccrossroads.org/", "2026-11-06", { recurrence: "recurring", schedule, ...overrides });
      return { ...e, evidence: { date: schedule, venue: crossroads } };
    };
    const short = recurring("First Friday", "First Friday");
    const full = recurring("First Friday in the Crossroads", "First Friday of every month", { firstSeen: RUN_TWO, eventUrl: "https://kccrossroads.org/this-first-friday/" });

    const { dataset, report } = await quietRun(withEvents([full, short]));

    expect(byId(dataset).get(short.id)).toMatchObject({ status: "active", title: "First Friday", schedule: "First Friday of every month", firstSeen: RUN_ONE, lastChanged: WEEK_1_ISO });
    expect(byId(dataset).get(full.id)).toMatchObject({ status: "expired", expiryReason: "duplicate", duplicateOf: short.id });
    expect(report.counts.expired.duplicate).toBe(1);
  });

  it("holds the fuller schedule when the page gives the short reading again after the fold", async () => {
    const crossroads = source("Crossroads Arts District", { urls: ["https://kccrossroads.org/"], kind: "other", neighborhood: "Crossroads" });
    const recurring = (title: string, schedule: string, overrides: Partial<Event> = {}): Event => {
      const { start: _start, ...e } = event(title, crossroads.name, crossroads.urls[0]!, "2026-11-06", { recurrence: "recurring", schedule, ...overrides });
      return { ...e, evidence: { date: schedule, venue: crossroads.name } };
    };
    // The pair as the fold left it in the run before: the kept record with the fuller schedule, the other pointing at it.
    const short = recurring("First Friday", "First Friday of every month");
    const full = recurring("First Friday in the Crossroads", "First Friday of every month", { firstSeen: RUN_TWO, status: "expired", expiryReason: "duplicate", duplicateOf: short.id });
    const reading = (title: string, schedule: string) =>
      candidateAt(crossroads, { title, startDate: null, startTime: null, schedule, dateEvidence: schedule, venueEvidence: crossroads.name });

    // The page lists the short reading first, and the first verified reading of a run is the one that stands.
    const { dataset } = await runWith(WEEK_1, withEvents([short, full]), {
      sources: [crossroads],
      pages: { [crossroads.urls[0]!]: PAGE },
      completions: [reply(reading("First Friday", "First Friday"), reading("First Friday in the Crossroads", "First Friday of every month"))],
      config,
    });

    expect(dataset.events).toHaveLength(2);
    expect(byId(dataset).get(short.id)).toMatchObject({ status: "active", title: "First Friday", schedule: "First Friday of every month", evidence: { date: "First Friday of every month" } });
    expect(byId(dataset).get(full.id)).toMatchObject({ status: "expired", expiryReason: "duplicate", duplicateOf: short.id });
  });

  it("leaves a fold's schedule alone when both or neither say when", async () => {
    const tour = (primaryUrl: string, schedule: string, overrides: Partial<Event> = {}): Event => {
      const { start: _start, ...e } = event("Gallery Tour", "Bar A", primaryUrl, "2026-10-14", { recurrence: "recurring", schedule, ...overrides });
      return { ...e, evidence: { date: schedule, venue: "Bar A" } };
    };
    const kept = tour("https://bara.test/", "every Tuesday at 7pm");
    const later = tour("https://bara.test/tour", "Tuesdays, 7pm", { firstSeen: RUN_TWO });

    const { dataset } = await quietRun(withEvents([kept, later]));

    expect(byId(dataset).get(kept.id)).toMatchObject({ status: "active", schedule: "every Tuesday at 7pm" });
    expect(byId(dataset).get(later.id)).toMatchObject({ status: "expired", expiryReason: "duplicate" });
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

describe("folding a month-titled dated event into its recurring event (#63)", () => {
  const museum = source("National WWI Museum and Memorial", { kind: "other", neighborhood: "Crossroads", urls: [WWI] });
  const VENUE = "National WWI Museum and Memorial";

  /** A recurring record of this page, first seen at run two: after the dated records it folds. */
  const recurring = (title: string, primaryUrl = WWI, overrides: Partial<Event> = {}): Event => {
    const { start: _start, ...e } = event(title, VENUE, primaryUrl, "2026-10-05", {
      recurrence: "recurring",
      schedule: "Monday, Friday-Saturday, Select times",
      firstSeen: RUN_TWO,
      ...overrides,
    });
    return { ...e, evidence: { date: "Monday, Friday-Saturday Select times", venue: VENUE } };
  };
  const monthly = (title: string, primaryUrl = WWI, overrides: Partial<Event> = {}) =>
    event(title, VENUE, primaryUrl, "2026-10-05", { recurrence: "limited-run", end: "2026-10-31", ...overrides });

  it("expires the dated event as duplicate when the page sights the recurring event, and keeps the recurring record under its id", async () => {
    const dated = monthly("Main Gallery Tours (Oct. 2026)");
    const standing = recurring("Main Gallery Tours");

    const { dataset, report } = await runWith(WEEK_1, withEvents([dated, standing]), {
      sources: [museum],
      pages: { [WWI]: PAGE },
      completions: [
        reply(
          candidateAt(museum, {
            title: "Main Gallery Tours",
            startDate: null,
            startTime: null,
            schedule: "Monday, Friday-Saturday, Select times",
            dateEvidence: "Monday, Friday-Saturday Select times",
            venueEvidence: VENUE,
          }),
        ),
      ],
      config,
    });

    expect(byId(dataset).get(standing.id)).toMatchObject({ status: "active", recurrence: "recurring", title: "Main Gallery Tours" });
    expect(byId(dataset).get(dated.id)).toMatchObject({ status: "expired", expiryReason: "duplicate" });
    expect(dataset.events).toHaveLength(2);
    expect(report.counts.expired.duplicate).toBe(1);
  });

  it("never gives the recurring record a dated month's flag, however recently it was judged (#79)", async () => {
    const dated = monthly("Hands-on History (Oct. 2026)", WWI, { dontMiss: true, whyLine: "Why.", lastJudged: RUN_TWO });
    const standing = recurring("Hands-on History");

    const { dataset } = await quietRun(withEvents([dated, standing]));

    expect(byId(dataset).get(standing.id)).toMatchObject({ status: "active", dontMiss: false });
    expect(byId(dataset).get(standing.id)).not.toHaveProperty("whyLine");
  });

  it("folds a month tag of any spelling the tag allows: abbreviated or full, with or without a period or a year", async () => {
    const standing = recurring("Hands-on History");
    const tagged = ["Hands-on History (Nov. 2026)", "Hands-on History (November)", "Hands-on History (Sept 2026)", "hands-on history (dec)"].map((t) => monthly(t));

    const { dataset } = await quietRun(withEvents([standing, ...tagged]));

    expect(byId(dataset).get(standing.id)).toMatchObject({ status: "active" });
    for (const t of tagged) expect(byId(dataset).get(t.id)).toMatchObject({ title: t.title, status: "expired", expiryReason: "duplicate" });
  });

  it("folds nothing when the dated event is from another source's page, is another event on the page, has more to its title, or the recurring record has expired", async () => {
    const otherPage = [monthly("Main Gallery Tours (Oct. 2026)", source("Union Station").urls[0]), recurring("Main Gallery Tours")];
    const otherEvent = [monthly("Tower After Hours (Oct. 2026)"), recurring("Main Gallery Tours")];
    const moreTitle = [monthly("Main Gallery Tours: Behind the Scenes (Oct. 2026)"), recurring("Main Gallery Tours")];
    const notAMonth = [monthly("Main Gallery Tours (Members)"), recurring("Main Gallery Tours")];
    const expired = [monthly("Hands-on History (Oct. 2026)"), recurring("Hands-on History", WWI, { status: "expired", expiryReason: "two-strike" })];

    for (const [name, [dated, standing]] of Object.entries({ otherPage, otherEvent, moreTitle, notAMonth, expired })) {
      const { dataset, report } = await quietRun(withEvents([dated!, standing!]));
      expect({ name, status: byId(dataset).get(dated!.id)!.status }).toEqual({ name, status: "active" });
      expect({ name, duplicates: report.counts.expired.duplicate }).toEqual({ name, duplicates: 0 });
    }
  });
});

describe("one page under several URLs (#77)", () => {
  it("folds a record whose page is the same URL without www. and with a trailing slash, naming the record kept", async () => {
    const www = event("PBR OUTLAW DAYS FESTIVAL", "PBR Big Sky", "https://www.powerandlightdistrict.com/events-and-entertainment/events", "2026-10-23T16:00:00-05:00");
    const bare = event("PBR Outlaw Days Festival", undefined, "http://powerandlightdistrict.com/events-and-entertainment/events/", "2026-10-23T16:00:00-05:00", { firstSeen: RUN_TWO });

    const { dataset, report } = await quietRun(withEvents([bare, www]));

    expect(byId(dataset).get(www.id)).toMatchObject({ status: "active" });
    expect(byId(dataset).get(bare.id)).toMatchObject({ status: "expired", expiryReason: "duplicate", duplicateOf: www.id });
    expect(report.counts.expired.duplicate).toBe(1);
  });
});

describe("venue-less twins (#77)", () => {
  const kauffman = () => event("Interstellar Live", "Kauffman Center for the Performing Arts", KAUFFMAN, "2026-10-23");
  const twin = (primaryUrl: string, firstSeen: string) => event("Interstellar Live", undefined, primaryUrl, "2026-10-23", { firstSeen });

  it("fold into each other on their own host, then into the one event left", async () => {
    const listed = kauffman();
    const [first, second] = [twin(SYMPHONY, RUN_ONE), twin("https://www.kcsymphony.org/", RUN_TWO)];

    const { dataset, report } = await quietRun(withEvents([listed, first, second]));

    expect(byId(dataset).get(listed.id)).toMatchObject({ status: "active" });
    expect(byId(dataset).get(first.id)).toMatchObject({ status: "expired", expiryReason: "duplicate", duplicateOf: listed.id });
    expect(byId(dataset).get(second.id)).toMatchObject({ status: "expired", expiryReason: "duplicate", duplicateOf: first.id });
    expect(report.counts.expired.duplicate).toBe(2);
  });

  it("take a venue-less sighting from their own host rather than start another record", async () => {
    const listed = kauffman();
    const existing = twin(SYMPHONY, RUN_ONE);
    const symphony = source("Kansas City Symphony", { urls: ["https://www.kcsymphony.org/concerts/"] });

    const { dataset, report } = await runWith(WEEK_1, withEvents([listed, existing]), {
      sources: [symphony],
      pages: { [symphony.urls[0]!]: PAGE },
      completions: [reply(candidateAt(symphony, { title: "Interstellar Live", startDate: "2026-10-23", startTime: null, venue: null, venueEvidence: null }))],
      config,
    });

    expect(report.counts).toMatchObject({ new: 0, found: 1, venuelessAmbiguous: 0 });
    // The twin took the sighting, then folded into the one event left on its date.
    expect(byId(dataset).get(existing.id)).toMatchObject({ status: "expired", expiryReason: "duplicate", duplicateOf: listed.id });
    expect(dataset.events).toHaveLength(2);
  });

  it("a venue-less sighting fitting two events on other hosts creates nothing, and the report counts it", async () => {
    const bars = [event("Poetry Reading", "Bar A", "https://bara.test/", "2026-10-14"), event("Poetry Reading", "Bar B", "https://barb.test/", "2026-10-14")];
    const listings = source("Listings", { urls: ["https://listings.test/calendar"] });

    const { dataset, report } = await runWith(WEEK_1, withEvents(bars), {
      sources: [listings],
      pages: { [listings.urls[0]!]: PAGE },
      completions: [reply(candidateAt(listings, { title: "Poetry Reading", startDate: "2026-10-14", startTime: null, venue: null, venueEvidence: null }))],
      config,
    });

    expect(dataset.events.map((e) => e.id)).toEqual(bars.map((e) => e.id));
    expect(report.counts).toMatchObject({ new: 0, found: 0, venuelessAmbiguous: 1 });
    expect(renderReportMarkdown(report)).toContain("| Not created: a venue-less sighting fitting more than one known event, none preferred | 1 |");
  });
});

describe("one title listed twice on one page (#77)", () => {
  const WINECO = "https://www.kcwineco.com/events/upcoming-events";
  const wineco = source("KC Wine Co", { urls: [WINECO] });
  const pianos = (startDate: string, overrides: Record<string, unknown> = {}) =>
    candidateAt(wineco, { title: "Jazz Trio (FREE Show)", startDate, startTime: "17:30", dateEvidence: `${startDate} 5:30 PM`, ...overrides });
  const nov7 = () => event("Jazz Trio (FREE Show)", "KC Wine Co", WINECO, "2026-11-07T17:30:00-06:00");

  it("makes two records when the page lists a title on two dates outside the fuzzy window", async () => {
    const { dataset, report } = await runWith(WEEK_1, emptyDataset(), {
      sources: [wineco],
      pages: { [WINECO]: PAGE },
      completions: [reply(pianos("2026-11-07"), pianos("2026-11-27"), pianos("2026-11-08"))],
      config,
    });

    expect(dataset.events.map((e) => [e.start, e.status])).toEqual([
      ["2026-11-07T17:30:00-06:00", "active"],
      ["2026-11-27T17:30:00-06:00", "active"],
    ]);
    expect(report.counts).toMatchObject({ new: 2, found: 2, expired: { duplicate: 0 } });
  });

  it("makes the far night the second record whichever night the page gives first, keeping the known record on its own night", async () => {
    const known = nov7();

    const { dataset, report } = await runWith(WEEK_1, withEvents([known]), { sources: [wineco], pages: { [WINECO]: PAGE }, completions: [reply(pianos("2026-11-27"), pianos("2026-11-07"))], config });

    expect(dataset.events.map((e) => [e.id === known.id, e.start?.slice(0, 10), e.status])).toEqual([
      [true, "2026-11-07", "active"],
      [false, "2026-11-27", "active"],
    ]);
    expect(report.counts).toMatchObject({ new: 1, found: 2 });
  });

  it("does not make a record of a second night already past", async () => {
    const known = { ...nov7(), start: "2026-10-09T17:30:00-05:00" };

    const { dataset, report } = await runWith(WEEK_2, withEvents([known]), { sources: [wineco], pages: { [WINECO]: PAGE }, completions: [reply(pianos("2026-10-09"), pianos("2026-09-25"))], config });

    expect(dataset.events).toEqual([expect.objectContaining({ id: known.id, status: "active" })]);
    expect(report.counts).toMatchObject({ new: 0, found: 1 });
  });

  it("cancels only the record whose date is inside the window of the cancelled listing", async () => {
    const first = await runWith(WEEK_1, emptyDataset(), { sources: [wineco], pages: { [WINECO]: PAGE }, completions: [reply(pianos("2026-11-07"), pianos("2026-11-27"))], config });

    const second = await runWith(WEEK_2, first.dataset, {
      sources: [wineco],
      pages: { [WINECO]: PAGE },
      completions: [reply(pianos("2026-11-07"), pianos("2026-11-27", { notice: "cancelled" }))],
      config,
    });

    expect(second.dataset.events.map((e) => [e.start?.slice(0, 10), e.status])).toEqual([
      ["2026-11-07", "active"],
      ["2026-11-27", "expired"],
    ]);
    expect(second.report.counts.expired.cancelled).toBe(1);
  });

  it("leaves the known night alone when the page cancels another night of the same title", async () => {
    const known = nov7();

    const { dataset, report } = await runWith(WEEK_1, withEvents([known]), {
      sources: [wineco],
      pages: { [WINECO]: PAGE },
      completions: [reply(pianos("2026-11-07"), pianos("2026-11-27", { notice: "cancelled" }))],
      config,
    });

    expect(dataset.events).toEqual([expect.objectContaining({ id: known.id, status: "active", start: "2026-11-07T17:30:00-06:00" })]);
    expect(report.counts).toMatchObject({ new: 0, expired: { cancelled: 0 } });
  });

  it("still takes a page that now lists the title only on another date as a date move", async () => {
    const known = nov7();

    const { dataset, report } = await runWith(WEEK_1, withEvents([known]), { sources: [wineco], pages: { [WINECO]: PAGE }, completions: [reply(pianos("2026-11-27"))], config });

    expect(dataset.events).toEqual([expect.objectContaining({ id: known.id, status: "active", start: "2026-11-27T17:30:00-06:00" })]);
    expect(report.counts).toMatchObject({ new: 0, updated: 1 });
  });

  describe("on re-verification", () => {
    /** The known night, from a source no longer in the registry, so no registry page lists it: re-verification reads it. */
    const found = () => nov7();
    const reverifying = (dataset: Dataset, ...listed: unknown[]) =>
      runWith(WEEK_1, dataset, { sources: [knuckleheads], pages: { [knuckleheads.urls[0]!]: PAGE, [WINECO]: PAGE }, completions: [reply(), reply(...listed)], config });

    it("takes the listing on the event's own night when the page lists the title twice, and lets a far night's cancellation pass", async () => {
      const known = found();

      const { dataset, report } = await reverifying(withEvents([known]), pianos("2026-11-27", { notice: "cancelled" }), pianos("2026-11-07"));

      expect(dataset.events).toEqual([expect.objectContaining({ id: known.id, status: "active", start: "2026-11-07T17:30:00-06:00", verificationFailures: 0 })]);
      expect(report.counts).toMatchObject({ reverified: 1, expired: { cancelled: 0 } });
    });

    it("strikes the event when the page lists its title only as another night, cancelled", async () => {
      const known = found();

      const { dataset } = await reverifying(withEvents([known]), pianos("2026-11-27", { notice: "cancelled" }));

      expect(dataset.events).toEqual([expect.objectContaining({ id: known.id, status: "active", start: "2026-11-07T17:30:00-06:00", verificationFailures: 1 })]);
    });

    it("strikes a recurring event whose page lists only a cancelled month of it, as the registry lane would", async () => {
      const museum = source("National WWI Museum and Memorial", { kind: "other", neighborhood: "Crossroads", urls: [WWI] });
      const { start: _start, ...standing } = event("Main Gallery Tours", "National WWI Museum and Memorial", WWI, "2026-10-05", {
        recurrence: "recurring",
        schedule: "Monday, Friday-Saturday, Select times",
      });
      const recurring: Event = { ...standing, evidence: { date: "Monday, Friday-Saturday Select times", venue: "National WWI Museum and Memorial" } };

      const { dataset } = await runWith(WEEK_1, withEvents([recurring]), {
        sources: [knuckleheads],
        pages: { [knuckleheads.urls[0]!]: PAGE, [WWI]: PAGE },
        completions: [reply(), reply(candidateAt(museum, { title: "Main Gallery Tours (Oct. 2026)", startDate: "2026-10-09", startTime: null, endDate: "2026-10-10", endTime: null, notice: "cancelled" }))],
        config,
      });

      expect(dataset.events).toEqual([expect.objectContaining({ id: recurring.id, status: "active", recurrence: "recurring", verificationFailures: 1 })]);
    });
  });
});

describe("a sighting of a record folded as a duplicate (#77)", () => {
  const kept = () => event("Interstellar Live", "Kauffman Center for the Performing Arts", KAUFFMAN, "2026-10-23");
  const folded = (into: Event | undefined) =>
    event("Interstellar Live", "Helzberg Hall", SYMPHONY, "2026-10-23", {
      firstSeen: RUN_TWO,
      status: "expired",
      expiryReason: "duplicate",
      ...(into ? { duplicateOf: into.id } : {}),
    });
  const symphony = source("Kansas City Symphony", { urls: [SYMPHONY] });
  // A venue no alias joins to the Kauffman Center: only the duplicate's page and title match this sighting.
  const listing = () => candidateAt(symphony, { title: "Interstellar Live", startDate: "2026-10-23", startTime: null, venue: "Symphony Hall", venueEvidence: "Symphony Hall" });

  it("goes to the record it was folded into, which takes the reading; the duplicate stays folded", async () => {
    const [into, duplicate] = [kept(), folded(undefined)];
    const pointed = { ...duplicate, duplicateOf: into.id };

    const { dataset, report } = await runWith(WEEK_1, withEvents([into, pointed]), { sources: [symphony], pages: { [SYMPHONY]: PAGE }, completions: [reply(listing())], config });

    expect(dataset.events).toHaveLength(2);
    expect(byId(dataset).get(into.id)).toMatchObject({ status: "active", primaryUrl: SYMPHONY, venue: "Symphony Hall" });
    expect(byId(dataset).get(pointed.id)).toMatchObject({ status: "expired", expiryReason: "duplicate", duplicateOf: into.id });
    expect(report.counts).toMatchObject({ new: 0, found: 1, updated: 1 });
  });

  it("starts a record when the duplicate was folded before the pointer was kept, as before", async () => {
    const [into, legacy] = [kept(), folded(undefined)];

    const { dataset, report } = await runWith(WEEK_1, withEvents([into, legacy]), { sources: [symphony], pages: { [SYMPHONY]: PAGE }, completions: [reply(listing())], config });

    expect(dataset.events).toHaveLength(3);
    expect(report.counts).toMatchObject({ new: 1 });
  });
});

describe("a dated sighting that is one month of a recurring event (#77)", () => {
  const museum = source("National WWI Museum and Memorial", { kind: "other", neighborhood: "Crossroads", urls: [WWI] });
  const VENUE = "National WWI Museum and Memorial";
  const standing = (overrides: Partial<Event> = {}): Event => {
    const { start: _start, ...e } = event("Main Gallery Tours", VENUE, WWI, "2026-10-05", {
      recurrence: "recurring",
      schedule: "Monday, Friday-Saturday, Select times",
      verificationFailures: 1,
      ...overrides,
    });
    return { ...e, evidence: { date: "Monday, Friday-Saturday Select times", venue: VENUE } };
  };
  const month = (overrides: Record<string, unknown> = {}) =>
    candidateAt(museum, { title: "Main Gallery Tours (Oct. 2026)", startDate: "2026-10-09", startTime: null, endDate: "2026-10-10", endTime: null, dateEvidence: "Oct 9-10", venueEvidence: VENUE, ...overrides });

  it("confirms the recurring event, clearing its strike, without a record of the month or a new reading", async () => {
    const recurring = standing();

    const { dataset, report } = await runWith(WEEK_1, withEvents([recurring]), { sources: [museum], pages: { [WWI]: PAGE }, completions: [reply(month())], config });

    expect(dataset.events).toEqual([expect.objectContaining({ id: recurring.id, status: "active", recurrence: "recurring", title: "Main Gallery Tours", schedule: recurring.schedule, verificationFailures: 0 })]);
    expect(report.counts).toMatchObject({ new: 0, found: 1, updated: 0, expired: { duplicate: 0 } });
  });

  it("cannot cancel the recurring event: a cancelled month is no listing of the standing event, so the page strikes it", async () => {
    const recurring = standing({ verificationFailures: 0 });

    const { dataset, report } = await runWith(WEEK_1, withEvents([recurring]), { sources: [museum], pages: { [WWI]: PAGE }, completions: [reply(month({ notice: "cancelled" }))], config });

    expect(dataset.events).toEqual([expect.objectContaining({ id: recurring.id, status: "active", recurrence: "recurring", verificationFailures: 1 })]);
    expect(report.counts).toMatchObject({ new: 0, found: 0, expired: { cancelled: 0 } });
    expect(report.cancellationsFromElsewhere).toEqual([]);
  });

  it("confirms the recurring event on re-verification too, keeping it recurring", async () => {
    const recurring = standing();

    const { dataset, report } = await runWith(WEEK_1, withEvents([recurring]), {
      sources: [knuckleheads],
      pages: { [knuckleheads.urls[0]!]: PAGE, [WWI]: PAGE },
      completions: [reply(), reply(month())],
      config,
    });

    expect(dataset.events).toEqual([expect.objectContaining({ id: recurring.id, status: "active", recurrence: "recurring", schedule: recurring.schedule, verificationFailures: 0 })]);
    expect(report.counts).toMatchObject({ new: 0, reverified: 0, expired: { "two-strike": 0 } });
  });
});

describe("the same own page on one date (#66)", () => {
  const MIDLAND = "https://www.midlandkc.com/events";
  const detail = (n: number) => `https://www.midlandkc.com/events/detail/${n}`;
  const show = (title: string, start: string, eventUrl: string, overrides: Partial<Event> = {}) => event(title, "The Midland Theatre", MIDLAND, start, { eventUrl, ...overrides });

  it("folds two records titled otherwise, keeping the one seen first, whatever their venues", async () => {
    const act = show("Kenny G", "2026-11-19T20:00:00-06:00", detail(1525431), { firstSeen: RUN_TWO });
    const evening = show("An Evening With Kenny G", "2026-11-19T20:00:00-06:00", detail(1525431));
    const presenter = event("Mystic Nature", "Marble & Canvas", "https://kcai.edu/calendar/", "2026-10-29", { eventUrl: "https://kcai.edu/calendar/mystic-nature" });
    const institute = event("Marble & Canvas presents Mystic Nature", "Kansas City Art Institute", "https://kcai.edu/calendar/", "2026-10-29", { eventUrl: "https://kcai.edu/calendar/mystic-nature/", firstSeen: RUN_TWO });

    const { dataset, report } = await quietRun(withEvents([act, evening, institute, presenter]));

    const after = byId(dataset);
    expect(after.get(evening.id)).toMatchObject({ status: "active", title: "An Evening With Kenny G" });
    expect(after.get(act.id)).toMatchObject({ status: "expired", expiryReason: "duplicate", duplicateOf: evening.id });
    expect(after.get(presenter.id)).toMatchObject({ status: "active" });
    expect(after.get(institute.id)).toMatchObject({ status: "expired", expiryReason: "duplicate", duplicateOf: presenter.id });
    expect(report.counts.expired.duplicate).toBe(2);
  });

  it("folds nothing on another date or at another time: a series page's two nights, a matinee and an evening show", async () => {
    const separate = [
      show("Goose", "2026-11-03T20:00:00-06:00", detail(1465853)),
      show("An Evening with Goose", "2026-11-04T20:00:00-06:00", detail(1465853)),
      show("The Devils", "2026-10-16T14:00:00-05:00", detail(7)),
      show("Ken Russell's The Devils", "2026-10-16T19:00:00-05:00", detail(7)),
    ];

    const { dataset, report } = await quietRun(withEvents(separate));

    expect(dataset.events.map((e) => e.status)).toEqual(["active", "active", "active", "active"]);
    expect(report.counts.expired.duplicate).toBe(0);
  });
});

describe("the same end date of a limited run (#68)", () => {
  // The 2026-10-12 dataset's "Sport and Spectator" cluster: evt_e135e4bd220b, evt_1fc163367760, evt_2695c2b8d33a.
  const NERMAN = "Nerman Museum of Contemporary Art";
  const exhibition = (primaryUrl: string, start: string | undefined, overrides: Partial<Event> = {}): Event => {
    const record = event("Sport and Spectator", NERMAN, primaryUrl, start ?? "", { recurrence: "limited-run", end: "2026-12-06", kind: "arts", ...overrides });
    if (start !== undefined) return record;
    const { start: _start, ...noStart } = record;
    return { ...noStart, evidence: { venue: NERMAN } };
  };

  it("folds the three records of one exhibition, whatever their starts, into the one seen first", async () => {
    const opening = exhibition("https://www.nermanmuseum.org/exhibitions/", "2026-06-12");
    const listed = exhibition("https://artsjoco.org/acjc/calendar-of-events/", "2026-09-25", { firstSeen: RUN_TWO });
    const homepage = exhibition("https://www.nermanmuseum.org/", undefined, { firstSeen: "2026-10-10T12:46:13-05:00" });

    const { dataset, report } = await quietRun(withEvents([listed, homepage, opening]));

    const after = byId(dataset);
    expect(after.get(opening.id)).toMatchObject({ status: "active", start: "2026-06-12" });
    expect(after.get(listed.id)).toMatchObject({ status: "expired", expiryReason: "duplicate", duplicateOf: opening.id });
    expect(after.get(homepage.id)).toMatchObject({ status: "expired", expiryReason: "duplicate", duplicateOf: opening.id });
    expect(report.counts.expired.duplicate).toBe(2);
  });

  it("takes a sighting listing the exhibition from the day a calendar listed it as the known record, not a second run", async () => {
    const opening = exhibition("https://www.nermanmuseum.org/exhibitions/", "2026-06-12");
    const ARTSJOCO = "https://artsjoco.org/acjc/calendar-of-events/";
    const artsjoco = source("Arts JoCo", { urls: [ARTSJOCO], kind: "arts" });
    const listing = candidateAt(artsjoco, { title: "Sport and Spectator", startDate: "2026-09-25", startTime: null, endDate: "2026-12-06", venue: NERMAN, venueEvidence: NERMAN });

    const { dataset, report } = await runWith(WEEK_1, withEvents([opening]), { sources: [artsjoco], pages: { [ARTSJOCO]: PAGE }, completions: [reply(listing)], config });

    expect(dataset.events).toHaveLength(1);
    expect(byId(dataset).get(opening.id)).toMatchObject({ status: "active", end: "2026-12-06" });
    expect(report.counts).toMatchObject({ new: 0, found: 1 });
  });

  it("reads a page listing the exhibition twice, at its opening and from another day, as one run, not a second night", async () => {
    const opening = exhibition("https://www.nermanmuseum.org/exhibitions/", "2026-06-12");
    const ARTSJOCO = "https://artsjoco.org/acjc/calendar-of-events/";
    const artsjoco = source("Arts JoCo", { urls: [ARTSJOCO], kind: "arts" });
    const listing = (startDate: string) => candidateAt(artsjoco, { title: "Sport and Spectator", startDate, startTime: null, endDate: "2026-12-06", venue: NERMAN, venueEvidence: NERMAN });

    const { dataset, report } = await runWith(WEEK_1, withEvents([opening]), { sources: [artsjoco], pages: { [ARTSJOCO]: PAGE }, completions: [reply(listing("2026-06-12"), listing("2026-09-25"))], config });

    expect(dataset.events).toHaveLength(1);
    expect(report.counts).toMatchObject({ new: 0, found: 1 });
  });

  it("lets a cancellation reach the exhibition from a page giving another start", async () => {
    const opening = exhibition("https://www.nermanmuseum.org/exhibitions/", "2026-06-12");
    const ARTSJOCO = "https://artsjoco.org/acjc/calendar-of-events/";
    const artsjoco = source("Arts JoCo", { urls: [ARTSJOCO], kind: "arts" });
    const cancelled = candidateAt(artsjoco, { title: "Sport and Spectator", startDate: "2026-09-25", startTime: null, endDate: "2026-12-06", venue: NERMAN, venueEvidence: NERMAN, notice: "cancelled" });

    const { dataset } = await runWith(WEEK_1, withEvents([opening]), { sources: [artsjoco], pages: { [ARTSJOCO]: PAGE }, completions: [reply(cancelled)], config });

    expect(dataset.events).toHaveLength(1);
    expect(byId(dataset).get(opening.id)).toMatchObject({ status: "expired", expiryReason: "cancelled" });
  });
});

describe("a same-end sighting keeps the stored start (#120)", () => {
  const NERMAN = "Nerman Museum of Contemporary Art";
  const MUSEUM = "https://www.nermanmuseum.org/exhibitions/";
  const ARTSJOCO = "https://artsjoco.org/acjc/calendar-of-events/";
  const museum = source("Nerman Museum", { urls: [MUSEUM], kind: "arts" });
  const artsjoco = source("Arts JoCo", { urls: [ARTSJOCO], kind: "arts" });
  const OPENING_QUOTE = "June 12 – December 6, 2026";
  const exhibition = (primaryUrl: string, start: string | undefined, overrides: Partial<Event> = {}): Event => {
    const record = event("Sport and Spectator", NERMAN, primaryUrl, start ?? "", { recurrence: "limited-run", end: "2026-12-06", kind: "arts", ...overrides });
    if (start !== undefined) return record;
    const { start: _start, ...noStart } = record;
    return { ...noStart, evidence: { date: "Through December 6", venue: NERMAN } };
  };
  const listing = (at: typeof museum, startDate: string, dateEvidence: string, overrides: Record<string, unknown> = {}) =>
    candidateAt(at, { title: "Sport and Spectator", startDate, startTime: null, endDate: "2026-12-06", venue: NERMAN, venueEvidence: NERMAN, dateEvidence, ...overrides });
  const opening = () => exhibition(MUSEUM, "2026-06-12", { evidence: { date: OPENING_QUOTE, venue: NERMAN } });

  it.each([
    ["the museum's page first", [museum, artsjoco]],
    ["the calendar first", [artsjoco, museum]],
  ] as const)("keeps the opening and the museum's quote when a calendar lists the exhibition from the day it listed it, %s", async (_order, sources) => {
    const stored = opening();
    const readings: Record<string, unknown> = { [MUSEUM]: listing(museum, "2026-06-12", OPENING_QUOTE), [ARTSJOCO]: listing(artsjoco, "2026-09-25", "Sep 25 – Dec 6") };
    const { dataset } = await runWith(WEEK_1, withEvents([stored]), {
      sources: [...sources],
      pages: { [MUSEUM]: PAGE, [ARTSJOCO]: PAGE },
      completions: sources.map((s) => reply(readings[s.urls[0]!])),
      config,
    });

    expect(dataset.events).toHaveLength(1);
    expect(byId(dataset).get(stored.id)).toMatchObject({ status: "active", start: "2026-06-12", primaryUrl: MUSEUM, evidence: { date: OPENING_QUOTE } });
  });

  it("keeps the opening, and the page that cites it, when only the calendar lists the exhibition this run", async () => {
    const stored = opening();

    const { dataset, report } = await runWith(WEEK_1, withEvents([stored]), {
      sources: [artsjoco],
      pages: { [ARTSJOCO]: PAGE },
      completions: [reply(listing(artsjoco, "2026-09-25", "Sep 25 – Dec 6", { description: "Athletes on canvas." }))],
      config,
    });

    expect(byId(dataset).get(stored.id)).toMatchObject({
      status: "active",
      start: "2026-06-12",
      end: "2026-12-06",
      primaryUrl: MUSEUM,
      evidence: { date: OPENING_QUOTE, venue: NERMAN },
      description: "Athletes on canvas.",
      lastVerified: WEEK_1_ISO,
    });
    expect(report.counts).toMatchObject({ new: 0, found: 1, updated: 1 });
  });

  it("still moves the start on a sighting from the record's own page under the same title", async () => {
    const stored = opening();

    const { dataset } = await runWith(WEEK_1, withEvents([stored]), {
      sources: [museum],
      pages: { [MUSEUM]: PAGE },
      completions: [reply(listing(museum, "2026-07-10", "July 10 – December 6, 2026"))],
      config,
    });

    expect(byId(dataset).get(stored.id)).toMatchObject({ start: "2026-07-10", evidence: { date: "July 10 – December 6, 2026" } });
  });

  it("fills a stored run's missing start from a same-end sighting", async () => {
    const stored = exhibition("https://www.nermanmuseum.org/", undefined);

    const { dataset } = await runWith(WEEK_1, withEvents([stored]), {
      sources: [artsjoco],
      pages: { [ARTSJOCO]: PAGE },
      completions: [reply(listing(artsjoco, "2026-09-25", "Sep 25 – Dec 6"))],
      config,
    });

    expect(byId(dataset).get(stored.id)).toMatchObject({ start: "2026-09-25", primaryUrl: ARTSJOCO, evidence: { date: "Sep 25 – Dec 6" } });
  });
});
