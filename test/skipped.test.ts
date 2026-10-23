import { describe, expect, it } from "vitest";
import { emptyDataset, type Event } from "../src/dataset.js";
import { renderReportMarkdown } from "../src/report.js";
import { runWith } from "./fakes/run.js";
import { candidateAt, knuckleheads, PAGE, reply, WEEK_1, WEEK_1_ISO, WEEK_2 } from "./fakes/fixtures.js";

const CALENDAR_URL = knuckleheads.urls[0]!;
const candidate = (overrides: Record<string, unknown> = {}) => candidateAt(knuckleheads, overrides);
const runAt = (...candidates: unknown[]) =>
  runWith(WEEK_1, emptyDataset(), { sources: [knuckleheads], pages: { [CALENDAR_URL]: PAGE }, completions: [reply(...candidates)] });

/** Promotions and non-public events are skipped in code after extraction, before storage (#81). */
describe("skipped candidates", () => {
  it.each(["Happy Hour at Pizza Bar", "Happy Hour Specials", "Trivia Night: Tolkien Edition", "Country Music Bingo (Free to Play)", "Speed dating {30-45}", "Ghouls Pop-Up Bar", "Cafecítón: A Latin Brunch Club"])(
    "%s is skipped as a promotion, counted and reported",
    async (title) => {
      const { dataset, report } = await runAt(candidate({ title }), candidate());

      expect(dataset.events.map((e) => e.title)).toEqual(["Big Show"]);
      expect(report.counts.skippedPromotion).toBe(1);
      expect(renderReportMarkdown(report)).toContain("| Skipped as promotion | 1 |");
    },
  );

  it.each([
    ["Kansas City Fire Department Cadet Graduation 2026", "Kansas City Convention Center"],
    ["UMKC School of Medicine 55th Anniversary Gala", "Kansas City Convention Center"],
    ["KC Area Development Council Annual Meeting 2026", "Kansas City Convention Center"],
    ["Greater Kansas City Chamber of Commerce 2026 Annual Dinner", "Kansas City Convention Center"],
    ["Bishop Miege Class of 2001 – 25 Year Reunion", "Warehouse on Broadway"],
    ["Memorial for Steven B. Whitacre 1941 — 2026", "Leedy-Voulkos Art Center"],
    ["KC Parks Board Meeting", "Parks and Recreation Department headquarters"],
    ["Educator Professional Development: Equality and WWI", "National WWI Museum and Memorial"],
    ["Add More Arts to Your Classroom", "Online"],
    ["Author Talk", "Virtual"],
    ["Book Club", "Online via Zoom"],
    ["Panel Discussion", "Livestream"],
  ])("%s at %s is skipped as not public, counted and reported", async (title, venue) => {
    const { dataset, report } = await runAt(candidate({ title, venue }), candidate());

    expect(dataset.events.map((e) => e.title)).toEqual(["Big Show"]);
    expect(report.counts.skippedNotPublic).toBe(1);
    expect(renderReportMarkdown(report)).toContain("| Skipped as not public | 1 |");
  });

  it.each([
    "Happy Hour: Beethoven, Brahms, and the Romantic Spirit",
    "DAMP - One Night Reunion",
    "Boyz II Men: The Reunion Tour",
    "Trivium",
    "Opening Night Gala with Joshua Bell",
    "Board Game Day",
    "Drag Bingo with Bianca Del Rio",
    "Galactic",
    "Memorial Day Parade",
    "Lecture at the National WWI Museum and Memorial",
  ])("%s is a show or a public event, not skipped", async (title) => {
    const { dataset, report } = await runAt(candidate({ title }));

    expect(dataset.events.map((e) => e.title)).toEqual([title]);
    expect(report.counts.skippedPromotion + report.counts.skippedNotPublic).toBe(0);
  });

  it("a game at another place on a team's schedule is outside the geography, not held unverified", async () => {
    const { dataset, report } = await runAt(
      candidate({ title: "Volleyball at South Dakota", kind: "sports", venue: null, venueEvidence: null }),
      candidate({ title: "Men's Soccer vs Tulsa", kind: "sports" }),
      candidate({ title: "Comedy at the Ship", kind: "comedy" }),
      candidate({ title: "Monster Jam at T-Mobile Center", kind: "sports", venue: "T-Mobile Center" }),
    );

    expect(dataset.events.map((e) => e.title)).toEqual(["Men's Soccer vs Tulsa", "Comedy at the Ship", "Monster Jam at T-Mobile Center"]);
    expect(report.counts.outsideGeography).toBe(1);
  });
});

let nextId = 0;
/** An event stored by an earlier run from the calendar, active unless overridden. */
function stored(title: string, overrides: Partial<Event> = {}): Event {
  return {
    id: `evt_${String(++nextId).padStart(12, "0")}`,
    title,
    start: "2026-10-31T20:00:00-05:00",
    venue: "Knuckleheads",
    neighborhood: "East Bottoms",
    primaryUrl: CALENDAR_URL,
    kind: "music",
    recurrence: "one-off",
    dontMiss: false,
    firstSeen: WEEK_1_ISO,
    lastVerified: WEEK_1_ISO,
    lastChanged: WEEK_1_ISO,
    lastJudged: WEEK_1_ISO,
    status: "active",
    verificationFailures: 0,
    consecutiveOutages: 0,
    lead: { lane: "registry", source: knuckleheads.name },
    evidence: { date: "Sat, Oct 31", venue: "Knuckleheads" },
    ...overrides,
  };
}

const runOver = (events: Event[], ...candidates: unknown[]) =>
  runWith(WEEK_2, { ...emptyDataset(), events }, { sources: [knuckleheads], pages: { [CALENDAR_URL]: PAGE }, completions: [reply(...candidates)] });

/** What earlier runs stored before the rule (#81) is expired by it, under its own reason. */
describe("stored promotions and non-public events", () => {
  it("are expired as promotion or not-public, counted, while an event already expired keeps its reason", async () => {
    const events = [
      stored("Big Show"),
      stored("Speed Dating"),
      stored("KC Parks Board Meeting", { status: "unverified", lastVerified: undefined }),
      stored("Add More Arts to Your Classroom", { venue: "Online" }),
      stored("Harry Potter Trivia", { status: "expired", expiryReason: "two-strike" }),
    ];

    const { dataset, report } = await runOver(events, candidate());

    expect(dataset.events.map((e) => [e.title, e.status, e.expiryReason])).toEqual([
      ["Big Show", "active", undefined],
      ["Speed Dating", "expired", "promotion"],
      ["KC Parks Board Meeting", "expired", "not-public"],
      ["Add More Arts to Your Classroom", "expired", "not-public"],
      ["Harry Potter Trivia", "expired", "two-strike"],
    ]);
    expect(report.counts.expired).toMatchObject({ promotion: 1, "not-public": 2, "two-strike": 0 });
    const markdown = renderReportMarkdown(report);
    expect(markdown).toContain("| Expired: promotion | 1 |");
    expect(markdown).toContain("| Expired: not-public | 2 |");
  });

  it.each([
    ["promotion", "skippedPromotion", "Skipped as promotion"],
    ["not-public", "skippedNotPublic", "Skipped as not public"],
  ] as const)("one expired as %s is not revived by a page listing it again, and the sighting is counted and named (#216)", async (reason, count, row) => {
    const expired = stored("soft clubbing with DJ hunni bunni", { status: "expired", expiryReason: reason });

    const { dataset, report } = await runOver([expired], candidate({ title: "soft clubbing with DJ hunni bunni" }), candidate({ title: "Big Show" }));

    expect(dataset.events.map((e) => [e.title, e.status, e.expiryReason])).toEqual([
      ["soft clubbing with DJ hunni bunni", "expired", reason],
      ["Big Show", "active", undefined],
    ]);
    expect(dataset.events[0]).toEqual(expired);
    expect(report.counts[count]).toBe(1);
    expect(report.counts).toMatchObject({ new: 1, found: 1 });
    expect(report.skippedAsExpired).toEqual([{ title: expired.title, primaryUrl: CALENDAR_URL, reason }]);
    const markdown = renderReportMarkdown(report);
    expect(markdown).toContain(`| ${row} | 1 |`);
    expect(markdown).toContain(`- soft clubbing with DJ hunni bunni: ${CALENDAR_URL} (expired as ${reason}; left so)`);
  });

  it("one expired as promotion stays so when a page lists it on another night, which starts no record (#216)", async () => {
    const expired = stored("soft clubbing", { status: "expired", expiryReason: "promotion" });

    const { dataset, report } = await runOver(
      [expired],
      candidate({ title: "soft clubbing" }),
      candidate({ title: "soft clubbing", startDate: "2026-11-21", dateEvidence: "Sat, Nov 21" }),
    );

    expect(dataset.events).toEqual([expired]);
    expect(report.counts.skippedPromotion).toBe(2);
    expect(report.skippedAsExpired).toHaveLength(1);
  });

  it.each(["past", "two-strike", "stale", "cancelled"] as const)("one expired as %s is revived by a page listing it again under its old id", async (reason) => {
    const expired = stored("Big Show", { status: "expired", expiryReason: reason });

    const { dataset, report } = await runOver([expired], candidate());

    expect(dataset.events).toEqual([expect.objectContaining({ id: expired.id, status: "active" })]);
    expect(dataset.events[0]?.expiryReason).toBeUndefined();
    expect(report.skippedAsExpired).toEqual([]);
    expect(report.counts.skippedPromotion + report.counts.skippedNotPublic).toBe(0);
  });

  it("a page read as listing only skipped candidates was read: the events it leaves out are struck, not held as through an outage", async () => {
    const events = [stored("Mutts & Merlot"), stored("Boozy Book Exchange"), stored("Wine Walk")];

    const { dataset, report } = await runOver(events, candidate({ title: "Dueling Pianos" }), candidate({ title: "Speed Dating" }));

    expect(dataset.events.map((e) => e.verificationFailures)).toEqual([1, 1, 1]);
    expect(report.counts.heldThroughOutage).toBe(0);
  });
});
