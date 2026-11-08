/**
 * Curation: active one-offs and limited runs that are new or changed since they were last judged
 * go to the curation model with the curation prompt, and come back with a don't-miss flag and a
 * why-line each. Recurring events are never eligible (ADR 0005).
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import type { RunConfig } from "./config.js";
import { PICK_REASONS, type Event } from "./dataset.js";
import { statesMonthDay } from "./date-span.js";
import { sameMoment, sameName } from "./identity.js";
import { strictResponseFormat, thisRunLines } from "./model-request.js";
import { LISTING_LINE_LENGTH } from "./own-page.js";
import type { CompletionRequest } from "./ports.js";
import type { RunReport } from "./report.js";

/** Events judged per curation call; enough for the model to weigh them against each other, few enough to answer every one. */
export const CURATION_BATCH_SIZE = 25;

/** The three answers curation gives about an event (ADR 0014): on the front page under a reason, nearly there, or neither. */
export const VERDICTS = ["pick", "close", "no"] as const;
export type Verdict = (typeof VERDICTS)[number];

/**
 * The curation model's answer about one event (ADR 0014). A pick with no reason or no why-line is not a pick, and a
 * close call with no note is not one; "none" stands in for a reason on anything but a pick, since the strict response
 * format wants every field on every judgment.
 */
export const judgmentSchema = z.object({
  id: z.string().describe("The event's id, exactly as given."),
  verdict: z.enum(VERDICTS).describe("pick: someone in a mixed group of friends would bring it up, under one of the reasons. close: nearly, but no reason's test is clearly met. no: neither."),
  reason: z.enum([...PICK_REASONS, "none"]).describe("On a pick, the one reason it is picked under. On a close or a no, none."),
  why: z.string().describe("On a pick, the why-line: one sentence a reader could disagree with. On a close, one sentence naming the reason it nearly met and what was missing. On a no, empty."),
});

export const curationReplySchema = z.object({ judgments: z.array(judgmentSchema) });

/**
 * The longest a why-line may be once cleaned; a flag with a longer one is not applied. Checked per
 * judgment rather than in the response format, so one long line costs only its own event.
 */
export const WHY_LINE_CAP = 200;

/** Whether the judgment picks, or nearly picks, its event with a why-line or note that, cleaned, runs past the cap. */
export function whyLineOverCap(judgment: Judgment): boolean {
  return judgment.verdict !== "no" && cleanWhyLine(judgment.why).length > WHY_LINE_CAP;
}

export type Judgment = z.infer<typeof judgmentSchema>;

/**
 * Why a judgment cannot be applied, or undefined when it can: a pick with no reason or no why-line, a close call with
 * no note. The event is left unjudged, so it comes up again next run.
 */
export function judgmentProblem(judgment: Judgment): "picked with no reason" | "picked with no why-line" | "a close call with no note" | undefined {
  const empty = cleanWhyLine(judgment.why) === "";
  if (judgment.verdict === "pick" && judgment.reason === "none") return "picked with no reason";
  if (judgment.verdict === "pick" && empty) return "picked with no why-line";
  if (judgment.verdict === "close" && empty) return "a close call with no note";
  return undefined;
}

/** The pick fields of an event or a stored model judgment: what a verdict sets and what a fold or a hand entry carries. */
export type PickFields = Pick<Event, "dontMiss" | "pickReason" | "whyLine" | "closeCall" | "closeNote">;

/** The pick fields a judgment amounts to, its why-line or note cleaned. */
export function pickFieldsOf(judgment: Judgment): PickFields {
  const why = cleanWhyLine(judgment.why);
  if (judgment.verdict === "pick" && judgment.reason !== "none") return { dontMiss: true, pickReason: judgment.reason, whyLine: why };
  if (judgment.verdict === "close") return { dontMiss: false, closeCall: true, closeNote: why };
  return { dontMiss: false };
}

/** The pick fields an event carries now. */
export function pickFields(event: PickFields): PickFields {
  const { dontMiss, pickReason, whyLine, closeCall, closeNote } = event;
  return {
    dontMiss,
    ...(pickReason !== undefined ? { pickReason } : {}),
    ...(whyLine !== undefined ? { whyLine } : {}),
    ...(closeCall !== undefined ? { closeCall } : {}),
    ...(closeNote !== undefined ? { closeNote } : {}),
  };
}

/** The event with these pick fields in place of its own. */
export function withPickFields(event: Event, fields: PickFields): Event {
  const { pickReason: _r, whyLine: _w, closeCall: _c, closeNote: _n, ...rest } = event;
  return { ...rest, ...pickFields(fields) };
}

/** A batch of events is a longer reply than a page's; three minutes, and a call past it costs only its batch. */
const CURATION_TIMEOUT_MS = 180_000;

/** The strict JSON schema sent as the response format on every curation call. */
export const curationResponseFormat = strictResponseFormat("curation_judgments", curationReplySchema);

/** What every curation call in one run shares. */
export interface CurationContext {
  config: RunConfig;
  /** The curation prompt document, the second editorial surface. */
  curationPrompt: string;
  /** The run's local date, so the model knows how far off each event is. */
  today: string;
}

/**
 * The curation prompt's version, stamped on every judgment as judgedWith (#256): the first 12 hex
 * digits of the sha256 of its text as read, so any edit, whitespace included, re-judges everything.
 */
export function promptHash(curationPrompt: string): string {
  return createHash("sha256").update(curationPrompt).digest("hex").slice(0, 12);
}

/**
 * Whether an event is due for curation: it is publishable, it is not recurring, and it is new,
 * has changed since it was last judged, or was judged under another prompt than the current one
 * (judgedWith, #256; absent on a judgment made before it was kept). A run cut short by the spend
 * cap leaves events unjudged, so they come up again next run.
 */
export function needsCuration(event: Event, judgedWith: string): boolean {
  return curationEligible(event) && (changedSince(event) || event.judgedWith !== judgedWith);
}

/** Whether an event is due for curation on its facts alone, whatever prompt judged it. */
export function changedSinceJudged(event: Event): boolean {
  return curationEligible(event) && changedSince(event);
}

/** Whether curation may judge the event at all: publishable, not recurring, and marked by markChanged. */
export function curationEligible(event: Event): event is Event & { lastChanged: string } {
  return event.status === "active" && event.recurrence !== "recurring" && event.lastChanged !== undefined;
}

/** Whether an eligible event is new or has changed since it was last judged. */
function changedSince(event: Event & { lastChanged: string }): boolean {
  return event.lastJudged === undefined || Date.parse(event.lastChanged) > Date.parse(event.lastJudged);
}

/**
 * Stamps last-changed on every event that is new this run or whose title, date (a recurring event's
 * schedule), venue, or status differs from the dataset it started from, or whose own page, read this
 * run, filled out its description (filledOut, #254), so curation knows what to re-judge. A list's
 * reading giving a new description is no change: the wording a model picks moves from week to week,
 * while an own page is read once per date and own page. A title or venue spelled with different case
 * or punctuation is the same name. A date is
 * compared as a calendar date, and by its time of day only when both readings carry one: one page
 * giving a time and another none, or a reading that drops it, is no change (#79).
 */
export function markChanged(previous: Event[], events: Event[], nowIso: string): Event[] {
  const before = new Map(previous.map((e) => [e.id, e]));
  return events.map((event) => {
    const was = before.get(event.id);
    const changed =
      !was ||
      !sameName(was.title, event.title) ||
      !sameMoment(was.start, event.start) ||
      !sameMoment(was.end, event.end) ||
      was.schedule !== event.schedule ||
      !sameName(was.venue, event.venue) ||
      was.status !== event.status ||
      filledOut(was, event);
    return changed ? { ...event, lastChanged: nowIso } : event;
  });
}

/**
 * Whether an own page read this run (a read on another date than the stored one) gave a fuller description: there
 * was none, or one a list line's length (LISTING_LINE_LENGTH), and the new one is longer.
 */
function filledOut(was: Event, event: Event): boolean {
  const freshRead = event.ownPageRead !== undefined && event.ownPageRead.on !== was.ownPageRead?.on;
  const [before, now] = [was.description, event.description];
  return freshRead && now !== undefined && (before === undefined || (before.length <= LISTING_LINE_LENGTH && now.length > before.length));
}

/** The line that opens the user message of a curation request; the events follow as a JSON array. */
export const EVENTS_TO_JUDGE = "Events to judge:";

/**
 * One curation call over a batch of eligible events: the curation prompt, this run's dates, and
 * the events as data. Recurrence goes along so the model can tell a closing run from a one-night date.
 */
export function buildCurationRequest(events: Event[], context: CurationContext): CompletionRequest {
  const { config, curationPrompt, today } = context;
  const system = [curationPrompt, "", ...thisRunLines(config, today)].join("\n");
  const listed = events.map((e) => ({
    id: e.id,
    title: e.title,
    kind: e.kind,
    recurrence: e.recurrence,
    ...(e.start !== undefined ? { start: e.start } : {}),
    ...(e.end !== undefined ? { end: e.end } : {}),
    venue: e.venue,
    neighborhood: e.neighborhood,
    ...(e.description !== undefined ? { description: e.description } : {}),
    primaryUrl: e.primaryUrl,
  }));
  return {
    model: config.models.curation,
    stage: "curation",
    messages: [
      { role: "system", content: system },
      { role: "user", content: `${EVENTS_TO_JUDGE}\n\n${JSON.stringify(listed, null, 2)}` },
    ],
    responseFormat: curationResponseFormat,
    timeoutMs: CURATION_TIMEOUT_MS,
  };
}

/** The event with a judgment applied and stamped as judged now under this prompt; the why-line is kept only with the flag, the note only with a close call. */
export function applyJudgment(event: Event, judgment: Judgment, nowIso: string, judgedWith: string): Event {
  return withJudgment(event, pickFieldsOf(judgment), nowIso, judgedWith);
}

/**
 * The record kept by a fold, with the judgment of whichever record of the pair was judged later
 * (#79): the pair is one event, and its latest verdict is the one to show, reason and close call
 * included. A recurring record takes no judgment, since recurring events are never flagged.
 */
export function withLaterJudgment(kept: Event, duplicate: Event): Event {
  if (kept.recurrence === "recurring" || duplicate.lastJudged === undefined) return kept;
  if (kept.lastJudged !== undefined && Date.parse(kept.lastJudged) >= Date.parse(duplicate.lastJudged)) return kept;
  return withJudgment(kept, pickFields(duplicate), duplicate.lastJudged, duplicate.judgedWith);
}

/** The event carrying these pick fields, and the prompt the judgment was made under, in place of its own. */
function withJudgment(event: Event, fields: PickFields, lastJudged: string, judgedWith: string | undefined): Event {
  const { judgedWith: _, ...rest } = withPickFields(event, fields);
  return { ...rest, lastJudged, ...(judgedWith !== undefined ? { judgedWith } : {}) };
}

/** A sentence end followed, after a space, by another: the second is the stray. A spaced ellipsis (". . .") is no sentence end. */
const DOUBLED_END = /(\S[.!?])\s+[.!?]+$/;

/** Brackets that pair as an opening and a closing character, keyed by the closing one. */
const OPENING: Record<string, string> = { "}": "{", "]": "[" };
const CLOSING: Record<string, string> = { "{": "}", "[": "]" };

const occurrences = (line: string, char: string) => line.split(char).length - 1;

/** Whether this character, at one end of the line, has no partner in it: a comma never does; a quote doesn't when the count is odd. */
function unpartnered(line: string, char: string | undefined): boolean {
  if (char === ",") return true;
  if (char === '"') return occurrences(line, '"') % 2 === 1;
  const partner = char === undefined ? undefined : (OPENING[char] ?? CLOSING[char]);
  return partner !== undefined && occurrences(line, char!) > occurrences(line, partner);
}

/** Whether the line opens with a brace or bracket whose partner is its last character. */
function wrapped(line: string): boolean {
  const open = line[0]!;
  const close = CLOSING[open];
  if (close === undefined || line.length < 2 || line.at(-1) !== close) return false;
  let depth = 0;
  for (let i = 0; i < line.length - 1; i++) {
    if (line[i] === open) depth++;
    else if (line[i] === close && --depth === 0) return false;
  }
  return true;
}

/** The line with one stray piece of JSON punctuation taken off either end, or unchanged when there is none. */
function stripStrayEnd(line: string): string {
  const last = line.at(-1);
  const first = line[0];
  if (last !== undefined && "}],\"".includes(last) && unpartnered(line, last)) return line.slice(0, -1);
  if (first !== undefined && "{[\"".includes(first) && unpartnered(line, first)) return line.slice(1);
  if (wrapped(line)) return line.slice(1, -1);
  return line;
}

/**
 * A why-line with stray JSON punctuation taken off its ends. Structured output guarantees the
 * reply's shape, not the text inside a field, so a why-line can come back carrying a brace, bracket,
 * comma or quote from the JSON around it. Unpartnered ones at either end go, as does a brace or
 * bracket pair wrapping the whole line; balanced brackets and quotes inside the sentence, and its own
 * punctuation, stay. Quotes are partnered by count, so which end an odd one is taken from assumes the
 * stray is at the end, where the JSON leaves it. A sentence end repeated after a space (". ." or
 * "!  .", #157) keeps only the first, and a run of whitespace inside the line is one space. A line that
 * cleans to empty is no why-line.
 */
export function cleanWhyLine(raw: string): string {
  let line = raw.trim().replace(/\s{2,}/g, " ");
  for (;;) {
    const next = stripStrayEnd(line).replace(DOUBLED_END, "$1").trim();
    if (next === line) return line;
    line = next;
  }
}

/**
 * The active picks whose why-line states their own end date (#234): the card already shows it, so
 * the line spent its words on the date. Reported, not unflagged; an event with no end gets no line.
 */
export function datedWhyLines(events: Event[]): RunReport["curation"]["datedWhyLines"] {
  return events
    .filter((e) => e.status === "active" && e.dontMiss && e.whyLine !== undefined && e.end !== undefined && statesMonthDay(e.whyLine, e.end.slice(0, 10)))
    .map((e) => ({ id: e.id, title: e.title, primaryUrl: e.primaryUrl, whyLine: e.whyLine! }));
}

/** The event with no flag, no reason, no why-line, and no close call. */
export function unflagged(event: Event): Event {
  return withPickFields(event, { dontMiss: false });
}

/**
 * A stored event with its why-line or close note cleaned; a flag whose why-line cleans to empty is no flag (its
 * reason goes with it), and a close call whose note cleans to empty is no close call. Not a change, and not a judgment.
 */
export function cleanStoredWhyLine(event: Event): Event {
  if (event.whyLine !== undefined) {
    const why = cleanWhyLine(event.whyLine);
    if (why === event.whyLine) return event;
    return why === "" ? unflagged(event) : { ...event, whyLine: why };
  }
  if (event.closeNote !== undefined) {
    const note = cleanWhyLine(event.closeNote);
    if (note === event.closeNote) return event;
    return note === "" ? unflagged(event) : { ...event, closeNote: note };
  }
  return event;
}
