import { describe, expect, it } from "vitest";
import { applyHandPicks, parseHandPicks, type HandPick } from "../src/hand-picks.js";
import type { Event } from "../src/dataset.js";
import { emptyDataset } from "../src/dataset.js";
import { newEventId } from "../src/extraction.js";
import { runWith } from "./fakes/run.js";
import { candidateAt, judging, knuckleheads, source, WEEK_1, WEEK_1_ISO, WEEK_2_ISO } from "./fakes/fixtures.js";

const CALENDAR_URL = knuckleheads.urls[0]!;

let nextId = 0;
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
    evidence: { date: "Sat, Oct 31 · Show 8:00 PM", venue: "Knuckleheads, 1 Main St" },
    ...overrides,
  };
}

const WHY = "A Poe performance staged outdoors at sunset before a cemetery's holding vault.";
const pickEntry = (e: Event, overrides: Partial<HandPick> = {}): HandPick => ({ id: e.id, title: e.title, pick: true, reason: "unusual", why: WHY, ...overrides }) as HandPick;
const unpickEntry = (e: Event): HandPick => ({ id: e.id, title: e.title, pick: false });

describe("parsing data/picks.yaml", () => {
  it("an empty file is no entries", () => {
    expect(parseHandPicks(null)).toEqual([]);
    expect(parseHandPicks(undefined)).toEqual([]);
    expect(parseHandPicks([])).toEqual([]);
  });

  it("a hand pick needs a reason from the vocabulary and a why-line that cleans to something under the cap", () => {
    const entry = { id: "evt_000000000001", title: "Electric Poe", pick: true, reason: "unusual", why: WHY };
    expect(parseHandPicks([entry])).toEqual([entry]);
    expect(() => parseHandPicks([{ ...entry, reason: "famous" }])).toThrow();
    expect(() => parseHandPicks([{ ...entry, reason: undefined }])).toThrow();
    expect(() => parseHandPicks([{ ...entry, why: ' }", ' }])).toThrow(/why/);
    expect(() => parseHandPicks([{ ...entry, why: "w".repeat(201) }])).toThrow(/why/);
  });

  it("a hand un-pick needs nothing else, and an unknown key is refused", () => {
    const entry = { id: "evt_000000000001", title: "Stewart Copeland", pick: false };
    expect(parseHandPicks([entry])).toEqual([entry]);
    expect(() => parseHandPicks([{ ...entry, reason: "rare" }])).toThrow();
    expect(() => parseHandPicks([{ ...entry, note: "x" }])).toThrow();
  });
});

describe("applying hand picks after curation", () => {
  it("a hand pick over a model close call becomes the pick, with the model's close call kept beside it", () => {
    const close = stored("Electric Poe", { closeCall: true, closeNote: "Nearly unusual." });
    const { events, report } = applyHandPicks([close], [pickEntry(close, { why: `${WHY}}` })], WEEK_2_ISO);

    expect(events[0]).toMatchObject({ dontMiss: true, pickReason: "unusual", whyLine: WHY, pickedBy: "hand", modelJudgment: { dontMiss: false, closeCall: true, closeNote: "Nearly unusual." } });
    expect(events[0]).not.toHaveProperty("closeCall");
    expect(events[0]).not.toHaveProperty("closeNote");
    expect(report).toEqual({ applied: 1, stale: [], changed: [] });
  });

  it("a hand un-pick over a model pick drops the flag, reason and why-line, keeping the model's pick beside it", () => {
    const pick = stored("Stewart Copeland", { dontMiss: true, pickReason: "rare", whyLine: "The Police's drummer." });
    const { events } = applyHandPicks([pick], [unpickEntry(pick)], WEEK_2_ISO);

    expect(events[0]).toMatchObject({ dontMiss: false, pickedBy: "hand", modelJudgment: { dontMiss: true, pickReason: "rare", whyLine: "The Police's drummer." } });
    expect(events[0]).not.toHaveProperty("pickReason");
    expect(events[0]).not.toHaveProperty("whyLine");
  });

  it("removing an entry restores the model's judgment exactly, a close call as a close call and a pick as a pick", () => {
    const close = stored("Electric Poe", { closeCall: true, closeNote: "Nearly unusual." });
    const pick = stored("Stewart Copeland", { dontMiss: true, pickReason: "rare", whyLine: "The Police's drummer." });
    const governed = applyHandPicks([close, pick], [pickEntry(close), unpickEntry(pick)], WEEK_2_ISO).events;

    const { events, report } = applyHandPicks(governed, [], WEEK_2_ISO);

    expect(events[0]).toEqual(close);
    expect(events[1]).toEqual(pick);
    expect(report).toEqual({ applied: 0, stale: [], changed: [] });
  });

  it("a hand-governed event judged again this run has the fresh model judgment kept; one not judged keeps the stored one", () => {
    const governed = applyHandPicks([stored("Electric Poe", { closeCall: true, closeNote: "Nearly." })], [pickEntry(stored("Electric Poe"), {})], WEEK_1_ISO).events[0]!;
    const entry = pickEntry(governed);

    // Not judged this run: the fields are the hand's, so the stored model judgment stands.
    const kept = applyHandPicks([governed], [entry], WEEK_2_ISO).events[0]!;
    expect(kept.modelJudgment).toEqual({ dontMiss: false, closeCall: true, closeNote: "Nearly." });

    // Judged this run: curation wrote fresh fields over the event, and they are what the hand entry now keeps.
    const rejudged = { ...governed, dontMiss: true, pickReason: "big-name" as const, whyLine: "A name most people know.", lastJudged: WEEK_2_ISO };
    const fresh = applyHandPicks([rejudged], [entry], WEEK_2_ISO).events[0]!;
    expect(fresh).toMatchObject({ dontMiss: true, pickReason: "unusual", whyLine: WHY, modelJudgment: { dontMiss: true, pickReason: "big-name", whyLine: "A name most people know." } });
  });

  it("a stale entry is reported with why, and not applied", () => {
    const gone = stored("Gone Show");
    const unverified = stored("Unverified Show", { status: "unverified" });
    const kept = stored("Kept Show");
    const folded = stored("Folded Show", { status: "expired", expiryReason: "duplicate", duplicateOf: kept.id });
    const retitled = stored("The Real Title");
    const weekly = stored("Weekly Jam", { recurrence: "recurring", schedule: "Every Tuesday", start: undefined, evidence: { date: "Every Tuesday", venue: "Knuckleheads" } });

    const { events, report } = applyHandPicks(
      [unverified, kept, folded, retitled, weekly],
      [
        pickEntry(gone),
        pickEntry(unverified),
        pickEntry(folded),
        pickEntry(retitled, { title: "Another Title" }),
        pickEntry(weekly),
      ],
      WEEK_2_ISO,
    );

    expect(events).toEqual([unverified, kept, folded, retitled, weekly]);
    expect(report.applied).toBe(0);
    expect(report.stale).toEqual([
      { id: gone.id, title: "Gone Show", note: "no such event" },
      { id: unverified.id, title: "Unverified Show", note: "unverified" },
      { id: folded.id, title: "Folded Show", note: `folded into ${kept.id}` },
      { id: retitled.id, title: "Another Title", note: 'title now "The Real Title"' },
      { id: weekly.id, title: "Weekly Jam", note: "recurring" },
    ]);
  });

  it("an entry's title matches the event's when the event's contains it, ignoring case and punctuation", () => {
    const e = stored("Electric Poe: An Evening at Union Cemetery");
    const { report } = applyHandPicks([e], [pickEntry(e, { title: "electric poe" })], WEEK_2_ISO);
    expect(report).toEqual({ applied: 1, stale: [], changed: [] });
  });

  it("a hand-governed event whose facts changed this run is listed, and the entry still stands", () => {
    const e = stored("Electric Poe", { lastChanged: WEEK_2_ISO });
    const { events, report } = applyHandPicks([e], [pickEntry(e)], WEEK_2_ISO);
    expect(events[0]).toMatchObject({ dontMiss: true, pickedBy: "hand" });
    expect(report.changed).toEqual([{ id: e.id, title: "Electric Poe" }]);
  });
});

describe("hand picks in a run", () => {
  const granada = source("Granada", { neighborhood: "Lawrence" });
  const LIST_URL = granada.urls[0]!;
  const OWN_A = "https://granada.test/event/first/";
  const OWN_B = "https://granada.test/event/second/";
  const LIST = {
    status: 200,
    body: `<html><body><div><a href="/event/first/">First Show</a> Saturday, October 17 · Granada</div><div><a href="/event/second/">Second Show</a> Sunday, October 18 · Granada</div></body></html>`,
  };
  const OWN = { status: 200, body: `<html><body><h1>Show</h1><p>Show 8:00 pm</p></body></html>` };
  const listed = (title: string, date: string, link: number, day: string) =>
    candidateAt(granada, { title, startDate: date, startTime: null, eventLink: link, dateEvidence: `${day}, October ${date.slice(-2)}`, venueEvidence: "Granada" });
  const ownPage = { value: { date: "2026-10-18", time: "20:00", timeEvidence: "Show 8:00 pm", price: null, priceEvidence: null, ages: null, agesEvidence: null, days: null, daysEvidence: null, daysLink: null, description: null }, costUsd: 0.002 };
  const A = newEventId(LIST_URL, "First Show", WEEK_1_ISO, "2026-10-17");
  const B = newEventId(LIST_URL, "Second Show", WEEK_1_ISO, "2026-10-18");

  it("an un-pick drops the model's pick, a pick makes one of the model's no, and the hand pick has its own page read like any pick", async () => {
    const { dataset, report, calls } = await runWith(WEEK_1, emptyDataset(), {
      sources: [granada],
      pages: { [LIST_URL]: LIST, [OWN_A]: OWN, [OWN_B]: OWN },
      completions: [{ value: { events: [listed("First Show", "2026-10-17", 1, "Saturday"), listed("Second Show", "2026-10-18", 2, "Sunday")] }, costUsd: 0.01 }, ownPage],
      curations: [judging(0.02, { id: A, verdict: "pick", reason: "rare", why: "Rare." }, { id: B, verdict: "no", reason: "none", why: "" })],
      handPicks: [
        { id: A, title: "First Show", pick: false },
        { id: B, title: "Second Show", pick: true, reason: "tradition", why: "A once-a-year October night the town has kept up." },
      ],
    });

    const a = dataset.events.find((e) => e.id === A)!;
    const b = dataset.events.find((e) => e.id === B)!;
    expect(a).toMatchObject({ dontMiss: false, pickedBy: "hand", modelJudgment: { dontMiss: true, pickReason: "rare", whyLine: "Rare." } });
    expect(b).toMatchObject({ dontMiss: true, pickReason: "tradition", whyLine: "A once-a-year October night the town has kept up.", pickedBy: "hand", modelJudgment: { dontMiss: false } });
    expect(report.curation.handPicks).toEqual({ applied: 2, stale: [], changed: [] });
    expect(calls.some((c) => c.includes(OWN_B))).toBe(true);
    expect(calls.some((c) => c.includes(OWN_A))).toBe(false);
  });
});
