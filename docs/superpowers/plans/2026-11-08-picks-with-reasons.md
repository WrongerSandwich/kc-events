# Picks with Reasons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Curation answers pick, close or no for every eligible event, every pick carries one reason from a fixed vocabulary of six, Evan can override picks from a committed file, the run report lists picks, close calls and what moved, and a command measures a curation prompt's repeatability before it lands.

**Architecture:** The curation stage in `src/run.ts` keeps its shape (batches to the curation model, judgments applied to the events they name, re-judge on change or prompt hash) and changes its reply contract; new fields on the event schema carry the reason, the close call and the hand override; a new `src/hand-picks.ts` parses `data/picks.yaml` and applies it after curation; a new `src/picks-report.ts` turns the final events into the report's lists; a new `src/curation-compare.ts` and its CLI score repeated judgments. The prompt is rewritten last, lands with the code, and the first weekly run after re-judges everything through the existing `judgedWith` hash.

**Tech Stack:** TypeScript (ESM, `node:` imports), Zod 4 schemas, vitest, `yaml`, OpenRouter through the existing model port, `tsx` CLIs.

**Spec:** `docs/superpowers/specs/2026-11-08-picks-with-reasons-design.md`

## Scope

This plan is the job-side ticket (serial lane: `run.ts`, curation, report, a new command, the prompt, the ADR). The site is a second ticket after this lands: its data contract is one line in `project()` in `site/src/build/load-dataset.ts` passing `pickReason` through to `PublishedEvent`, and the front page's treatment of reasons is a design pass of its own. Until then the site keeps publishing `dontMiss` and `whyLine` unchanged; the new fields parse through the job's schema and `project()` drops them.

## Global Constraints

- The six reasons, exactly these data values, in this order: `rare`, `big-name`, `occasion`, `tradition`, `unusual`, `major-run`.
- The dataset schema version does not change: every new field is optional and absent on records from before.
- Recurring events are never picks and never close calls (ADR 0005). `curationEligible` is unchanged.
- No quota, per kind or per reason, anywhere in code or prompt.
- A why-line and a close note pass `cleanWhyLine` and the 200-character `WHY_LINE_CAP`; a pick with a why-line that cleans to empty, or a reason outside the vocabulary, is not applied and is reported.
- `data/picks.yaml` is read by the run and never written by it.
- The calibration figure in the prompt: on the order of 50 to 80 picks, and a similar number of close calls, across an eight-week horizon of about 450 eligible events.
- The reader named in the prompt: a mixed group of friends planning something together.
- `run` does no I/O: file reading stays in `src/research.ts` and the CLIs.
- Commits: the attribution trailer from the session's reminder on every commit; no model identifiers in commit text.

## Review Focus

1. A stored event from before this change with `dontMiss: true` and no `pickReason` must be refused by the schema (so the data migration in Task 7 is forced), and the migration must stamp every such record, expired and unverified ones included. Pinned in Task 1.
2. A model reply with verdict `pick` and reason `none`, or verdict `no` with a reason, must not crash the batch: the event is left unjudged and reported, the rest of the batch applies. Pinned in Task 2.
3. A hand entry for an id that was folded into another record (status expired, `expiryReason: "duplicate"`) must be reported stale with the kept record's id, not applied to the expired record. Pinned in Task 4.
4. Removing an entry must restore the model's last judgment exactly (a close call comes back as a close call, a pick as a pick with its reason and why-line), not leave the event blank. Pinned in Task 4.
5. The report's "Moved this run" must name the cause for a pick lost because the reply flagged it with no why-line (left unjudged, flag dropped), since that is the one way a pick disappears without a judgment. Pinned in Task 5.

---

### Task 1: The event schema carries a reason, a close call and a hand override

**Files:**
- Modify: `src/dataset.ts` (fields after `whyLine`, refines after the don't-miss refine)
- Test: `test/schemas.test.ts`

**Interfaces:**
- Produces: `export const PICK_REASONS = ["rare", "big-name", "occasion", "tradition", "unusual", "major-run"] as const; export type PickReason = (typeof PICK_REASONS)[number];` in `src/dataset.ts`. Event fields: `pickReason?: PickReason`, `closeCall?: true`, `closeNote?: string`, `pickedBy?: "hand"`, `modelJudgment?: { dontMiss: boolean; pickReason?: PickReason; whyLine?: string; closeCall?: true; closeNote?: string }` (a `z.strictObject`). The exported type is `ModelJudgment`.

- [ ] **Step 1: Write the failing tests** in `test/schemas.test.ts`, beside the existing event-schema tests, using that file's event fixture helper:

```ts
it("a pick needs a reason from the vocabulary as well as a why-line", () => {
  expect(() => parseDataset(withEvent({ dontMiss: true, whyLine: "A reason." }))).toThrow(/pickReason/);
  expect(() => parseDataset(withEvent({ dontMiss: true, whyLine: "A reason.", pickReason: "famous" }))).toThrow();
  expect(parseDataset(withEvent({ dontMiss: true, whyLine: "A reason.", pickReason: "big-name" })).events[0]!.pickReason).toBe("big-name");
});
it("a close call carries a note, never a reason, and never sits on a pick or a recurring event", () => {
  expect(() => parseDataset(withEvent({ closeCall: true }))).toThrow(/closeNote/);
  expect(() => parseDataset(withEvent({ closeCall: true, closeNote: "Nearly a tradition.", dontMiss: true, whyLine: "x", pickReason: "rare" }))).toThrow();
  expect(() => parseDataset(withEvent({ recurrence: "recurring", schedule: "Every Tuesday", start: undefined, closeCall: true, closeNote: "n" }))).toThrow();
  expect(() => parseDataset(withEvent({ closeNote: "orphan" }))).toThrow();
});
it("a hand-governed event keeps the model's judgment beside it", () => {
  expect(() => parseDataset(withEvent({ pickedBy: "hand", dontMiss: true, whyLine: "x", pickReason: "rare" }))).toThrow(/modelJudgment/);
  expect(() => parseDataset(withEvent({ modelJudgment: { dontMiss: false } }))).toThrow(/pickedBy/);
  const e = parseDataset(withEvent({ pickedBy: "hand", dontMiss: true, whyLine: "x", pickReason: "rare", modelJudgment: { dontMiss: false, closeCall: true, closeNote: "n" } })).events[0]!;
  expect(e.modelJudgment).toEqual({ dontMiss: false, closeCall: true, closeNote: "n" });
});
```

- [ ] **Step 2: Run them to see them fail**: `pnpm vitest run test/schemas.test.ts`. Expected: the three new tests fail (unknown keys refused by the strict object, or no throw).

- [ ] **Step 3: Add the constants, the fields and the refines in `src/dataset.ts`.** Refines, each with a message naming the field: `dontMiss` true ⇒ `pickReason` present; `pickReason` present ⇒ `dontMiss` true; `closeCall` present ⇔ `closeNote` present; `closeCall` ⇒ not `dontMiss` and not recurring; `pickedBy` present ⇔ `modelJudgment` present. Extend the existing don't-miss refine's message to say a flag needs a why-line and a reason.

- [ ] **Step 4: Run the whole suite and typecheck**: `pnpm test && pnpm typecheck`. Expected: `test/schemas.test.ts` passes; `test/golden.test.ts` and any test with a stored pick fixture may fail on the missing `pickReason`. Fix fixtures in `test/fakes/fixtures.ts` and the tests by adding `pickReason: "rare"` to every fixture event with `dontMiss: true`; do not run the golden update yet (Task 2 changes the reply shape too).

- [ ] **Step 5: Commit**: `git add src/dataset.ts test/schemas.test.ts test/fakes/fixtures.ts` plus any fixed tests; message "Event schema: a pick carries a reason; close calls and hand overrides have fields".

---

### Task 2: Curation answers pick, close or no, with a reason on every pick

**Files:**
- Modify: `src/curation.ts` (judgment schema, `applyJudgment`, `withJudgment`, `withLaterJudgment`, `unflagged`, `cleanStoredWhyLine`, `whyLineOverCap`)
- Modify: `src/run.ts` `curate()` (lines 2403–2471) and `src/report.ts` (curation counts)
- Modify: `test/fakes/fixtures.ts` `judging`, `test/fakes/ports.ts` `nothingFlagged`
- Test: `test/curation.test.ts`

**Interfaces:**
- Consumes: `PICK_REASONS`, `PickReason` from Task 1.
- Produces: `judgmentSchema = z.object({ id, verdict: z.enum(["pick", "close", "no"]), reason: z.enum([...PICK_REASONS, "none"]), why: z.string() })` with `.describe()` on each field saying what the prompt says of it (reason is `none` unless verdict is `pick`; `why` is the why-line on a pick, the note on a close, empty on a no). `type Judgment = z.infer<typeof judgmentSchema>`. `judging(costUsd, ...judgments: Judgment[])` in fixtures. `RunReport["curation"]` gains `close: number` (default 0 in the schema, `countSince`). `export function curationEligible(event): boolean` is exported (the comparison command needs it).

The enum with `"none"` rather than a nullable is chosen because `strictResponseFormat` sends the Zod JSON schema as-is and an enum is the shape every existing call already uses.

- [ ] **Step 1: Write the failing tests** in `test/curation.test.ts` (replace the existing `dontMiss`/`why` scripted replies throughout the file with the new shape; these are the new cases):

```ts
it("a pick is stored with its reason and why-line; a close call with its note; a no with neither", async () => {
  // three one-offs from one page, one judgment each
  ... judging(0.02,
    { id: A, verdict: "pick", reason: "tradition", why: "The city's one holiday market with a season to it." },
    { id: B, verdict: "close", reason: "none", why: "Nearly an occasion, but the page gives no sense of its size." },
    { id: C, verdict: "no", reason: "none", why: "" });
  expect(a).toMatchObject({ dontMiss: true, pickReason: "tradition", whyLine: "The city's one holiday market with a season to it." });
  expect(b).toMatchObject({ dontMiss: false, closeCall: true, closeNote: "Nearly an occasion, but the page gives no sense of its size." });
  expect(b.pickReason).toBeUndefined();
  expect(c).toMatchObject({ dontMiss: false }); expect(c.closeCall).toBeUndefined(); expect(c.closeNote).toBeUndefined();
  expect(report.curation).toMatchObject({ judged: 3, flagged: 1, close: 1 });
});
it("a pick with reason none, or a close with no note, is left unjudged and reported; the rest of the batch applies", ...)
  // expect report.curation.problems to contain `"${title}" was picked with no reason and was left unjudged`
  // and `"${title}" was a close call with no note and was left unjudged`; the other event in the batch is judged.
it("a re-judgment that says no clears a stored close call and its note", ...)
it("a reading that makes a close call recurring drops the close call as it drops a flag", ...)
it("a fold keeps the later judgment, reason and close call included", ...)  // extend the existing #79 fold test
it("a stored pick whose why-line cleans to empty loses its flag and its reason", ...)  // extend the cleanStoredWhyLine test
```

- [ ] **Step 2: Run to see them fail**: `pnpm vitest run test/curation.test.ts`. Expected: FAIL on the reply shape (schema parse) and the missing fields.

- [ ] **Step 3: Implement.** In `src/curation.ts`: the new `judgmentSchema`; `applyJudgment(event, judgment, nowIso, judgedWith)` maps verdict to fields (`pick` → `dontMiss: true, pickReason, whyLine: cleanWhyLine(why)`; `close` → `dontMiss: false, closeCall: true, closeNote: cleanWhyLine(why)`; `no` → `dontMiss: false`), always clearing the other verdict's fields; `withJudgment` takes a `ModelJudgment`-shaped object plus `lastJudged`/`judgedWith`; `withLaterJudgment` copies `pickReason`, `closeCall`, `closeNote` along with the flag; `unflagged` also strips `pickReason`, `closeCall`, `closeNote`; `cleanStoredWhyLine` also cleans `closeNote` and, when a why-line cleans to empty, goes through `unflagged`; `whyLineOverCap(judgment)` is true for a `pick` or `close` whose `why` cleans past the cap. In `curate()` in `src/run.ts`: the two new problem lines above, `report.close` counted like `flagged`. In `src/report.ts`: `close: countSince` in the schema and the type, and the Markdown line becomes "N events judged in M calls, F picked, C close calls." In the fakes: `nothingFlagged` answers `{ id, verdict: "no", reason: "none", why: "" }`.

- [ ] **Step 4: Run the suite and typecheck**: `pnpm test && pnpm typecheck`. Expected: everything but `test/golden.test.ts` passes. Run `pnpm vitest run test/golden.test.ts -u`, then `git diff test/__snapshots__/golden/` and confirm the only changes are the `close: 0` count in the three JSON reports and the "0 close calls" wording in the three Markdown ones (the golden curate fake picks nothing).

- [ ] **Step 5: Commit**: "Curation answers pick, close or no; a pick carries one of six reasons".

---

### Task 3: Batches are formed by kind, then date

**Files:**
- Modify: `src/run.ts` `curate()` (the `due` list)
- Test: `test/curation.test.ts`

- [ ] **Step 1: Write the failing test**: two pages' worth of one-offs of three kinds and mixed dates in one run, over 25 events so there are two batches; assert that the ids in the first request's user message come in kind order (kinds sorted as strings) and, within a kind, by `start` ascending with an undated event last, and that the second batch continues the same ordering.

- [ ] **Step 2: Run to see it fail**: `pnpm vitest run test/curation.test.ts -t "kind, then date"`. Expected: FAIL, order is dataset order.

- [ ] **Step 3: Implement**: `const due = events.filter(...).sort(byKindThenDate)` with `byKindThenDate(a, b)`: `a.kind.localeCompare(b.kind) || (a.start ?? "￿").localeCompare(b.start ?? "￿") || a.id.localeCompare(b.id)`, as a named function beside `curate` with a one-line comment citing the spec's reason.

- [ ] **Step 4: Run tests**: `pnpm vitest run test/curation.test.ts test/golden.test.ts`. Expected: PASS (the golden fake answers by id, so order does not change its snapshots).

- [ ] **Step 5: Commit**: "Curation batches are formed by kind, then date".

---

### Task 4: Hand overrides from `data/picks.yaml`

**Files:**
- Create: `src/hand-picks.ts`
- Modify: `src/run.ts` (`RunInput.handPicks?`, the pass after `curate` and before `readPicks`), `src/research.ts` (read `data/picks.yaml` when present), `src/report.ts` (`curation.handPicks`)
- Create: `data/picks.yaml` (a comment header and an empty list)
- Test: `test/hand-picks.test.ts`, `test/research.test.ts`

**Interfaces:**
- Consumes: `PICK_REASONS`, `ModelJudgment` (Task 1); `cleanWhyLine`, `WHY_LINE_CAP`, `unflagged` (Task 2).
- Produces, in `src/hand-picks.ts`:
  - `export const handPickSchema`: a `z.discriminatedUnion("pick", [...])` of `{ id: string, title: string, pick: true, reason: z.enum(PICK_REASONS), why: string }` (why refined: non-empty after `cleanWhyLine`, at most `WHY_LINE_CAP`) and `{ id, title, pick: false }`; `export const handPicksSchema = z.array(handPickSchema)`; `export type HandPick`.
  - `export function parseHandPicks(raw: unknown): HandPick[]` (a `null` or `undefined` file body is `[]`).
  - `export function applyHandPicks(events: Event[], picks: HandPick[], nowIso: string): { events: Event[]; report: HandPicksReport }` where `HandPicksReport = { applied: number; stale: { id: string; title: string; note: string }[]; changed: { id: string; title: string }[] }`.
  - `RunInput.handPicks?: HandPick[]` (default `[]`); `RunReport["curation"]["handPicks"]: HandPicksReport` with a schema default of `{ applied: 0, stale: [], changed: [] }`.

Rules `applyHandPicks` implements (from the spec): an entry matches the active event with its id; a `pick: true` entry sets `dontMiss: true, pickReason, whyLine: cleanWhyLine(why)`, clears `closeCall`/`closeNote`, sets `pickedBy: "hand"`; a `pick: false` entry sets the fields of `unflagged`, and `pickedBy: "hand"`. `modelJudgment` is captured from the event's fields as they stand when the event is not yet hand-governed or was judged this run (`lastJudged === nowIso`), otherwise kept as stored. An event with `pickedBy: "hand"` and no entry gets its `modelJudgment` fields back and loses `pickedBy` and `modelJudgment`. Stale entries, each with a note: no event with that id ("no such event"); the event is not active ("expired", "unverified", with the status); the event is expired as a duplicate ("folded into <duplicateOf>"); the event's title does not contain the entry's title under `normalizeName` from `src/identity.ts` ("title now <event title>"). A stale entry is not applied. `changed` lists hand-governed events whose `lastChanged === nowIso`.

- [ ] **Step 1: Write the failing unit tests** in `test/hand-picks.test.ts` against `applyHandPicks` with hand-built events (the fixture helper from `test/fakes/fixtures.ts`), one per rule above, including: a hand pick over a model close call keeps `modelJudgment: { dontMiss: false, closeCall: true, closeNote }` and removing the entry restores exactly those fields; an entry for an event expired as duplicate is stale with "folded into <id>" and the expired record is untouched; a `pick: true` entry with a why-line of 201 characters is refused by `parseHandPicks`.

- [ ] **Step 2: Write the failing run-level test** in the same file: a run with a scripted model pick on event A and a `handPicks` list un-picking A and picking B (a `no` from the model), asserting A ends `dontMiss: false, pickedBy: "hand", modelJudgment.dontMiss === true`, B ends a pick with the hand reason and why-line, `report.curation.handPicks.applied === 2`, and B's own page is read by `readPicks` (its fetch appears in the fake's calls), since the pass runs before it.

- [ ] **Step 3: Write the failing research test** in `test/research.test.ts`: a temp root with a `data/picks.yaml` naming a reason outside the vocabulary makes `research()` throw before writing (no `data/events.json` change, no report), with the message naming `data/picks.yaml`; a root with no `data/picks.yaml` runs as before.

- [ ] **Step 4: Run to see them fail**: `pnpm vitest run test/hand-picks.test.ts test/research.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 5: Implement** `src/hand-picks.ts`; in `src/run.ts` the pass `const overridden = applyHandPicks(curation.events, handPicks, startedIso)` between `curate` and `readPicks`, with `readPicks` and everything after reading `overridden.events`, and `handPicks: overridden.report` in the report's `curation`; in `src/research.ts`, beside the registry read, `const handPicks = existsSync(picksPath) ? parseHandPicks(parseYaml(await readFile(picksPath, "utf8"))) : []` with a Zod error rethrown as `new Error("data/picks.yaml does not parse; nothing was written", { cause })`. Create `data/picks.yaml` with the spec's comment header and `[]`.

- [ ] **Step 6: Run the suite and typecheck**: `pnpm test && pnpm typecheck`. Expected: PASS; golden JSON reports gain the `handPicks` default, accepted with `-u` after reading the diff.

- [ ] **Step 7: Commit**: "Hand picks and un-picks from data/picks.yaml, applied after curation".

---

### Task 5: The report lists picks, close calls, what moved, and the hand picks

**Files:**
- Create: `src/picks-report.ts`
- Modify: `src/report.ts` (type, schema, Markdown), `src/run.ts` (fill the new fields after the hand-picks pass)
- Test: `test/picks-report.test.ts`, `test/report.test.ts`

**Interfaces:**
- Consumes: `horizonEnd` from `src/time.ts`; `isPast` from `src/expiry.ts`; `calendarDate` from `src/identity.ts`.
- Produces, in `src/picks-report.ts`:
  - `export type PickLine = { id: string; title: string; venue: string; kind: string; start?: string; end?: string; primaryUrl: string; reason: PickReason; whyLine: string; marks: ("new" | "hand")[] }`
  - `export type CloseLine = Omit<PickLine, "reason" | "whyLine"> & { closeNote: string }`
  - `export type PickMove = { id: string; title: string; primaryUrl: string; from: "pick" | "close" | "no"; to: "pick" | "close" | "no"; cause: "new event" | "re-judged after a change" | "re-judged under a new prompt" | "hand pick" | "hand un-pick" | "hand entry removed" | "expired" | "left unjudged" | "made recurring" }`
  - `export function picksInHorizon(events, today, horizonWeeks, previous): PickLine[]` (active, `dontMiss`, not `isPast`, `calendarDate(start ?? end) <= horizonEnd`, soonest first; `new` when the previous record was not a pick, `hand` when `pickedBy`)
  - `export function closeCallsInHorizon(events, today, horizonWeeks): CloseLine[]`
  - `export function pickMoves(previous: Event[], events: Event[], nowIso: string): PickMove[]` (every event whose standing, pick, close or no, changed; the cause by this order of tests: not in previous → `new event`; `pickedBy` now and not before → `hand pick`/`hand un-pick` by the new standing; `pickedBy` before and not now → `hand entry removed`; expired now → `expired`; recurring now and not before → `made recurring`; `lastJudged === nowIso` and `lastChanged === nowIso` → `re-judged after a change`; `lastJudged === nowIso` → `re-judged under a new prompt`; otherwise `left unjudged`)
  - `export function countBy(lines: PickLine[], key: "kind" | "reason"): { name: string; count: number }[]` most first, then by name.
  - `RunReport["curation"]` gains `picks: PickLine[]`, `closeCalls: CloseLine[]`, `moved: PickMove[]`, `byKind`, `byReason` (all `listSince`).

- [ ] **Step 1: Write the failing unit tests** in `test/picks-report.test.ts` for each function with hand-built events: a pick after the horizon is left out; a pick that started before today and has not ended is in; each `cause` in `pickMoves` from a previous/now pair, including `left unjudged` (previous pick, now `dontMiss: false` with `lastJudged` unchanged) and `made recurring`; `countBy` order.

- [ ] **Step 2: Write the failing rendering test** in `test/report.test.ts`: a report with one pick, one close call, two moves and one stale hand entry renders, under `## Curation`, the headings `### Picks`, `### Close calls`, `### Moved this run`, `### Hand picks`; the picks summary line `By kind: music 1. By reason: rare 1.`; a pick line of the exact form `- 2026-11-07 Stewart Copeland at The Granada [rare]: The Police's drummer on a one-night stop. (new, hand)`; a close line with its note; a move line `- Twin Peaks: Conversation with the Stars: pick → no (re-judged under a new prompt)`; and a stale entry line `- evt_x "Electric Poe": no such event`. An empty list renders `_None._` as the other sections do.

- [ ] **Step 3: Run to see them fail**: `pnpm vitest run test/picks-report.test.ts test/report.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implement** `src/picks-report.ts`, the report type and schema, the Markdown in `renderReportMarkdown` after the counts line (a limited run's date is `start–end` as the existing `eventList` formats spans; reuse it), and in `src/run.ts` fill the fields from the final `events` (after `cleanStoredWhyLine`) against `dataset.events`.

- [ ] **Step 5: Run the suite and typecheck**: `pnpm test && pnpm typecheck`; golden snapshots gain the four empty sections, accepted with `-u` after reading the diff.

- [ ] **Step 6: Commit**: "Report lists picks, close calls, what moved, and the hand picks".

---

### Task 6: `pnpm compare-curation` measures a prompt's repeatability

**Files:**
- Create: `src/curation-compare.ts`, `src/curation-compare-cli.ts`
- Modify: `package.json` (`"compare-curation": "tsx src/curation-compare-cli.ts"`), `.gitignore` comment (the `.cache/` line already covers it)
- Create on first run: `docs/curation-comparison/<date>.md`
- Test: `test/curation-compare.test.ts`

**Interfaces:**
- Consumes: `buildCurationRequest`, `curationReplySchema`, `curationEligible`, `promptHash`, `CURATION_BATCH_SIZE` (Task 2); `capSpend`, `SpendCapReached` from `src/spend.ts`; `createOpenRouterModel`, `realAdapters` pattern from `src/model-compare-cli.ts`; `parseDataset`, `parseConfig`.
- Produces, in `src/curation-compare.ts`:
  - `export interface CurationTrial { prompt: "current" | "candidate"; repeat: number; id: string; verdict: "pick" | "close" | "no"; reason: PickReason | "none"; why: string; costUsd: number }`
  - `export function sampleEligible(events: Event[], n: number | undefined, seed: string): Event[]` (every eligible event when `n` is undefined; otherwise the first `n` after sorting by `sha256(seed + id)`, so the same ids are drawn each time for a seed)
  - `export interface RepeatScore { prompt: "current" | "candidate"; events: number; repeats: number; flipped: number; flipRate: number; byMajorityReason: { reason: string; events: number; flipped: number }[]; pickRate: number; picksPerHorizon: number; agreementWithStored: { same: number; storedPickNowNot: number; nowPickStoredNot: number } ; costUsd: number }` where `picksPerHorizon = majority picks` (the calibration figure to compare against is 50 to 80) and `agreementWithStored` compares the majority verdict with the stored `dontMiss` (a stored flag is a pick; close counts as not a pick).
  - `export function scoreRepeats(trials: CurationTrial[], dataset: Event[]): RepeatScore[]`
  - `export function promptDiff(trials: CurationTrial[], events: Event[]): { id: string; title: string; from: string; to: string; fromWhy: string; toWhy: string }[]` (events whose majority verdict or reason differs between `current` and `candidate`)
  - `export function renderCurationComparison(scores: RepeatScore[], diff: ReturnType<typeof promptDiff>, meta: { date: string; model: string; currentHash: string; candidateHash?: string; sample: number; minutes: number }): string`

CLI: `pnpm compare-curation [--repeats 3] [--prompt path] [--sample N] [--seed s] [--cap 8] [--tag name] [--fresh]`. It reads `research.config.yaml`, `data/events.json` and `prompts/curation-prompt.md`; with `--prompt`, the candidate file too, and runs both prompts. Trials append to `.cache/curation-compare/<date>[-<tag>]/trials.jsonl` as they land and a rerun the same day skips trials already there unless `--fresh`, as `compare-models` does. The model is `config.models.curation` through `capSpend` at `--cap`; a `SpendCapReached` ends the trials and the report says how many were made. Output `docs/curation-comparison/<date>[-<tag>].md`.

- [ ] **Step 1: Write the failing tests** in `test/curation-compare.test.ts` with fabricated trials: `sampleEligible` draws the same ids for the same seed and leaves out recurring and non-active events; `scoreRepeats` on three repeats where one event of four flips gives `flipRate` 0.25 and the right `byMajorityReason` and `agreementWithStored` against a dataset where one of the four is a stored pick; `promptDiff` lists the one event whose majority moved; `renderCurationComparison` contains the flip rate as a percentage, the pick count against "50 to 80", and the diff table.

- [ ] **Step 2: Run to see them fail**: `pnpm vitest run test/curation-compare.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** both files, the CLI on the pattern of `src/model-compare-cli.ts` (`parseArgs`, `.env` loading through the same helper `src/cli.ts` uses, trials appended per batch, batches formed with the Task 3 ordering so the measure matches the run).

- [ ] **Step 4: Run tests and typecheck**: `pnpm test && pnpm typecheck`. Expected: PASS. Then a dry call of the CLI with `--sample 2 --repeats 1 --cap 0.2` against the real key from the gitignored `.env` (copied from the main checkout) and confirm a report file appears and the trials file has two lines; delete that report before committing.

- [ ] **Step 5: Commit**: "pnpm compare-curation: repeatability and stored agreement of a curation prompt".

---

### Task 7: The prompt, the data migration, the ADR and the docs

This task is written by the session model, not a subagent: the prompt is one of the two editorial surfaces the proposal names as a Fable stage.

**Files:**
- Modify: `prompts/curation-prompt.md`
- Modify: `data/events.json` (stamp `pickReason: "rare"` on every record with `dontMiss: true`)
- Create: `docs/adr/0014-picks-carry-a-named-reason.md`
- Modify: `docs/adr/0005-curation-spine-is-scarcity-of-occurrence.md` (an "Amended (#<issue>)" paragraph pointing at 0014), `AGENTS.md` (the editorial-surfaces paragraph, a `pnpm compare-curation` command line, the `data/picks.yaml` file, the convention that a prompt edit lands with its comparison report), `CONTEXT.md` (the terms pick, close call, reason, hand pick)
- Create: `docs/curation-comparison/<date>.md` from a real run of the command

- [ ] **Step 1: Stamp the stored picks**: a one-off `node -e` over `data/events.json` that sets `pickReason: "rare"` on every event with `dontMiss === true`, writing with two-space indentation and a trailing newline as the run does; then `pnpm vitest run test/committed-files.test.ts` and `pnpm typecheck`. Expected: PASS (the committed dataset parses under the new schema). Commit: "Stored picks carry the reason rare, which all of them were".

- [ ] **Step 2: Rewrite `prompts/curation-prompt.md`** keeping its frame (editor, one structural idea, fields are data, judge each event alone, strong default of no, the why-line section, the output section) and replacing the question with the vocabulary: the reader is a mixed group of friends planning something together; the question is whether someone in that group would bring this up, and why; the answer is `pick` under one of the six reasons, `close`, or `no`. One paragraph per reason with its claim, its test and its "does not pass" from the spec's table, with two or three examples of a yes drawn from real events in `data/events.json` and one of a no. The close verdict's paragraph: which reason it nearly met and what was missing, one sentence, same rules as a why-line. The calibration paragraph with the spec's figure. The evidence adjustment: the why-line may state the reason's claim in its own terms and still makes no specific historical or biographical claim the description does not state; a why-line that only restates the reason word is not one. The output paragraph names the new fields (`verdict`, `reason` `none` unless a pick, `why`).

- [ ] **Step 3: Run the comparison from the branch**: `pnpm compare-curation --repeats 3 --cap 8` (the current prompt is now the new one; stored judgments are the old prompt's, so "agreement with stored" is what the new prompt moves). Read `docs/curation-comparison/<date>.md`: the flip rate, the pick count against 50 to 80, the kind split of the majority picks (count by hand from the diff table, or add it to the renderer if missing). If the flip rate is over one in ten or the pick count is outside the figure by more than half, tighten the reasons' tests in the prompt and run again with `--tag second`. Commit the prompt with the report: "Curation prompt: six reasons, a close verdict, and its comparison report".

- [ ] **Step 4: Write ADR 0014** (two paragraphs: the decision and the alternatives, in the voice of the other ADRs), amend ADR 0005, update `AGENTS.md` and `CONTEXT.md`. Commit: "ADR 0014: picks carry a named reason; docs for compare-curation and data/picks.yaml".

- [ ] **Step 5: Full check**: `pnpm -r test && pnpm -r typecheck` and `SITE_ALLOW_SMALL=1 pnpm --filter kc-events-site build` (the site must still build from the stamped dataset, dropping the new fields). Expected: PASS.

---

### Task 8: Review and land

- [ ] **Step 1**: Code review of the branch against `origin/main` with the project's review flow; fix-up commit for findings.
- [ ] **Step 2**: `git fetch origin main && git rebase origin/main`, `pnpm test && pnpm typecheck`, then `git push origin HEAD:main` (serial lane).
- [ ] **Step 3**: Close the ticket; on the open post-run-check issue (#265), add boxes for the first weekly run after landing: every eligible event re-judged once (the report's `rejudgedForPrompt`), the Picks section lists picks across more than four kinds, the Close calls section is non-empty, the Moved section names a cause on every line, and `data/picks.yaml` entries Evan writes after reading it apply on the following run.
- [ ] **Step 4**: Pull the home clone by hand before Monday's cron (the clone updates only at a run) so the run uses the new prompt, or let the cron's reset to `origin/main` do it.
- [ ] **Step 5**: Open the site ticket: `project()` passes `pickReason` through, and the design pass on how a reason shows on the card.
