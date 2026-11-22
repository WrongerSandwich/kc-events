# How It Works Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The private run explainer becomes a public, prerendered page at `/about/how-it-works`: nine sections with their diagrams, figures generated at build, linked from About.

**Architecture:** The site's generate step gains one module, `src/generated/how-it-works.ts`, holding the config's settings, the newest weekly run report's figures, and the constants and schedule the page states (literals in the site, each held to the job's code or scripts by a unit test). One Astro page composes nine section components and three shared diagram components; all diagram CSS is one linked stylesheet with `how-` prefixed classes, so the later Deco pass edits one file. No island and no script.

**Tech Stack:** Astro 5 (static, `build.format: "file"`), TypeScript, vitest (project `unit`), Playwright with axe, the job's `parseRunReport` and `parseConfig`.

**Spec:** `docs/superpowers/specs/2026-11-22-how-it-works-page-design.md`. Read it first; it holds the section-by-section content decisions, and this plan does not repeat them.

**Source to adapt:** `git show origin/docs-run-explainer:docs/explainers/how-a-run-works.html` (save it to the scratchpad for reference; never commit it to this branch). "Artifact n" below is its section n.

## Global Constraints

- Work in this worktree (`.claude/worktrees/how-it-works-page`, branch `worktree-how-it-works-page`); `pnpm install --frozen-lockfile` once. Lands as a pull request; Evan merges.
- Voice: no "we", "our", "you", "your"; no exclamation marks; headings are nouns; numbers up to twelve in running prose are words, figures stay figures in diagrams, tables, measures and money.
- Cut everywhere: commit hashes, ticket numbers, cron syntax, local paths, alert services' names, tokens, labels, worktrees, `pnpm` commands.
- Colour: the only new hues are the diagrams' role tokens, defined in `site/src/styles/how-it-works.css`, never in `tokens.css`, used only inside figures and the key. Each role is a shade on its own tint at the kinds' values: light `oklch(0.47 0.14 H)` on `oklch(0.945 0.045 H)`, dark `oklch(0.82 0.11 H)` on `oklch(0.31 0.06 H)`. No role uses hue 27 (the pick's carmine). Every role and outcome is also named in text.
- The display face sets the page's `h1` and section headings only.
- No script on the page, no inline `<style>`: the stylesheet must be emitted as a linked file. `pnpm size` passes with the `index.html`, `explore.html` and `404.html` budgets unchanged.
- The generate step gains no new runtime import from the job's `src/` beyond `parseRunReport` (already imported by `site/src/build/changes.ts`) and what `load-dataset.ts` already imports. Constants are literals held by tests.
- The page reads only `src/generated/how-it-works.ts`, `siteConfig` and static content. It does not read `data/registry.yaml`.
- Match the surrounding code's comment density and naming. Commit messages follow the repository's sentence style and end with `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Review Focus

1. **A weekly report from before model calls recorded a stage, or with no `modelCalls` or `sources` at all** (the e2e fixture is one): the build does not throw, the strip shows what the report has, and the spend bar is left out. Test in Task 1.
2. **A run that spent nothing, or a stage whose share is a fraction of a percent:** no `NaN` width, no zero-width bar segment that hides a stage. Test in Task 1.
3. **A run of under a minute or over an hour:** reads "1 min" and "1 h 12 min", never "0 min" or "72 min". Test in Task 1.
4. **Files in `runs/` that are not reports** (`.md` twins, a `.failed.json`, a midweek report newer than the weekly one): ignored, and the Monday report is still found. Test in Task 1.
5. **A reader on a phone or a keyboard, or in forced colours:** every sideways-scrolling figure is a labelled, focusable region; every role tag has words. Test in Task 3.

## File Structure

| File | Responsibility |
| --- | --- |
| `site/src/lib/how-it-works.ts` (create) | Client-safe types, role names, stage names, and formatting: money, duration, a run's day, a cron line's day and time, bar shares. No clock, no imports from build or the job. |
| `site/src/build/how-it-works.ts` (create) | Build only: find the newest weekly report, derive `RunFigures`, the `CONSTANTS` and `SCHEDULE` literals, assemble `PublishedHowItWorks`. |
| `site/src/lib/types.ts` (modify) | `RunFigures`, `PublishedHowItWorks`; `Published` gains `howItWorks`. |
| `site/src/build/load-dataset.ts`, `write-generated.ts` (modify) | Return and write the new module. |
| `site/src/styles/how-it-works.css` (create) | All of the page's diagram and layout CSS, `how-` prefixed. |
| `site/src/components/how/Figure.astro`, `RoleTag.astro`, `Ladder.astro` (create) | The three shapes used by more than one section. |
| `site/src/components/how/sections/*.astro` (create, nine) | One section each: heading, prose, figure. |
| `site/src/pages/about/how-it-works.astro` (create) | The shell: way back, heading, lede, strip, contents, key, the nine sections, foot. |
| `site/test/how-it-works*.test.ts`, `site/e2e/how-it-works.spec.ts` (create) | Unit and end-to-end tests. |

---

### Task 1: Run figures and their formatting

**Files:**
- Create: `site/src/lib/how-it-works.ts`, `site/src/build/how-it-works.ts`
- Modify: `site/src/lib/types.ts`
- Test: `site/test/how-it-works.test.ts`, `site/test/how-it-works-build.test.ts`

**Interfaces:**
- Produces, in `lib/types.ts`:

```ts
export type RunFigures = {
  runDate: string; // the report's runDate, YYYY-MM-DD
  minutes: number; // startedAt to finishedAt, rounded, at least 1
  sourcesTried: number; // sources whose result is not "excluded"
  sourcesFailed: number; // result "failed" or "blocked"
  found: number; new: number; updated: number; // the report's counts
  modelCalls: number; modelCallsFailed: number; // a call with `error` failed
  spendUsd: number; capUsd: number;
  /** Stages that made a call, most spend first; empty when the report lists no call with a stage. */
  stages: { stage: string; calls: number; usd: number }[];
};
```

- Produces, in `build/how-it-works.ts`: `readWeeklyReport(datasetPath: string, lastSuccessfulRun: string): RunReport | undefined` and `runFigures(report: RunReport): RunFigures`.
- Produces, in `lib/how-it-works.ts`: `usd(n: number): string`, `duration(minutes: number): string`, `runDay(runDate: string): string`, `cronWhen(expr: string): { days: string; time: string }`, `barShares(stages: RunFigures["stages"]): { stage: string; calls: number; usd: number; share: number }[]`, `STAGE_NAMES: Record<string, string>` (`extraction` "Reading list pages", `discovery` "Discovery", `reverification` "Re-verification", `own-page` "Own pages", `ticket-page` "Ticket pages", `curation` "Curation").

- [ ] **Step 1: Write the failing formatting tests** in `site/test/how-it-works.test.ts`:

```ts
expect(usd(0.6856934849999999)).toBe("$0.69");
expect(usd(0)).toBe("$0.00");
expect(usd(0.004)).toBe("under $0.01");
expect(usd(5)).toBe("$5.00");
expect(duration(23)).toBe("23 min");
expect(duration(1)).toBe("1 min");
expect(duration(60)).toBe("1 h");
expect(duration(72)).toBe("1 h 12 min");
expect(runDay("2026-11-16")).toBe("November 16");
expect(cronWhen("17 6 * * 1")).toEqual({ days: "Mondays", time: "6:17 a.m." });
expect(cronWhen("17 6 * * 4")).toEqual({ days: "Thursdays", time: "6:17 a.m." });
expect(cronWhen("5 0 * * *")).toEqual({ days: "every day", time: "12:05 a.m." });
// shares are whole percents that sum to 100; a stage that spent anything gets at least 2
const shares = barShares([{ stage: "curation", calls: 9, usd: 0.3 }, { stage: "extraction", calls: 136, usd: 0.24 }, { stage: "own-page", calls: 229, usd: 0.14 }, { stage: "reverification", calls: 2, usd: 0.005 }]);
expect(shares.map((s) => s.share).reduce((a, b) => a + b)).toBe(100);
expect(shares.at(-1)!.share).toBeGreaterThanOrEqual(2);
expect(barShares([{ stage: "curation", calls: 1, usd: 0 }])).toEqual([]); // nothing spent: no bar
expect(barShares([])).toEqual([]);
```

- [ ] **Step 2: Run them to see them fail.** `pnpm --filter kc-events-site exec vitest run --project unit test/how-it-works.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `lib/how-it-works.ts`.** `runDay` uses the helpers in `lib/dates.ts` if one formats a month and day; it must not read the clock (`test/greps.test.ts` enforces that for `lib/`).
- [ ] **Step 4: Run them to see them pass.**
- [ ] **Step 5: Write the failing build tests** in `site/test/how-it-works-build.test.ts` (`// @vitest-environment node`, `tempDir` from `test/fixtures/temp-dir`). Write report files into `<dir>/runs/` beside a dataset path and assert:
  - with `2026-11-16.json` (`mode: "weekly"`) and `2026-11-19.json` (`mode: "reverify-only"`), `readWeeklyReport(datasetPath, "2026-11-19T06:25:00-06:00")?.runDate` is `"2026-11-16"`;
  - a report with no `mode` counts as weekly (`parseRunReport`'s default);
  - a weekly report dated after `lastSuccessfulRun`'s local day is not chosen;
  - `2026-11-16.md` and `2026-11-23.failed.json` in the directory are never opened (give them contents that are not JSON);
  - no `runs` directory, or an empty one: `undefined`;
  - `runFigures` on a report with `startedAt: "2026-11-16T06:17:06-06:00"`, `finishedAt: "2026-11-16T06:40:27-06:00"`, sources `fetched, fetched, failed, blocked, excluded`, and four model calls (`extraction` 0.10, `extraction` 0.14, `curation` 0.30, and a `curation` call with `error` and no cost): `minutes` 23, `sourcesTried` 4, `sourcesFailed` 2, `modelCalls` 4, `modelCallsFailed` 1, `stages` `[{ stage: "curation", calls: 2, usd: 0.3 }, { stage: "extraction", calls: 2, usd: 0.24 }]` (compare `usd` with `toBeCloseTo`);
  - `runFigures` on `site/e2e/fixtures/runs/2026-10-05.json` as it stands (no `sources`, no `modelCalls`): does not throw, `stages` is `[]`, `modelCalls` 0;
  - a call with no `stage` (a report from before stages were recorded) is counted in `modelCalls` and left out of `stages`.
- [ ] **Step 6: Run to see them fail, then implement `build/how-it-works.ts`.** `readWeeklyReport` lists `runs/`, keeps names matching `^\d{4}-\d{2}-\d{2}\.json$` on or before `localDate(lastSuccessfulRun)`, newest first, and returns the first whose parsed `mode` is `"weekly"`; a report file that does not parse throws, as `readRunChanges` lets it. Build a minimal valid report for the tests from the e2e fixture's JSON rather than by hand.
- [ ] **Step 7: Run both test files to see them pass**, then `pnpm --filter kc-events-site typecheck`.
- [ ] **Step 8: Commit** ("How it works: a weekly report's figures, and how they are written out").

### Task 2: Settings, constants and schedule in a generated module

**Files:**
- Modify: `site/src/build/how-it-works.ts`, `site/src/build/load-dataset.ts`, `site/src/build/write-generated.ts`, `site/src/lib/types.ts`, `site/e2e/fixtures/runs/2026-10-05.json`
- Modify (add `export` only): `src/expiry.ts` (`STRIKES_TO_EXPIRE`, `RUNS_TO_STALE`, `OUTAGES_TO_UNVERIFY`, `HORIZON_SLACK_DAYS`), `src/identity.ts` (`FUZZY_DATE_WINDOW_DAYS`), `src/run.ts` (`FAILING_SOURCE_THRESHOLD`, `EMPTY_READING_GUARD`)
- Test: `site/test/how-it-works-constants.test.ts`, `site/test/generate.test.ts`

**Interfaces:**
- Consumes: `readWeeklyReport`, `runFigures`, `RunFigures` (Task 1).
- Produces, in `build/how-it-works.ts`:

```ts
export const CONSTANTS = {
  strikesToExpire: 2, outagesToUnverify: 3, runsToStale: 4, horizonSlackDays: 2,
  fuzzyDateWindowDays: 3, failingSourceRuns: 3, emptyReadingGuard: 3, reverifyDays: 10,
  archiveAfterWeeks: 8, curationBatchSize: 25, whyLineCap: 200, maxPageChars: 70_000,
  maxBodyBytes: 5_000_000, defaultCrawlDelayMs: 1_000, maxCrawlDelayMs: 10_000,
  calibrationLow: 25, calibrationHigh: 35, minPublished: 50, staleAfterDays: 9,
} as const;
export const SCHEDULE = { weeklyCron: "17 6 * * 1", midweekCron: "17 6 * * 4", deployCron: "5 0 * * *", runTimeoutMinutes: 90, deployWaitMinutes: 15 } as const;
export function howItWorks(opts: { config: RunConfig; datasetPath: string; lastSuccessfulRun: string; activeEvents: number; picks: number }): PublishedHowItWorks;
```

- Produces, in `lib/types.ts`:

```ts
export type PublishedHowItWorks = {
  settings: { horizonWeeks: number; spendCapUsd: number; extractionReads: number; concurrency: number; ownPageReadsPerRun: number; extractionModel: string; curationModel: string; discoveryCadence: string; discoveryResultsPerQuery: number; kinds: number };
  constants: HowItWorksConstants; // Record<the nineteen keys of CONSTANTS above, number>, declared in types.ts (lib must not import build); CONSTANTS is written `satisfies HowItWorksConstants`
  schedule: { weeklyCron: string; midweekCron: string; deployCron: string; runTimeoutMinutes: number; deployWaitMinutes: number };
  counts: { activeEvents: number; picks: number };
  run?: RunFigures; // absent when no weekly report was found
};
```

- Produces: `src/generated/how-it-works.ts` exporting `howItWorks: PublishedHowItWorks`.

- [ ] **Step 1: Write the failing constants test** in `site/test/how-it-works-constants.test.ts` (`// @vitest-environment node`). One `expect` per key of `CONSTANTS` against the job's export: `STRIKES_TO_EXPIRE`, `OUTAGES_TO_UNVERIFY`, `RUNS_TO_STALE`, `HORIZON_SLACK_DAYS` (`src/expiry`), `FUZZY_DATE_WINDOW_DAYS` (`src/identity`), `FAILING_SOURCE_THRESHOLD`, `EMPTY_READING_GUARD` (`src/run`), `ARCHIVE_AFTER_WEEKS` (`src/archive`), `CURATION_BATCH_SIZE`, `WHY_LINE_CAP` (`src/curation`), `MAX_PAGE_CHARS` (`src/extraction`), `MAX_BODY_BYTES`, `DEFAULT_CRAWL_DELAY_MS`, `MAX_CRAWL_DELAY_MS` (`src/adapters/fetch-policy`), `CALIBRATION.low` and `.high` (`src/curation-compare`), `MIN_PUBLISHED` (`site/src/build/load-dataset`), `siteConfig.staleAfterDays`. `reverifyDays` is read from the text of `src/research.ts` (`/const REVERIFY_DAYS = (\d+);/`), since importing that module loads the network adapters. Then the schedule, read from the scripts' text at the repository root: `scripts/home-run-setup.sh` contains `CRON_SCHEDULE="17 6 * * 1"`, `MIDWEEK_SCHEDULE="17 6 * * 4"` and `DEPLOY_SCHEDULE="5 0 * * *"` (build each expected line from `SCHEDULE`); `scripts/weekly-run.sh` contains `timeout -k 2m ${SCHEDULE.runTimeoutMinutes}m pnpm research`; `scripts/deploy-checks.sh` contains `VERCEL_WAIT_SECONDS:-${SCHEDULE.deployWaitMinutes * 60}`. A last test asserts every key of `CONSTANTS` was checked (keep a set of checked keys and compare with `Object.keys(CONSTANTS)`), so a constant added later cannot go unheld.
- [ ] **Step 2: Run to see it fail** (the job's constants are not exported yet), add the seven `export`s, add `CONSTANTS` and `SCHEDULE`, run to see it pass. Then from the repository root: `pnpm typecheck && pnpm vitest run test/import-order.test.ts` (the job's own suite; an `export` must not change import order).
- [ ] **Step 3: Write the failing generate test**, added to `site/test/generate.test.ts`: with a `runs/2026-10-05.json` weekly report beside the dataset, `exported(join(outDir, "how-it-works.ts"))` has `settings.horizonWeeks` equal to the fixture config's, `settings.extractionModel` and `curationModel` the fixture config's, `counts` `{ activeEvents: 2, picks: 1 }` for the first test's four-event dataset, `constants.strikesToExpire` 2, and `run.runDate` `"2026-10-05"`; with no `runs` directory, `run` is absent and the module is still written. Update the first test's name ("writes four modules") only if it no longer tells the truth.
- [ ] **Step 4: Implement.** `howItWorks()` assembles the object; `loadPublished` calls it once `events` is known (`picks` is the published events with `dontMiss`) and returns it as `howItWorks`; `writeGenerated` destructures it out of `meta` and writes the module with the same header as the others; the doc comment at the top of `write-generated.ts` counts eight modules. `Published` in `types.ts` gains the field.
- [ ] **Step 5: Give the e2e fixture report something to show.** In `site/e2e/fixtures/runs/2026-10-05.json` add `"mode": "weekly"`, a `sources` array of five (three `fetched`, one `failed`, one `excluded`), `spend.totalUsd: 0.42`, and `spend.modelCalls` of six calls across `extraction`, `own-page` and `curation` summing to 0.42, one of them with an `error`. Check `parseRunReport` accepts it by running the build tests, and that `pnpm --filter kc-events-site build:e2e` still succeeds.
- [ ] **Step 6: Run** `pnpm --filter kc-events-site test` and `pnpm --filter kc-events-site typecheck`. Expected: all pass.
- [ ] **Step 7: Commit** ("How it works: the settings, constants and schedule the page states, each held to the code").

### Task 3: The page's shell, stylesheet and shared components

**Files:**
- Create: `site/src/pages/about/how-it-works.astro`, `site/src/styles/how-it-works.css`, `site/src/components/how/Figure.astro`, `RoleTag.astro`, `Ladder.astro`
- Modify: `site/DESIGN.md`, `site/src/lib/how-it-works.ts`, `site/e2e/a11y.spec.ts`, `site/e2e/site.spec.ts` (the two path lists)
- Test: `site/e2e/how-it-works.spec.ts`

**Interfaces:**
- Consumes: `howItWorks` from `src/generated/how-it-works`, the formatters and `STAGE_NAMES` (Task 1).
- Produces, in `lib/how-it-works.ts`: `export type Role = "network" | "extraction" | "curation" | "code" | "hand"`, `export type Tone = Role | "data" | "warn" | "plain"`, `ROLE_NAMES: Record<Role, string>` ("Network", "Extraction model", "Curation model", "Code", "By hand").
- Produces: `<Figure caption? scroll?>` (default slot the diagram; `caption` a string or a `caption` slot; `scroll`, when given, wraps the diagram in `<div class="how-scroll" role="region" tabindex="0" aria-label={scroll}>`); `<RoleTag role />` rendering `<span class="how-role how-tone-{role}">{ROLE_NAMES[role]}</span>`; `<Ladder rungs end yes? no? />` with `rungs: { q: string; note?: string; a: string; tone: Tone }[]`, `end: { a: string; tone: Tone }`, `yes` and `no` the words on the branches (defaults "yes" and "no"); `q`, `note` and `a` are trusted HTML set with `set:html`. The ladder is an `<ol>`.
- Produces, in the stylesheet: `.how-tone-<tone>` sets `--how-fg`, `--how-bg`, `--how-edge` for whatever it is put on; `.how-figure`, `.how-scroll`, `.how-role`, `.how-key`, `.how-strip`, `.how-contents`, `.how-ladder`. Section anchors, used by every later task: `week`, `run`, `listing`, `matching`, `life`, `strikes`, `picks`, `safeguards`, `corrections`.

- [ ] **Step 1: Write the failing end-to-end tests** in `site/e2e/how-it-works.spec.ts`, following `site.spec.ts`'s helpers for the fixed build day:
  - `/about/how-it-works` answers 200 with an `h1` "How it works" and a link named "About" to `/about` above it;
  - the strip names its run ("The weekly run of October 5") and shows "4" sources read, "1" failed, "$0.42" and "6" model calls (from Task 2's fixture);
  - the key lists the five role names;
  - every `.how-role` on the page has non-empty text; every `.how-scroll` has `tabindex="0"`, `role="region"` and a non-empty `aria-label`;
  - the built file `dist-e2e/about/how-it-works.html` contains no `<style` and no `<script` beyond those `dist-e2e/404.html` has (compare counts), and links a stylesheet;
  - at 1280 px wide a `.how-figure` is wider than the lede paragraph and no wider than 1040 px.
  Add `"/about/how-it-works"` to the path lists in `a11y.spec.ts` (both schemes) and in `site.spec.ts`'s "no third-party requests and does not scroll sideways at 320px".
- [ ] **Step 2: Run to see them fail.** `pnpm --filter kc-events-site build:e2e && pnpm --filter kc-events-site test:e2e -- --trace off how-it-works a11y`. Expected: FAIL, 404.
- [ ] **Step 3: Write the stylesheet's foundation.** Port from the artifact's `<style>` the rules for the frame, key, chips, strip (`.figs`), contents row (`.toc`), ladder, cards, slabs, flow, gates, pipeline, week grid, tables and SVG text, renamed with the `how-` prefix and rewritten onto the site's tokens (`--bg`, `--bg-raised`, `--fg`, `--fg-muted`, `--rule`, `--rule-strong`, `--space-*`, `--text-*`, `--radius`, `--font`); a diagram's own monospace labels use `ui-monospace` as the artifact does. Role hues: network 245, extraction 308, hand 140, data 205, warn 62, curation 345, code and plain grey (`--fg-muted` on `--pressed-tint`). Include `prefers-contrast: more` (edges one step stronger) and `forced-colors: active` (tints dropped, borders kept). The page uses `<Base wide>`; prose and headings are held to `--measure`, figures to `65rem`; if `main.wide` does not suit, break out from the measure instead, and say which in the commit.
- [ ] **Step 4: Write the three components and the shell.** The shell, in order: the way back; `h1`; the lede (spec, "The page"), with the source count from `run.sourcesTried` when there is a run and "about fifty" otherwise; the strip, only when `howItWorks.run` exists, as a `<dl>`: sources read, sources that failed, events found, new, model calls, spend "of a $5.00 cap", run length; the contents row; the key (five `RoleTag`s, each with one line, the two models named from `settings`); nine empty `<section id>`s each with an `h2.section-heading` (working titles from the spec); the foot, with the build day from `meta.buildToday` and links to the repository, `CONTEXT.md` and `docs/adr/`. Title and description as the spec gives them.
- [ ] **Step 5: Record the exception in `site/DESIGN.md`.** Under "Colors, Named Rules", add **The Diagram-Roles Exception**: the five terms from the spec's "Colour and roles" in three or four sentences, naming the page and the stylesheet. Add one line to "Don't": do not use a role colour outside the How it works page's figures.
- [ ] **Step 6: Run the end-to-end tests to see them pass**, then `pnpm --filter kc-events-site typecheck`.
- [ ] **Step 7: Check nothing else grew.** `pnpm --filter kc-events-site build && pnpm --filter kc-events-site size`. Expected: every existing line `ok`, and the `index.html`, `explore.html` and `404.html` fixture lines within 20 bytes of the baseline. The baseline is this worktree's own: before Step 3, run the same three commands on the branch as Task 2 left it and note the three numbers (a baseline built elsewhere differs by more than the change being measured).
- [ ] **Step 8: Commit** ("How it works: the page's shell, its stylesheet and the diagram-roles exception").

### Task 4: The week, and a run step by step

**Files:**
- Create: `site/src/components/how/sections/TheWeek.astro`, `ARun.astro`
- Modify: `site/src/pages/about/how-it-works.astro`, `site/src/styles/how-it-works.css`, `site/e2e/how-it-works.spec.ts`

**Interfaces:** Consumes `Figure`, `RoleTag`, `howItWorks` (`schedule`, `settings`, `constants`, `run`), `cronWhen`, `barShares`, `usd`, `STAGE_NAMES`.

- [ ] **Step 1: Write the failing tests:** `#week` has a figure whose scroll region is labelled and holds the three times "6:17 a.m." (twice) and "12:05 a.m."; `#run` lists exactly 14 steps (`.how-step`) under five phase labels, each step with at least one role tag; the spend bar shows three segments named "Reading list pages", "Own pages" and "Curation" on the fixture build, and has an accessible name that states each stage's dollars. (The bar is drawn only when `barShares` returns a segment, which Task 1 tests for a run with no spend and a report with no stages.)
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Write `TheWeek.astro`** from artifact 1 under the spec's section 1: five lanes (Research, Audit, By hand, Site, and the days' header), times from `cronWhen(schedule.*)`, the audit "after the Monday run" with no clock time and no model name, the midweek window from `constants.reverifyDays`.
- [ ] **Step 4: Write `ARun.astro`** from artifact 3 under the spec's section 2: the seam diagram (file names as links to `${siteConfig.repoUrl}/blob/main/<path>`), the fourteen steps with Monday and Thursday marks, and the bar. Every number in a step's text comes from `settings` or `constants` (horizon, reads per page, concurrency, own-page ceiling, batch size, page cap, archive weeks, runs to stale, the failing-source and empty-reading thresholds); the artifact's per-step run figures (its `.m` lines) are dropped. Steps name later sections as links to their anchors. The Monday and Thursday marks carry text for a screen reader ("runs on Monday", "does not run on Thursday", "first run of the month only").
- [ ] **Step 5: Run the tests and the axe and 320 px specs to see them pass.**
- [ ] **Step 6: Commit** ("How it works: the week, and a run step by step").

### Task 5: Page to listing, matching, life of a listing, strike or outage

**Files:**
- Create: `site/src/components/how/sections/PageToListing.astro`, `Matching.astro`, `LifeOfAListing.astro`, `StrikeOrOutage.astro`
- Modify: the page, the stylesheet, `site/e2e/how-it-works.spec.ts`

**Interfaces:** Consumes `Figure`, `Ladder`, `howItWorks.constants` and `settings`.

- [ ] **Step 1: Write the failing tests:** `#listing` has a ladder of six rungs and an end, and the example candidate is captioned as an example; `#matching` has a ladder of eight rungs whose branch word is "match", and a table with three body rows and four ✓ / – columns whose cells have text alternatives ("yes", "no"); `#life` has an image or figure whose accessible name mentions "active", "unverified", "expired" and "archive", and a text list of the same transitions (visible or `sr-only`); `#strikes` opens with the sentence "An outage holds an event; only a reading strikes it." and has a ladder of eight rungs and an end; no text on the page matches `/\b\d+ today\b/` (the artifact's dataset counts are gone).
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Write the four sections** from artifacts 4 to 7 under the spec's sections 3 to 6. Numbers come from `constants` (page cap, fuzzy window, strikes, outages, runs to stale, horizon slack, archive weeks, empty-reading guard) and `settings.horizonWeeks`. The artifact's red "Strike" answers take the `warn` tone. `StrikeOrOutage` links ADR 0008 in `docs/adr/` (find its file name). The state diagram keeps its SVG, redrawn on the site's tokens with no counts in the nodes; its arrowhead marker id is prefixed `how-`.
- [ ] **Step 4: Run the tests and the axe and 320 px specs to see them pass.**
- [ ] **Step 5: Commit** ("How it works: from a page to a listing, matching, a listing's life, strike or outage").

### Task 6: Picks, safeguards, corrections

**Files:**
- Create: `site/src/components/how/sections/Picks.astro`, `Safeguards.astro`, `Corrections.astro`
- Modify: the page, the stylesheet, `site/e2e/how-it-works.spec.ts`

**Interfaces:** Consumes `Figure`, `RoleTag`, `howItWorks` (`counts`, `constants`, `settings`, `schedule`); the site's pick tag markup (see `components/PickTag.svelte`; render its static HTML and classes in Astro rather than hydrating it, so the page keeps no island).

- [ ] **Step 1: Write the failing tests:** `#picks` names the six reasons in About's words (assert the six labels "Rare", "Big name", "Occasion", "Tradition", "Unusual", "Major run"), shows the three verdicts, shows the fixture's pick count from `counts.picks`, and has exactly one element with the pick tag's class; `#safeguards` has a chain of six gates with one marked as the publishing line, and five slabs; `#corrections` has a table with eight body rows and two columns, and a link to `/about#wrong-listing`. Then the copy test over the whole page, on `page.locator("main").innerText()`: no match for `/\b(you|your|yours|we|our|us)\b/i`, `/!/`, `/#\d{2,}/`, `/~\//`, `/\b[0-9a-f]{7}\b/` (a commit hash; exempt nothing), or any of "Slack", "healthchecks", "worktree", "needs-triage", "pnpm ", "crontab".
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Write the three sections** from artifacts 8, 2 with 9, and 10, under the spec's sections 7 to 9. `Picks`: the funnel's numbers are `counts.activeEvents`, `counts.picks`, `constants.curationBatchSize`, `constants.whyLineCap`, `constants.calibrationLow` and `High`, `settings.horizonWeeks`; the counts the build does not have (eligible, due this run, close calls) are worded without numbers. `Safeguards`: the six gates as the spec lists them, with `schedule.runTimeoutMinutes`, `schedule.deployWaitMinutes`, `constants.minPublished`, `constants.staleAfterDays`, `settings.spendCapUsd`. `Corrections`: the table's second column links each home (`prompts/extraction-rules.md`, `prompts/event-page-rules.md`, `prompts/curation-prompt.md`, `data/picks.yaml`, `data/registry.yaml`, `data/venues.yaml`, `research.config.yaml`, `src/identity.ts`) into the repository.
- [ ] **Step 4: Run every how-it-works, axe and 320 px spec to see them pass.**
- [ ] **Step 5: Commit** ("How it works: picks, safeguards, corrections and fixes").

### Task 7: Links in, the sitemap, the budget, the handbook

**Files:**
- Modify: `site/src/pages/about.astro`, `site/src/lib/sitemap.ts`, `site/src/lib/llms.ts` (only if its page list names `/about`), `site/scripts/size-check.ts`, `AGENTS.md`, `site/e2e/site.spec.ts`, the sitemap's and size check's unit tests

- [ ] **Step 1: Write the failing tests:** the sitemap test expects `/about/how-it-works` with the last run's `lastmod`; an e2e test follows About's new link in "How it is made" to the page, and its link in "What a pick is" to `/about/how-it-works#picks`, landing with the Picks heading in view; the size check's own test (if `BUDGETS` has one) expects an entry for `about/how-it-works.html` on the fixture build.
- [ ] **Step 2: Run to see them fail, then implement.** About, "How it is made": one closing sentence, "The whole of it, step by step and with diagrams, is on <a>How it works</a>." About, "What a pick is": after the sentence on the rules, "<a>How a pick is made</a> has the longer account." (wording may be tightened within the voice rules). The budget: build, measure, set the entry to the measurement rounded up to the next 100 plus 300, with a comment in the file's style saying what the page carries; if it measures over 35,000, stop and find out why before setting anything.
- [ ] **Step 3: Add to `AGENTS.md`'s Commands section**, inside the site's bullet, one or two sentences: the page at `/about/how-it-works`, that its figures come from `src/generated/how-it-works.ts` (the config, the newest weekly report, and literals `test/how-it-works-constants.test.ts` holds to the job's constants and the cron scripts), that its prose describes `src/run.ts`, `src/identity.ts`, `src/expiry.ts`, `scripts/weekly-run.sh` and the curation prompt's reasons, so a change to what those do changes the page in the same commit, and that the weekly audit it mentions is a scheduled routine outside the repository.
- [ ] **Step 4: Run** `pnpm -r test`, `pnpm -r typecheck`, `pnpm --filter kc-events-site build && pnpm --filter kc-events-site build:e2e && pnpm --filter kc-events-site size`, `pnpm --filter kc-events-site test:e2e -- --trace off`. Expected: all pass, the three older budgets untouched.
- [ ] **Step 5: Commit** ("How it works: linked from About, in the sitemap, budgeted, and in AGENTS.md").

### Task 8: The facts pass, the review, the pull request

- [ ] **Step 1: The facts pass.** A fresh reviewer (not the author of the text; an Opus subagent) is given the built page's text (`dist/about/how-it-works.html`, built with `SITE_TODAY=last-run`) and the repository, and asked to check every factual sentence and every diagram label against `src/run.ts`, `src/identity.ts`, `src/expiry.ts`, `src/extraction.ts`, `src/curation.ts`, `src/own-page.ts`, `src/research.ts`, `scripts/weekly-run.sh`, `prompts/`, `research.config.yaml` and `CONTEXT.md`, and to report each claim it could not confirm, with the file and line that contradicts it or the note "not found". It reports; it changes nothing.
- [ ] **Step 2: Fix or cut every unconfirmed claim**, rerun the page's specs, commit ("How it works: the facts pass's findings").
- [ ] **Step 3: The code review**, by the repository's usual two-axis review of the branch against `origin/main` (standards, and the spec); fix-up commit.
- [ ] **Step 4: File the ticket and open the pull request.** `gh issue create` for this page (title "A public How it works page under About, from the run explainer", body linking the spec and plan), then push the branch and open the pull request with "Closes #N", following `.github`'s template if there is one. Wait for CI and for Vercel's preview; open `/about/how-it-works` on the preview in light and dark and at phone width, and confirm `/about` still resolves.
- [ ] **Step 5: File the follow-up issue**, "Deco diagrams on the How it works page", with the spec's "Follow-up" paragraph as its body, labelled as the repository labels design work.
- [ ] **Step 6: Hand Evan the pull request and the preview's URL**, with the first thing to look at: the role colours in both schemes.
