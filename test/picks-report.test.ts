import { describe, expect, it } from "vitest";
import { closeCallsInHorizon, countBy, pickMoves, picksInHorizon, type PickLine } from "../src/picks-report.js";
import { storedEvent as stored, WEEK_1_ISO, WEEK_2_ISO } from "./fakes/fixtures.js";

const TODAY = "2026-11-08";
const HORIZON_WEEKS = 8; // through 2027-01-03

const pick = (title: string, overrides = {}) => stored(title, { dontMiss: true, pickReason: "rare", whyLine: `${title} is rare.`, ...overrides });
const close = (title: string, overrides = {}) => stored(title, { closeCall: true, closeNote: `${title} is nearly.`, ...overrides });

describe("the picks in the horizon", () => {
  it("lists active picks soonest first, leaving out one past, one after the horizon, and one not active", () => {
    const soon = pick("Soon", { start: "2026-11-10T20:00:00-06:00" });
    const later = pick("Later", { start: "2026-12-20" });
    const past = pick("Past", { start: "2026-11-01" });
    const beyond = pick("Beyond", { start: "2027-01-04" });
    const hidden = pick("Hidden", { start: "2026-11-12", status: "unverified" });
    const notPick = stored("Not a pick", { start: "2026-11-09" });

    const lines = picksInHorizon([later, soon, past, beyond, hidden, notPick], TODAY, HORIZON_WEEKS, []);

    expect(lines.map((l) => l.title)).toEqual(["Soon", "Later"]);
    expect(lines[0]).toEqual({
      id: soon.id,
      title: "Soon",
      venue: "Knuckleheads",
      kind: "music",
      start: "2026-11-10T20:00:00-06:00",
      primaryUrl: soon.primaryUrl,
      reason: "rare",
      whyLine: "Soon is rare.",
      marks: ["new"],
    });
  });

  it("a run that started before today and has not ended is in; its end comes along", () => {
    const underway = pick("Underway", { recurrence: "limited-run", start: "2026-10-14", end: "2026-11-30" });
    const lines = picksInHorizon([underway], TODAY, HORIZON_WEEKS, []);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ start: "2026-10-14", end: "2026-11-30" });
  });

  it("marks a pick new when the previous record was not a pick, and hand when an entry governs it", () => {
    const kept = pick("Kept", { start: "2026-11-10" });
    const fresh = pick("Fresh", { start: "2026-11-11" });
    const hand = pick("Hand", { start: "2026-11-12", pickedBy: "hand", modelJudgment: { dontMiss: false } });
    const wasClose = close("Kept", { id: kept.id, start: "2026-11-10" });

    const lines = picksInHorizon([kept, fresh, hand], TODAY, HORIZON_WEEKS, [{ ...kept }, { ...wasClose, id: "evt_other" }]);

    expect(lines.map((l) => [l.title, l.marks])).toEqual([
      ["Kept", []],
      ["Fresh", ["new"]],
      ["Hand", ["new", "hand"]],
    ]);
  });
});

describe("the close calls in the horizon", () => {
  it("lists active close calls soonest first with their notes, leaving out one past and one after the horizon", () => {
    const a = close("A", { start: "2026-11-20" });
    const b = close("B", { start: "2026-11-09" });
    const past = close("Past", { start: "2026-11-01" });
    const beyond = close("Beyond", { start: "2027-02-01" });

    const lines = closeCallsInHorizon([a, b, past, beyond], TODAY, HORIZON_WEEKS);

    expect(lines.map((l) => l.title)).toEqual(["B", "A"]);
    expect(lines[0]).toMatchObject({ closeNote: "B is nearly.", venue: "Knuckleheads", kind: "music" });
    expect(lines[0]).not.toHaveProperty("reason");
  });
});

describe("what moved this run", () => {
  const NOW = WEEK_2_ISO;

  it("names the cause of every change of standing", () => {
    const base = stored("Base");
    const cases: { name: string; was: ReturnType<typeof stored> | undefined; now: ReturnType<typeof stored>; from: string; to: string; cause: string }[] = [
      { name: "new event", was: undefined, now: pick("New", { firstSeen: NOW, lastChanged: NOW, lastJudged: NOW }), from: "no", to: "pick", cause: "new event" },
      {
        name: "hand pick",
        was: stored("Hand"),
        now: pick("Hand", { pickedBy: "hand", modelJudgment: { dontMiss: false } }),
        from: "no",
        to: "pick",
        cause: "hand pick",
      },
      {
        name: "hand un-pick",
        was: pick("Unpicked"),
        now: stored("Unpicked", { pickedBy: "hand", modelJudgment: { dontMiss: true, pickReason: "rare", whyLine: "w" } }),
        from: "pick",
        to: "no",
        cause: "hand un-pick",
      },
      {
        name: "hand entry removed",
        was: pick("Released", { pickedBy: "hand", modelJudgment: { dontMiss: false } }),
        now: stored("Released"),
        from: "pick",
        to: "no",
        cause: "hand entry removed",
      },
      { name: "expired", was: pick("Gone"), now: pick("Gone", { status: "expired", expiryReason: "past" }), from: "pick", to: "no", cause: "expired" },
      {
        name: "made recurring",
        was: pick("Weekly"),
        now: stored("Weekly", { recurrence: "recurring", schedule: "Every Tuesday", start: undefined }),
        from: "pick",
        to: "no",
        cause: "made recurring",
      },
      { name: "re-judged after a change", was: close("Changed"), now: pick("Changed", { lastChanged: NOW, lastJudged: NOW }), from: "close", to: "pick", cause: "re-judged after a change" },
      { name: "re-judged under a new prompt", was: pick("Prompted"), now: close("Prompted", { lastJudged: NOW }), from: "pick", to: "close", cause: "re-judged under a new prompt" },
      { name: "left unjudged", was: pick("Dropped"), now: stored("Dropped"), from: "pick", to: "no", cause: "left unjudged" },
    ];
    for (const c of cases) c.now.id = c.was?.id ?? c.now.id;

    const moves = pickMoves(
      [base, ...cases.flatMap((c) => (c.was ? [c.was] : []))],
      [base, ...cases.map((c) => c.now)],
      NOW,
    );

    expect(moves.map((m) => [m.from, m.to, m.cause])).toEqual(cases.map((c) => [c.from, c.to, c.cause]));
    expect(moves[0]).toMatchObject({ id: cases[0]!.now.id, title: "New", primaryUrl: base.primaryUrl });
  });

  it("a hand pick whose date passed is reported as expired, not as a removed entry", () => {
    const hand = pick("Hand", { pickedBy: "hand", modelJudgment: { dontMiss: false } });
    const moves = pickMoves([hand], [{ ...hand, status: "expired", expiryReason: "past" }], NOW);
    expect(moves.map((m) => [m.from, m.to, m.cause])).toEqual([["pick", "no", "expired"]]);
  });

  it("an unchanged standing is no move, a pick kept through an unverified strike included", () => {
    const kept = pick("Kept");
    const struck = pick("Struck");
    const moves = pickMoves([kept, struck], [kept, { ...struck, status: "unverified" }], NOW);
    expect(moves).toEqual([]);
  });
});

describe("counting picks", () => {
  const line = (kind: string, reason: PickLine["reason"]): PickLine => ({ id: "x", title: "t", venue: "v", kind, primaryUrl: "https://a.test/", reason, whyLine: "w", marks: [] });

  it("counts by kind or reason, most first, then by name", () => {
    const lines = [line("music", "rare"), line("music", "big-name"), line("film", "unusual"), line("comedy", "big-name")];
    expect(countBy(lines, "kind")).toEqual([
      { name: "music", count: 2 },
      { name: "comedy", count: 1 },
      { name: "film", count: 1 },
    ]);
    expect(countBy(lines, "reason")).toEqual([
      { name: "big-name", count: 2 },
      { name: "rare", count: 1 },
      { name: "unusual", count: 1 },
    ]);
  });
});
