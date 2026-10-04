/**
 * Curation: active one-offs and limited runs that are new or changed since they were last judged
 * go to the curation model with the curation prompt, and come back with a don't-miss flag and a
 * why-line each. Recurring events are never eligible (ADR 0005).
 */
import { z } from "zod";
import type { RunConfig } from "./config.js";
import type { Event } from "./dataset.js";
import { strictResponseFormat, thisRunLines } from "./model-request.js";
import type { CompletionRequest } from "./ports.js";

/** Events judged per curation call; enough for the model to weigh them against each other, few enough to answer every one. */
export const CURATION_BATCH_SIZE = 25;

/** The curation model's answer about one event. A flag with no why-line is not a flag. */
export const judgmentSchema = z.object({
  id: z.string().describe("The event's id, exactly as given."),
  dontMiss: z.boolean().describe("True when a friend who lives here would be sorry to have missed it."),
  why: z.string().describe("When dontMiss is true: the one sentence a reader could disagree with. Otherwise empty."),
});

export const curationReplySchema = z.object({ judgments: z.array(judgmentSchema) });

export type Judgment = z.infer<typeof judgmentSchema>;

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
 * Whether an event is due for curation: it is publishable, it is not recurring, and it is new
 * or has changed since it was last judged. A run cut short by the spend cap leaves events
 * unjudged, so they come up again next run.
 */
export function needsCuration(event: Event): boolean {
  if (event.status !== "active" || event.recurrence === "recurring" || event.lastChanged === undefined) return false;
  return event.lastJudged === undefined || Date.parse(event.lastChanged) > Date.parse(event.lastJudged);
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
    primaryUrl: e.primaryUrl,
  }));
  return {
    model: config.models.curation,
    messages: [
      { role: "system", content: system },
      { role: "user", content: `${EVENTS_TO_JUDGE}\n\n${JSON.stringify(listed, null, 2)}` },
    ],
    responseFormat: curationResponseFormat,
  };
}

/** The event with a judgment applied and stamped as judged now; the why-line is kept only with the flag. */
export function applyJudgment(event: Event, judgment: Judgment, nowIso: string): Event {
  const { whyLine: _, ...rest } = event;
  const why = cleanWhyLine(judgment.why);
  return { ...rest, dontMiss: judgment.dontMiss, ...(judgment.dontMiss ? { whyLine: why } : {}), lastJudged: nowIso };
}

const occurrences = (line: string, char: string) => line.split(char).length - 1;

/** Whether the line opens with `open` and the partner of that opening is its last character. */
function wrappedIn(line: string, open: string, close: string): boolean {
  if (line.length < 2 || line[0] !== open || line.at(-1) !== close) return false;
  if (open === close) return occurrences(line, open) === 2;
  let depth = 0;
  for (let i = 0; i < line.length - 1; i++) {
    if (line[i] === open) depth++;
    else if (line[i] === close && --depth === 0) return false;
  }
  return true;
}

/** The line with one piece of stray JSON punctuation taken off either end, or unchanged when there is none. */
function stripOnce(line: string): string {
  const last = line.at(-1);
  const first = line[0];
  const oddQuotes = occurrences(line, '"') % 2 === 1;
  if (last === "," || (last === "}" && occurrences(line, "}") > occurrences(line, "{")) || (last === "]" && occurrences(line, "]") > occurrences(line, "[")) || (last === '"' && oddQuotes)) {
    return line.slice(0, -1);
  }
  if ((first === "{" && occurrences(line, "{") > occurrences(line, "}")) || (first === "[" && occurrences(line, "[") > occurrences(line, "]")) || (first === '"' && oddQuotes)) {
    return line.slice(1);
  }
  if (wrappedIn(line, "{", "}") || wrappedIn(line, "[", "]") || wrappedIn(line, '"', '"')) return line.slice(1, -1);
  return line;
}

/**
 * A why-line with stray JSON punctuation taken off its ends. Structured output guarantees the
 * reply's shape, not the text inside a field, so a why-line can come back carrying a brace, bracket,
 * comma or quote from the JSON around it. Unpartnered ones at either end go, as does a pair wrapping
 * the whole line; balanced brackets and quotes inside the sentence, and its own punctuation, stay.
 * A line that cleans to empty is no why-line.
 */
export function cleanWhyLine(raw: string): string {
  let line = raw.trim();
  for (;;) {
    const next = stripOnce(line).trim();
    if (next === line) return line;
    line = next;
  }
}

/** A stored event with its why-line cleaned; a flag whose why-line cleans to empty is no flag. Not a change, and not a judgment. */
export function cleanStoredWhyLine(event: Event): Event {
  if (event.whyLine === undefined) return event;
  const why = cleanWhyLine(event.whyLine);
  if (why === event.whyLine) return event;
  const { whyLine: _, ...rest } = event;
  return why === "" ? { ...rest, dontMiss: false } : { ...rest, whyLine: why };
}
