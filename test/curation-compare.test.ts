import { describe, expect, it } from "vitest";
import { promptDiff, renderCurationComparison, sampleEligible, scoreRepeats, type CurationTrial } from "../src/curation-compare.js";
import { storedEvent as stored } from "./fakes/fixtures.js";

const trial = (prompt: CurationTrial["prompt"], repeat: number, id: string, verdict: CurationTrial["verdict"], reason: CurationTrial["reason"], why = ""): CurationTrial => ({
  prompt,
  repeat,
  id,
  verdict,
  reason,
  why,
  costUsd: 0.01,
});

describe("the events a comparison judges", () => {
  const a = stored("A");
  const b = stored("B");
  const c = stored("C");
  const weekly = stored("Weekly", { recurrence: "recurring", schedule: "Every Tuesday", start: undefined });
  const held = stored("Held", { status: "unverified" });
  const all = [a, weekly, b, held, c];

  it("is every active one-off and limited run when no sample size is given", () => {
    expect(sampleEligible(all, undefined, "seed").map((e) => e.title)).toEqual(["A", "B", "C"]);
  });

  it("draws the same sample for the same seed, and another for another", () => {
    const first = sampleEligible(all, 2, "one").map((e) => e.id);
    expect(first).toHaveLength(2);
    expect(sampleEligible(all, 2, "one").map((e) => e.id)).toEqual(first);
    const seeds = ["two", "three", "four", "five", "six"].map((s) => sampleEligible(all, 2, s).map((e) => e.id).join());
    expect(new Set([first.join(), ...seeds]).size).toBeGreaterThan(1);
  });
});

describe("scoring repeated judgments", () => {
  const a = stored("A", { dontMiss: true, pickReason: "rare", whyLine: "Rare." });
  const b = stored("B");
  const c = stored("C", { dontMiss: true, pickReason: "rare", whyLine: "Rare too." });
  const d = stored("D");
  const dataset = [a, b, c, d];
  const current: CurationTrial[] = [
    ...[0, 1, 2].map((r) => trial("current", r, a.id, "pick", "rare", "A is rare.")),
    trial("current", 0, b.id, "pick", "big-name", "B is big."),
    trial("current", 1, b.id, "pick", "big-name", "B is big."),
    trial("current", 2, b.id, "close", "none", "Nearly big."),
    ...[0, 1, 2].map((r) => trial("current", r, c.id, "no", "none")),
    ...[0, 1, 2].map((r) => trial("current", r, d.id, "close", "none", "Nearly.")),
  ];

  it("counts the events whose verdict flipped between repeats, overall and by their majority answer", () => {
    const [score] = scoreRepeats(current, dataset);
    expect(score).toMatchObject({ prompt: "current", events: 4, repeats: 3, flipped: 1, flipRate: 0.25 });
    expect(score!.costUsd).toBeCloseTo(0.12);
    expect(score!.byMajorityAnswer).toEqual([
      { answer: "big-name", events: 1, flipped: 1 },
      { answer: "close", events: 1, flipped: 0 },
      { answer: "no", events: 1, flipped: 0 },
      { answer: "rare", events: 1, flipped: 0 },
    ]);
  });

  it("takes the majority verdict per event for the pick rate and the agreement with what is stored", () => {
    const [score] = scoreRepeats(current, dataset);
    expect(score).toMatchObject({ picks: 2, pickRate: 0.5, agreementWithStored: { same: 2, storedPickNowNot: 1, nowPickStoredNot: 1 } });
  });

  it("scores each prompt's trials apart, current first", () => {
    const candidate = [0, 1, 2].map((r) => trial("candidate", r, a.id, "close", "none", "Nearly rare."));
    const scores = scoreRepeats([...candidate, ...current], dataset);
    expect(scores.map((s) => [s.prompt, s.events, s.picks])).toEqual([
      ["current", 4, 2],
      ["candidate", 1, 0],
    ]);
  });

  it("lists the events whose majority answer differs between the prompts, with each side's why", () => {
    const candidate = [
      ...[0, 1, 2].map((r) => trial("candidate", r, a.id, "close", "none", "Nearly rare.")),
      ...[0, 1, 2].map((r) => trial("candidate", r, b.id, "pick", "big-name", "B is big.")),
      ...[0, 1, 2].map((r) => trial("candidate", r, c.id, "no", "none")),
      ...[0, 1, 2].map((r) => trial("candidate", r, d.id, "pick", "unusual", "D is strange.")),
    ];
    expect(promptDiff([...current, ...candidate], dataset)).toEqual([
      { id: a.id, title: "A", from: "pick (rare)", to: "close", fromWhy: "A is rare.", toWhy: "Nearly rare." },
      { id: d.id, title: "D", from: "close", to: "pick (unusual)", fromWhy: "Nearly.", toWhy: "D is strange." },
    ]);
  });

  it("renders the flip rate, the pick count against the calibration figure, and the diff", () => {
    const candidate = [0, 1, 2].map((r) => trial("candidate", r, a.id, "close", "none", "Nearly rare."));
    const trials = [...current, ...candidate];
    const markdown = renderCurationComparison(scoreRepeats(trials, dataset), promptDiff(trials, dataset), {
      date: "2026-11-09",
      model: "anthropic/claude-sonnet-5.5",
      currentHash: "abcdefabcdef",
      candidateHash: "123456123456",
      sample: 4,
      minutes: 2.5,
    });
    expect(markdown).toContain("# Curation prompt comparison 2026-11-09");
    expect(markdown).toContain("25%");
    expect(markdown).toContain("2 picks");
    expect(markdown).toContain("50 to 80");
    expect(markdown).toContain("| A | pick (rare) | close |");
  });
});
