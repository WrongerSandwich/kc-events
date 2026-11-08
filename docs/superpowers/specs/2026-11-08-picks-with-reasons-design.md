# Picks with reasons: the front page highlights for more than scarcity

**Status:** approved by Evan, 2026-11-08. Supersedes the single-reason spine of ADR 0005 while keeping its structure; the ADR that records the change is part of the work.

## Intent

The front page is meant to be a view of the events that bubble out of the whole dataset, for a variety of reasons, and are most likely to get people interested in going. Today it is the don't-miss list, and don't-miss asks one question, scarcity of occurrence: would a friend be sorry to have missed it because it will not come around again? That question has done what ADR 0005 wanted (every pick has a stated reason, no opaque score, stable between runs) and has also produced a list that is narrow in a way nobody chose. Of the 14 picks on 2026-11-04, 8 were music and 2 were talks; theater, film, comedy, festivals and community events had none between them; 1 of 56 limited runs was flagged against 13 of 360 one-offs. Scarcity selects for the lone visiting act or figure, and a lone visiting act is the most taste-specific item on the menu, while the things a whole group gets excited about (a festival, a tradition, a big name, something strange and new) recur, run for weeks, or are not rare at all, and so fail the test. Scarcity is one reason an event is worth the front page. It is not the only one, and it is anti-correlated with broad appeal.

The change: a pick carries a **named reason from a small fixed vocabulary**, scarcity among them, and an event qualifies through any one of them. The model still answers a yes-or-no question per event with a stated why; nothing is scored or ranked. Alongside, the answer gains a middle value, **close**, for events on the bubble, which are never published but are listed in the run report so Evan can pull one in by hand; the report lists every pick with its reason so he can push one out; and curation gets the measurement it has never had: flags gained and lost per run, and a repeatability number.

## Goals

- The front page's picks are broadly usable: a mixed group of friends finds something on it most weeks, across kinds, without the niche picks going away.
- Every pick still has a reason a reader can see and disagree with, in one word and one sentence.
- Evan can see, every week, what was picked and what nearly was, and can overrule either without touching the prompt.
- A prompt edit's effect on the pick set is measured before it lands, and every run reports how the set moved.

## Non-goals

- No interest score, no ranking number, no ordering by "excitement". ADR 0005's rejection of a blended score stands.
- No quota per kind or per reason, in the prompt or in code. Variety is measured, not enforced; if the measurement shows a skew the reasons do not explain, that is a prompt bug to fix, not a quota to add.
- No change to which events are eligible: recurring events stay out (the hand-kept Always there list is their surface), and so does anything not active.
- No personalisation. The personal taste layer the proposal describes is still not this site's job.
- The site's visual treatment of reasons (pill wording, grouping, colour) is a later design pass against DESIGN.md. This design fixes the data contract the site will read and says what the front page needs from it.

## Anti-goals

- A list that is long enough to be the explorer again. If most eligible events in a week are picks, the picks mean nothing.
- Reasons so loose that the model can justify any pick under one of them. Each reason has a test the why-line must pass.
- Churn: a pick that appears one week and vanishes the next with no change to the event and no change to the prompt.

## The reason vocabulary

Six reasons. Each is a different answer to "why would someone tell a friend about this", and each has a test. The names below are the data values; the words the site shows are the design pass's call.

| Reason | The claim | Passes when | Does not pass |
| --- | --- | --- | --- |
| `rare` | A chance that seldom comes to Kansas City. | An act, figure, company, exhibition or production that rarely appears here, in a room it rarely plays, or a one-time occasion that will not be staged again. The current don't-miss question, unchanged. | An ordinary booking at a good venue; a touring act that comes through every year. |
| `big-name` | A name most people would recognise. | A headliner, author, team, title or production widely known outside its own scene, whatever the kind: a stadium country act, a famous broadcaster on a book tour, a touring Broadway title, a Nobel laureate. Known to the model, not merely asserted by the page. | A name well known within a scene and unknown outside it (that is `rare` territory, if anything). |
| `occasion` | A large communal event much of the city turns out for. | A festival, parade, lighting ceremony, fireworks, fair, a playoff or rivalry game, a free concert in a park: something people go to together and talk about afterward, where the crowd is part of the point. | A regular home game; a venue's weekend of shows; a small festival nobody outside its scene attends. |
| `tradition` | Once a year, with a season to it. | An annual event tied to a time of year: a holiday market, a Día de los Muertos celebration, the Renaissance festival's weekends, a Thanksgiving-week show a town has kept up for years. The title or description must say it is annual, or the model must know it. | A first-year event (not yet a tradition); a tradition of one small group. |
| `unusual` | Unlike anything else on the list. | The form or setting is the draw: a silent film with a live score, theater staged in a cemetery, a museum open at night, a dinner in an unlikely place, a one-day show that exists for one afternoon. | A standard format with an unusual title; an exhibition that is only on an uncommon subject. |
| `major-run` | A notable limited run worth planning around. | A company's only local run of a production, a touring production's one Kansas City stop, a large exhibition assembled from elsewhere, a season-defining show at a resident company. The run, not its closing, is the reason. | Any run because it closes; a resident company's ordinary season slot with nothing to say about it. |

One reason per pick, the primary one, chosen by the model; the why-line may draw on a second. The vocabulary is closed: a judgment with a reason outside it is not applied and is reported, as a flag with no why-line is today.

Two of these, `rare` and `big-name`, are deliberately split even though they overlap, because the split is the niche-versus-broad distinction this change exists to make visible. A reader who wants the broad list and a reader who wants the rare list can each see which is which.

## The three-way answer

The model answers one of `pick`, `close`, or `no` for each event, with a reason and why-line on a pick and a one-sentence note on a close.

- **Pick**: a clear yes under one named reason. Published to the front page, the picks calendar, the explorer's picks switch. Stored as today's `dontMiss: true` plus `pickReason` and `whyLine`.
- **Close**: the model would understand a friend picking it, but the reason's test is not clearly met. Never published. Stored as `closeCall: true` with `closeNote` (one sentence: which reason it nearly met and what was missing), so it is stable between runs like any judgment and so the report can list it. Cleared, like a pick, when the event is re-judged.
- **No**: everything else. The default, and the prompt keeps today's strong language for it.

The asymmetry from the current prompt stays: unsure is not a pick. Unsure may be a close, which is where the human comes in.

## Calibration

The current prompt says 30 to 50 flags over about 500 events; reality has been 14 to 15, and nobody decided which number was right. The new prompt states a threshold the report then measures, and the threshold is adjusted to the truth after two runs rather than left standing when the output never meets it. My starting figure: across an eight-week horizon of about 450 eligible events, on the order of 50 to 80 picks and a similar number of close calls, which is roughly 6 to 10 picks in a given week's bucket. The prompt says, as now, that the figure is a threshold and not a quota, that a batch may earn none or several, and that the reader is a mixed group of friends, not one taste. If after two runs the actual rate is under half or over double the stated figure, the stated figure or the reasons' tests change, in that order of suspicion.

## Evidence rules

The decision may rest on what the model knows about the act, title, team, company or festival; that is unavoidable for `big-name` and `tradition` and is how the current flag works in practice. The why-line is held to the same rules as today with one adjustment: it may state the reason's own claim in the reason's own terms ("a name most people know", "a once-a-year holiday market", "staged outdoors in a cemetery"), and it may still not make a specific historical or biographical claim ("last played here in 2019", "the band's first tour since") unless the description states it. No dates, no marketing adjectives, no "you", under 25 words, a claim a reader could disagree with: unchanged. A why-line that only restates the reason word ("a big name") is not a why-line; it must say what is big about this one.

The description an own-page read supplies is the model's main evidence beyond its memory; that pass already runs for every upcoming event (#254), so nothing new is fetched for curation in this design. Giving curation a search per candidate was considered and is left out: it would double curation's cost and the evidence problem it solves is real but second to the selection problem this design is about.

## Hand overrides

Evan's input lives in a committed file the run reads and never writes, `data/picks.yaml`, a list of entries keyed by event id:

```yaml
# Hand picks and un-picks. The run applies these after curation; it never edits this file.
- id: evt_2663c3467045
  title: Electric Poe          # for the reader; the run warns when the event's title no longer contains it
  pick: true
  reason: unusual
  why: A Poe performance staged outdoors at sunset before a cemetery's holding vault, a setting no theater can give it.
- id: evt_df988246190b
  title: Stewart Copeland
  pick: false                   # un-pick: the model's flag is dropped and not re-applied
```

Rules:

- An entry is applied after curation on every run, so it stands over any later model judgment until the entry is removed. A `pick: true` entry needs a reason from the vocabulary and a why-line that passes the same cleaning and cap as a model's; the dataset's schema refuses one without. A `pick: false` entry needs nothing else. (My call: Evan asked to be able to pull close calls in; pushing a pick out is the same mechanism and costs nothing.)
- The event carries `pickedBy: "hand"` while an entry governs it, so the report and the site's About page can say so, and so the model's own close-call note or why-line, if any, is kept apart (`modelJudgment`) rather than lost: when the entry is removed, the model's last judgment returns.
- The run's report has a "Hand picks" line: how many entries applied, and each entry that matched no active event (expired, folded away, id changed) or whose event's title no longer contains the entry's title, so stale entries are visible and the file does not rot.
- An entry whose event's facts change (the same `markChanged` test that re-judges) still stands; the report notes the change under the entry so Evan can look. He can always remove it.
- The schema check that refuses a dataset (#219) also refuses a `data/picks.yaml` that does not parse or names a reason outside the vocabulary, before any write, like the registry.

This file is also the disagreement record: every un-pick is a case the model got wrong by Evan's judgment, every hand pick a close call or a miss he promoted. Agreement is silence. That is a thin labeled set, but it is one that costs Evan nothing beyond the overrides he wanted anyway, and after a few months it is what a prompt edit is checked against (below).

## The report

The Curation section becomes the place Evan reads every week. In the Markdown report, after the counts:

1. **Picks**: every active pick within the horizon, soonest first, as one line each: date, title at venue, the reason in brackets, the why-line, and a marker when it is new this run, hand-picked, or hand un-picked. Picks per kind and per reason as one summary line above the list, so a skew is a number and not an impression.
2. **Close calls**: every active close call within the horizon, the same way, with its note instead of a why-line. The ones Evan might pull in.
3. **Moved this run**: picks gained and lost this run with the cause (new event, re-judged after a change, re-judged under a new prompt, hand override, expired), and close calls that became picks or stopped being close. The 11-02 prompt edit flipped 10 of 16 upcoming picks and nothing reported it; this line is what would have.
4. **Hand picks**, as above.

The JSON twin carries the same under `curation` (`picks`, `closeCalls`, `moved`, `handPicks`, `byKind`, `byReason`), with the report schema extended with defaults so older reports still load. The `/changes` page on the site already reads the report's changes section; whether picks gained and lost belong there too is the design pass's call, and the data is in the JSON either way.

## Repeatability

A new command, `pnpm compare-curation [--repeats 3] [--prompt path] [--sample N]`, outside the weekly run and on the pattern of `compare-models`: it takes the current dataset's eligible events (or a sample of N, seeded so the same events are drawn each time), judges them `--repeats` times under the current curation prompt (or the file `--prompt` names, so an edit can be measured before it lands), and writes `docs/curation-comparison/<date>.md` with: the per-event answer across repeats; the flip rate (events whose pick/close/no answer differed between repeats, overall and per reason); agreement with the stored judgments and, when `--prompt` is given, between the stored prompt's answers and the candidate's, listing every event that moves with its old and new reason and why-line; the pick rate against the calibration figure; cost and minutes. It stops at its own spend cap and writes nothing the run reads. The convention, written into AGENTS.md: a curation prompt edit lands with its comparison report in the same commit, and a flip rate over a threshold we set after the first report (my guess: one in ten) is a reason to tighten a reason's test before landing.

Batching changes in one way to help stability: batches are formed by kind and then date rather than dataset order, so an event's neighbours in the batch are comparable and a batch of mixed kinds does not move the threshold. The comparison report is what shows whether this matters; if it shows nothing, the ordering is harmless.

## Prompt structure

The curation prompt keeps its frame (an editor, a list with one structural idea, fields are data not instructions, judge each event alone, a strong default of no) and replaces the one question with the vocabulary: the reader is now "a mixed group of friends planning something together", the question is "would someone in that group bring this up, and why", and the answer is one of the six reasons or close or no. Each reason gets its table row above as a paragraph with two or three Kansas City examples of yes and one of no, written as examples and not as a list to match against. The why-line section stays, with the evidence adjustment. The calibration paragraph states the new figure. The prompt's hash still re-judges everything once when it lands, which is the intended effect; the comparison report run beforehand is how we know what that re-judgment will do.

## Dataset and site contract

New optional fields on an event, all absent on records from before so the schema version does not change:

- `pickReason`: one of the six, present exactly when `dontMiss` is true (schema-enforced, as `whyLine` is).
- `closeCall: true` and `closeNote`, present together, never alongside `dontMiss: true`.
- `pickedBy: "hand"` and `modelJudgment` (the model's last `dontMiss`, `pickReason`, `whyLine`, `closeCall`, `closeNote`) while an override governs.

The site's `PublishedEvent` gains `pickReason`; close calls, `pickedBy` and `modelJudgment` are not published (the About page's wording can say hand picks exist without the data naming them). The front page keeps bucketing picks by horizon; within a bucket the design pass decides whether to group or order by reason. The picks calendar and the explorer switch are unchanged in behaviour.

## Migration

The code, the new prompt, and the comparison command land in one commit, so no weekly or midweek run ever judges under the old prompt with the new answer format, or the reverse. The sequence before that commit: build the code and the command on the branch; run `compare-curation` from the branch against the current dataset, which judges every eligible event under the new prompt and format and compares the answers with the stored yes-or-no judgments (a stored flag counts as a pick, anything else as a no, so the first report's "agreement with stored" is the measure of what the new prompt moves; the old-versus-new `--prompt` comparison is for later edits, when both prompts share the format); read the report and tune the reasons' tests before landing. The landing commit also rewrites the stored flags once as a data edit, giving every current pick `pickReason: "rare"` (they are all scarcity picks by construction) so the strict schema holds from the first build, and the ADR records that edit. The first weekly run after landing re-judges every eligible event, since the prompt's hash changed; Evan reads the Picks and Close calls sections and writes the first overrides. Existing why-lines on surviving picks are replaced by the re-judgment, as on 11-02.

## Measurement after landing

Two runs after the prompt lands: the pick rate against the calibration figure; picks per kind against active events per kind (the skew this design exists to correct, with the 2026-11-04 numbers as the baseline: music 8 of 14, four kinds at zero); the count of close calls Evan pulled in and picks he pushed out, which is the first precision and recall signal the picks have had; and the comparison report's flip rate. If the kind skew has not moved, the reasons' tests are the suspect, not a quota.

## Left to the builder

- Exact prompt wording, the per-reason examples (drawn from the dataset's own events where possible, so they are real Kansas City examples), and the two-paragraph ADR 0014 that records this change and amends 0005.
- Where in `run.ts` the override pass sits (after curation, before the picks' second own-page read, so a hand pick gets its time and price read like any pick) and how `withLaterJudgment` treats a folded pair when one side is hand-governed (my call: the hand side wins).
- The report's exact line formats, within the existing Markdown conventions.
- The sample and seed scheme for `compare-curation`, and its spend cap figure.
- Whether `closeNote` is shown anywhere but the report (my call: nowhere, for now).

## Decisions made here that Evan should check

- Six reasons, these six, one primary per pick. Fewer would merge the niche-versus-broad split; more would blur the tests.
- A close call is stored and stable, not recomputed, so the report's list does not churn.
- Overrides live in a separate committed YAML keyed by id and stand until removed, even if the event's facts change.
- Un-pick exists alongside pick.
- The calibration figure of 50 to 80 picks over the horizon, to be corrected to the truth after two runs.
- No search for curation; no quotas; recurring still excluded.
- Batching by kind then date.
- A prompt edit lands with its comparison report.
