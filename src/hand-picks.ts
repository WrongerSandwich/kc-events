/**
 * Hand picks (ADR 0014): the entries of `data/picks.yaml`, a committed file the run reads and never writes, each
 * picking an event the model did not or un-picking one it did. An entry is applied after curation on every run, so
 * it stands over any later model judgment until it is removed; the model's own judgment is kept beside the event
 * (`modelJudgment`) and comes back when the entry goes. A stale entry (no such active event, a folded or recurring
 * one, a title that no longer matches) is reported and not applied, so the file does not rot unnoticed.
 */
import { z } from "zod";
import { cleanWhyLine, pickFields, WHY_LINE_CAP, withPickFields, type PickFields } from "./curation.js";
import { PICK_REASONS, type Event } from "./dataset.js";
import { normalizeName } from "./identity.js";

const entryFields = {
  id: z.string().min(1),
  /** For the reader; the run reports an entry whose event's title no longer contains it. */
  title: z.string().min(1),
};

export const handPickSchema = z.discriminatedUnion("pick", [
  z.strictObject({
    ...entryFields,
    pick: z.literal(true),
    reason: z.enum(PICK_REASONS),
    why: z
      .string()
      .refine((why) => cleanWhyLine(why) !== "", { message: "a hand pick's why-line must say something once cleaned" })
      .refine((why) => cleanWhyLine(why).length <= WHY_LINE_CAP, { message: `a hand pick's why-line runs past the ${WHY_LINE_CAP}-character cap` }),
  }),
  z.strictObject({ ...entryFields, pick: z.literal(false) }),
]);

export const handPicksSchema = z.array(handPickSchema);

export type HandPick = z.infer<typeof handPickSchema>;

/** The entries of data/picks.yaml as parsed; an empty or absent body is no entries. */
export function parseHandPicks(raw: unknown): HandPick[] {
  return handPicksSchema.parse(raw ?? []);
}

export interface HandPicksReport {
  /** Entries applied to an active event this run. */
  applied: number;
  /** Entries that matched no active event, or whose event's title no longer contains theirs, with why; not applied. */
  stale: { id: string; title: string; note: string }[];
  /** Hand-governed events whose title, date, venue or status changed this run (markChanged): the entry still stands, and a person should look. */
  changed: { id: string; title: string }[];
}

/** Why an entry cannot govern this event, or undefined when it can. */
function staleNote(entry: HandPick, event: Event | undefined): string | undefined {
  if (event === undefined) return "no such event";
  if (event.status === "expired" && event.expiryReason === "duplicate" && event.duplicateOf !== undefined) return `folded into ${event.duplicateOf}`;
  if (event.status !== "active") return event.status;
  if (event.recurrence === "recurring") return "recurring";
  if (!normalizeName(event.title).includes(normalizeName(entry.title))) return `title now "${event.title}"`;
  return undefined;
}

/** The pick fields an entry sets. */
function entryFields_(entry: HandPick): PickFields {
  return entry.pick ? { dontMiss: true, pickReason: entry.reason, whyLine: cleanWhyLine(entry.why) } : { dontMiss: false };
}

/** The event with the entry's pick in place of the model's, and the model's kept beside it. */
function governed(event: Event, entry: HandPick, nowIso: string): Event {
  // Curation wrote fresh fields over a hand-governed event only if it judged it this run; otherwise the fields are the hand's.
  const judgedThisRun = event.lastJudged === nowIso;
  const modelJudgment = event.pickedBy === undefined || judgedThisRun || event.modelJudgment === undefined ? pickFields(event) : event.modelJudgment;
  return { ...withPickFields(event, entryFields_(entry)), pickedBy: "hand", modelJudgment };
}

/** The event with the model's judgment back in place and no hand marks. */
function released(event: Event): Event {
  const { pickedBy: _, modelJudgment, ...rest } = event;
  return withPickFields(rest as Event, modelJudgment ?? { dontMiss: false });
}

/**
 * Every event with its hand entry applied, or released when it was hand-governed and no entry names it now; the rest
 * untouched. `nowIso` is this run's start, which stamps lastJudged and lastChanged.
 */
export function applyHandPicks(events: Event[], picks: HandPick[], nowIso: string): { events: Event[]; report: HandPicksReport } {
  const byId = new Map(events.map((e) => [e.id, e]));
  const report: HandPicksReport = { applied: 0, stale: [], changed: [] };
  const applicable = new Map<string, HandPick>();
  // Every id the file names: a stale entry is not applied, but while it is in the file its event is not released either,
  // so an outage strike or a retitling does not flap the event between the hand's answer and the model's.
  const named = new Set(picks.map((p) => p.id));
  for (const entry of picks) {
    const event = byId.get(entry.id);
    const note = staleNote(entry, event);
    if (note !== undefined) {
      report.stale.push({ id: entry.id, title: entry.title, note });
      continue;
    }
    applicable.set(entry.id, entry);
  }
  const out = events.map((event) => {
    const entry = applicable.get(event.id);
    if (entry === undefined) return event.pickedBy === undefined || named.has(event.id) ? event : released(event);
    report.applied++;
    // A change this run to an event known before; a new event is "changed" by markChanged too, and is not news to the entry's author.
    if (event.lastChanged === nowIso && event.firstSeen !== nowIso) report.changed.push({ id: event.id, title: event.title });
    return governed(event, entry, nowIso);
  });
  return { events: out, report };
}
