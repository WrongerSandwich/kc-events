# How it works: the run explainer as a public page under About

**Status:** approved by Evan, 2026-11-22.

## Intent

On 2026-11-21 a diagram explainer of the research job was drawn for Evan and published as a private artifact, "How a KC This Week run works" (source: `docs/explainers/how-a-run-works.html` on the branch `docs-run-explainer`, e3a26d9). It walks through the week, the run's steps, how a page becomes a listing, how listings are matched, kept, struck and picked, what guards a run, and how a run is reviewed, in ten sections and ten diagrams.

This work turns it into a page of the site, at `/about/how-it-works`, for a different reader: someone curious and tech-literate who followed a link from About and wants to understand how the automation works. They should leave understanding the system, and with the sense that it is well thought out and reliable. That sense has to come from the page being clear, exact and well organised, never from the page saying so.

The About page's "How it is made" stays the two-paragraph version. This page is the long one.

## Goals

- A reader who knows what a web scraper and a language model are can follow a listing from a venue's page to the site, and say what stops a wrong one.
- Every diagram in the artifact that serves that reader comes along, redrawn in the site's tokens.
- No figure on the page goes stale silently. A number is generated at build, or a test fails when the code it quotes changes. The descriptions of behaviour (the order of the steps, the ladders) are held by review, not by a test; see "What is not guarded".
- The page reads as part of the site: its layout, type, voice and section headings are the site's.
- It costs the other pages nothing: no new script, no growth in the explorer's or the front page's weight.

## Non-goals

- The diagrams' own Art Deco treatment. This pass draws them plainly in the site's tokens; a follow-up issue gives them the flair (see "Follow-up").
- Splitting into several pages. One page; the sections are self-contained so a later split is cheap.
- Changing the private artifact. It stays as Evan's operator version, as published.
- Rewriting the About page. It gains links to this page and loses nothing.
- Anything interactive. No island, no script.

## Anti-goals

- **Selling.** No sentence claims the system is careful, robust or trustworthy. The page describes what happens; the reader concludes.
- **An operator's manual.** Where the home machine keeps its clone, which channel an alert posts to, what a token may do, how tickets are labelled and worked: none of it helps this reader, and it stays out, though all of it is in the public repository.
- **A page that is quietly wrong.** A stated constant that the code has since changed is worse than no page.
- **A second visual language.** The diagrams' role colours are an exception DESIGN.md records and this page alone uses (see "Colour and roles"); everything else on the page is the site's.

## Constraints

- **Voice** (DESIGN.md, About): no "we", no exclamation marks, no slogans; headings are nouns; neutral copy with no curator persona. The artifact's "you" (Evan) goes everywhere. Numbers up to twelve in running prose are words, as on About; figures in diagrams, tables, measures and money stay figures.
- **Colour** (DESIGN.md): no new hue outside the diagrams' roles. See "Colour and roles" below.
- **Type**: the display face sets the page's heading and section headings only, in capitals; never a diagram's sentence, a button or a label that is a sentence.
- **Content Security Policy**: every page's policy carries the hashes of every inline script and style in the build, so an inline stylesheet or script on this page would add bytes to the explorer, whose budget has about nothing left. This page's CSS ships as a linked stylesheet and it has no script of its own. `style` attributes are allowed (`style-src-attr`).
- **Budgets**: `pnpm size` must pass with `explore.html`, `index.html` and `404.html` unchanged in their budgets. The new page gets its own entry (see "Tests").
- **The build's inputs**: the page may read what the site's build already reads (the dataset, the run reports beside it, the config, the job's `src/`). Reading `data/registry.yaml` would be a new input and a new path for `site/scripts/ignore-build.sh`; avoid it (the weekly report already lists the sources).
- **Import order** (a past failure): the site's build loads `config.ts` first, and a runtime import that drags `dataset.ts` into it has broken Vercel's build while tests passed. Anything taken from the job's `src/` is read in the generate step and written into a generated module, not imported by a page.
- **Accessibility**: the page joins the axe run in both schemes; every diagram has a text equivalent; nothing scrolls the page sideways at 360 px; forced colours and `prefers-contrast: more` hold.

## Approaches

**A. One page at `/about/how-it-works` (chosen by Evan, 2026-11-22).** The artifact's shape: a lede, a contents row, about nine sections down one scroll. The sections refer to each other by anchor, About can link straight to a section, and there is one stylesheet and one budget. It is long, about a ten-minute read; the first two sections work as the short version.

**B. An overview page and three chapter pages.** Lighter pages, each with its own title to link. It needs chapter navigation and four sets of titles, tests and budgets, and the pipeline's steps would link away rather than down the page. Not chosen: the gain is small while the page is one narrative, and A can be split later.

**C. Folding it into About.** Not considered further: About is a utility page (the corrections form, the calendar links, the crawler's name for venues) and ten sections of diagrams would bury them.

**Figures (Claude's call, accepted with A).** The artifact quotes one run by hand (52 sources, 366 events, $0.69). Three ways to handle that: drop every figure; type them in and let them age; or generate them. Chosen: generate. A "last weekly run" strip and the spend bar come from the newest weekly report at build, models and settings come from the config, and the artifact's per-step run figures (the `.m` lines in the pipeline) are dropped. This puts a run's dollar spend on the site; the reports are already public in the repository.

## The page

- **URL** `/about/how-it-works`, a new `site/src/pages/about/how-it-works.astro` beside `about.astro`. Check that `/about` and `/about/how-it-works` both resolve on a Vercel preview with `build.format: "file"`.
- **Title** "How it works". **Description**, about: "How the weekly research job reads venue pages, checks what it read, and keeps the list current."
- **Above the heading** a one-line way back: "About" as a link, then the page's name. A `BreadcrumbList` in JSON-LD, as event pages have, is the builder's call.
- **Lede**, two or three sentences, in the About page's register. Roughly: once a week a job reads about fifty venue and organizer calendars, checks every date and venue it read against the page it came from, decides which events are picks, and publishes the result; a shorter pass on Thursday re-checks the coming ten days. This page shows how, step by step.
- **Last weekly run strip**: generated (below). Left out entirely when there is no weekly report to read.
- **Contents row**: links to the sections' anchors.
- **Key**: the five roles a step can have (below).
- **Sections**: each opens with the site's Section Heading (crown, display capitals, double hairline), then one or two short paragraphs, then its diagram in a figure with a caption.
- **Foot**: one line saying what the page is drawn from and when its figures were generated (the build's day and the report's run date), with links to the repository, `CONTEXT.md` (the glossary) and `docs/adr/`.

### Layout

Prose stays at the site's measure (42rem). A figure may be wider than the prose on a wide screen, up to about 65rem, since the week grid, the state diagram and the two tables need the room; whether that is Base's `wide` with the prose constrained inside, or a breakout from the measure, is the builder's call. On a phone a diagram either restacks (the ladders, cards, slabs and flows already do in the artifact) or scrolls sideways inside its own frame (the week grid, the state diagram, the tables), and a frame that scrolls is focusable and labelled.

### Colour and roles

The artifact colours every step by who does it: network (blue), extraction model (violet), curation model (red), code (grey), hand (green), with amber for a warning and teal for data. On the site a hue means a kind, and carmine means a pick (DESIGN.md's Only-Kinds-Bring-Colour Rule).

Evan's suggestion, and Claude's recommendation, 2026-11-22: the role colours come across, as an exception for this page's diagrams. The rule's reason is that a hue beside events would be read as a kind; this page lists no events and shows no kind, and the colour does real work in the pipeline, where a reader scans for which steps touch the network, which call a model and which are plain code. The first draft of this design made the diagrams ink and grey; that was dropped as a mark system invented only to be replaced in the Deco pass.

The terms of the exception:

- **Scoped.** The role tokens are defined in this page's stylesheet, not in `tokens.css`, and are used inside its figures and its key and nowhere else: not on a link, a heading, a rule or the page's chrome.
- **Matched pairs.** Each role is a shade on its own tint at the kinds' lightness and chroma in both schemes (0.47 / 0.14 on 0.945 / 0.045 light; 0.82 / 0.11 on 0.31 / 0.06 dark), so the contrast the kinds already clear holds here; the axe run confirms it.
- **Words first.** A role is always named beside its colour (the tag's label), and an outcome (verified, unverified, strike, outage, dropped) is always said in words, so the page reads in greyscale, in forced colours and to a screen reader.
- **Carmine stays the pick.** The artifact's curation-model red (hue 27) is the flag carmine's hue; the curation model's role takes another hue, and the artifact's "strike" answers, which borrowed that red, take the warning's. The pick tag itself appears once, on the "pick" verdict in the Picks section, as the site's own component.
- **Recorded.** DESIGN.md gains a short named exception under its colour rules, saying the above, so the next audit does not flag it and the next page does not borrow it.

The hues themselves are the builder's call within those terms; starting from the artifact's (245 network, 308 extraction model, 140 hand, 205 data, 62 warning, grey for code) and moving only the curation model's is the cheapest path. The Deco follow-up may revisit the whole scheme.

### Sections

Titles are working titles; the builder may reword them as nouns that read well in display capitals. "Artifact n" is the artifact's section number.

1. **The week** (artifact 1). The week grid: Monday's weekly run, Thursday's midweek re-verification, the nightly rebuild that keeps "today" right, the Monday audit in which a second, stronger model reviews what the run changed, and a "by hand" lane (corrections, edits to the rules and the source list, hand picks). The three cron times stay (they are in the repository and a test holds them); the lane labelled "You" becomes "By hand"; where each job runs is dropped. Discovery's monthly cadence stays in the caption.

   The audit is the one thing on the page that is not in the repository: it is a scheduled Claude routine (Mondays at 8:47 Central, read-only, live and last run on 2026-11-16; the artifact's "on the home machine" is where it reads the repository, not a cron line). No test can hold it. Confirmed by Evan, 2026-11-22: it is on the page, described by what it does and placed "after the Monday run" with no clock time and no model name, so a change to its schedule or model does not make the page wrong; if it is ever stopped, the page is edited by hand, and AGENTS.md says so.
2. **A run, step by step** (artifact 3). The seam diagram (what a run reads, the one function with its five ports, what it writes), with file names as links into the repository; then the fourteen steps in their six phases with the Monday and Thursday columns; then the spend bar, generated. The prose keeps the point that the function does no I/O of its own, which is why a whole week can be tested with fakes. The steps' texts are rewritten for this reader (no ticket numbers, no "your entries") and refer to later sections by anchor.
3. **From a page to a listing** (artifact 4). The three-box flow (the page as fetched, as the model sees it, a candidate in the model's reply) and the cite-or-drop ladder. The example candidate may stay as an illustration, marked as one. The caption's 11-16 counts are dropped.
4. **Matching** (artifact 5). The identity ladder and the table of which page gets a say.
5. **Life of a listing** (artifact 6). The state diagram, redrawn in tokens and without the dataset counts (the site publishes only active events, and the other counts are not in what it reads). The caption keeps the archive rule.
6. **Strike or outage** (artifact 7). The re-verification ladder. The principle stays as the section's opening line: an outage holds an event; only a reading strikes it. It links ADR 0008.
7. **Picks** (artifact 8), anchor `#picks`. Who is judged, the three verdicts, the six reasons, and that a hand-kept file stands over the model. The funnel's counts are generated where the build has them (active events, picks) and worded generally where it does not. The reasons' wording matches About's.
8. **Safeguards** (artifacts 2 and 9, merged and cut). First the short chain around a run, about six gates instead of eleven: the research run writes nothing unless everything is ready; the site is built from the new data; the data checks run on that build; only then is it committed and published; the deploy is watched; the outcome is recorded and a failure raises an alert. The line "everything before publishing can fail without touching the site" stays as the diagram's dividing mark. Then the five slabs (spend, dead-world fuses, the write, before publishing, on the site). The lock, the clone, the rebase, the token, the names of the alerting services and the manual fallback's mechanics are dropped; one sentence may say a manual fallback exists.
9. **Corrections and fixes** (artifact 10, cut). What a run leaves behind (the report, the changes page, a health record); who reads it (the audit, the maintainer, readers through the wrong-listing form); where a fix lands; and that the next run confirms it. Then the table "what is wrong, and where it is fixed", kept because it shows that each kind of error has one home: rule documents, the source list, the venue table, the hand picks file, or code. Its third column ("check in the report") is dropped. Label names, the post-run-check issue, worktrees, agent reviews and `pnpm` commands are dropped. Links to the wrong-listing form on About.

Cut everywhere: commit hashes, ticket numbers, cron syntax, local paths, the word "you" for Evan.

Kept on purpose, because this reader wants them: file names and a few identifiers as links into the repository (`prompts/extraction-rules.md`, `research.config.yaml`, `src/run.ts`), the model names (from the config), and the real constants (two strikes, three outages, four runs to stale, batches of 25, the 70,000-character cap, the eight-week archive).

Vocabulary follows `CONTEXT.md` (sighting, candidate, primary page, own page, strike, outage, held for promotion); the first use of each is explained in passing.

## Generated figures

A new generated module (its own, in the pattern of `src/generated/about.ts`; or a field of it, the builder's call), written by the generate step, holding:

- **From the config:** horizon in weeks, the spend cap, extraction reads per page, concurrency, the own-page ceiling, the two model names, discovery's cadence.
- **From the newest weekly report** on or before the dataset's last successful run (a report whose `mode` is `weekly`; a midweek report is skipped; found in the `runs` directory beside the dataset, where `src/build/changes.ts` already looks): the run date, its length from `startedAt` to `finishedAt`, sources tried and failed, sightings found, events new and updated, model calls made and failed, total spend, and spend and calls by stage for the bar.
- **From the dataset as published:** active events and picks.
- **From the job's code:** the constants the page states. Each is imported in the generate step from where the job defines it (exported there if it is not yet), or, where that is awkward, held by a unit test that fails when the page's figure and the code's differ. The builder lists the constants and says which way each went.
- **From the site's own config:** the 50-event build floor and the staleness banner's days, read where About already reads `staleAfterDays`.
- **From `scripts/`:** the three cron times (the weekly run, the midweek pass, the nightly rebuild), the run's 90-minute timeout and the 15-minute wait on the deploy. These are shell, so they are typed on the page and one unit test reads the scripts (the cron lines in `scripts/home-run-setup.sh`, the two durations in `scripts/weekly-run.sh` and `scripts/deploy-checks.sh`) and fails when the page's differ. A duration that is awkward to read from its script is worded without the number instead ("under a timeout").

### What is not guarded

The order of the fourteen steps, the three ladders, the identity rules and the say table describe code paths, and no test ties the page's words to them. They are checked once, by the facts pass before the pull request, and after that by review: AGENTS.md's sentence on the page names the files whose behaviour it describes (`src/run.ts`, `src/identity.ts`, re-verification, `scripts/weekly-run.sh`, the curation prompt's reasons) and says a change to what they do changes the page in the same commit. A pinned hash that fails a test on any edit to those files was considered and dropped: `run.ts` changes most weeks for reasons the page does not describe, and a check that fires that often gets waved through. The audit routine is likewise outside any test (section 1).

When no weekly report is found (the fixture build may have none, and a first deploy would not), the strip and the spend bar are left out and the page still builds; add a weekly report to the e2e fixtures so the strip is exercised there.

The strip says which run it describes ("The weekly run of November 16") so a figure is never read as a promise about every run.

## Links in

- About, "How it is made": a closing sentence linking this page as the longer version with diagrams.
- About, "What a pick is": a link to `#picks`.
- The sitemap gains the path; `llms.txt` gains a line if its list of pages has one for About.
- The footer's "How this is made" and the front page's "here's how" stay pointed at `/about`.

## Tests

- **Unit:** the report chosen is the newest weekly one (a later midweek report is skipped; no report gives no strip); the figures derived from a report (length, spend by stage, calls) on a small fixture; the constants check above; the sitemap test.
- **End to end:** the page loads at its URL; every contents link lands on a section; About's two new links arrive; the strip shows on the fixture build; no sideways page scroll at 360 px; the page is added to the axe run and to the list of pages checked in both schemes.
- **Size:** a `BUDGETS` entry for the page on the fixture build, set from the first measurement with a few hundred bytes of room and a comment in the file's style. Expectation: the 404's shell is 13.3 KB and the content should add 12 to 18 KB gzipped; much over 35 KB total means something is wrong (an inlined runtime, a duplicated stylesheet). The other entries' budgets do not move.
- **Facts:** before the text is written, each claim kept from the artifact is checked against the code and `CONTEXT.md` as they stand. The artifact was drawn at 54589e0; `src/`, `prompts/`, `scripts/`, `research.config.yaml` and `CONTEXT.md` are unchanged from there to 22a1fcb, so the check should find little, but the page is public and the check is still made. The review before the pull request has one pass for facts alone, separate from the code review.

## Landing

A site ticket: a pull request from the branch, with the Vercel preview's URL for Evan to read the page on, in both schemes and on a phone. Evan merges. AGENTS.md's Commands section gains a sentence on the page: where its figures come from, which files' behaviour it describes (so a change to that behaviour edits the page with it), and that the audit routine it mentions lives outside the repository.

## Follow-up (filed as an issue when this lands, not built here)

**Deco diagrams.** Give the diagrams the site's Art Deco language: rule weights, stepped corners, the display capitals on a diagram's labels where DESIGN.md allows, and a second look at the role colours. DESIGN.md currently allows two stepped motifs and "once a page" ornaments, so that pass starts by deciding what a diagram may use, and amends DESIGN.md. Because eight of the ten diagrams are HTML and CSS, most of it is a stylesheet change.

## Left to the builder

- The markup: one `.astro` page with scoped styles, or small components per diagram shape (ladder, gates, cards). The data for a ladder or the pipeline may live in a small typed module if that keeps the page readable.
- The role hues and how an outcome is weighted, within the terms under "Colour and roles".
- Section titles and all sentence-level wording, within the voice rules.
- Whether the state diagram and the spend bar stay SVG or become HTML and CSS.
- The breakout mechanics for wide figures, and the phone treatment per diagram.
- The generated module's name and shape, and which way each code constant is held.
