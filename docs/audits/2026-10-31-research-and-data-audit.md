# Research and data audit, 2026-10-31

An analysis and critique of how the job researches events and how it stores them, asked for on 2026-10-31 and written by Claude in one session. It reads the proposal, the domain context, the thirteen ADRs, the three prompt documents, the config and the registry, the run pipeline (`src/run.ts`, `extraction.ts`, `identity.ts`, `curation.ts`, `expiry.ts`, `discovery.ts`, `own-page.ts`), the committed dataset at `bb160a7` (1,595 records after the 2026-10-26 run), all twelve run reports, the two earlier audits, the model comparison, and the open and closed issues. One finding was checked against a live page (the Kemper Museum's homepage). The site's design and copy are not in scope; the 2026-10-21 audit covered them.

Its actionable findings are filed as #250 to #258; the smaller ideas it left are a comment on the parking lot, #101.

## Synthesis

The research design is sound and its core promise holds. Cite-or-drop, checked in code since #74, has produced no known wrong published date in four weeks of runs; the 10-21 audit's 24-event sample found every pick's date, time and venue right. The ADR trail shows every failure class found so far being closed, and the test suite, the golden runs and the model comparison make the pipeline unusually legible for a four-week-old job.

The weaknesses are now elsewhere.

1. **Readers see model variance.** Every verified re-reading replaces the stored record wholesale, so descriptions, kinds, venue spellings and own-page links are rewritten each Monday whether or not the page changed. Between the 10-23 and 10-26 datasets, 38% of descriptions and 7% of kinds changed on events active in both runs.
2. **One confirmed wrong-link class.** Own-page links are chosen by position number and never checked. On the Kemper Museum's card layout nine of ten upcoming programs link to the previous card's page, so "Details and tickets" opens another event.
3. **Most records never get the read that would complete them.** Only picks and one source get own-page reads. Of 328 upcoming dated events, 297 have an own page the job has never read; 157 have no description, 79 non-exhibitions have no time, 15 of 406 active events have a price. Curation judges half the set from the title alone, and the picks sit at 20 against the 30 to 50 the proposal names.
4. **Weekly cadence against a weekend product.** The run is Monday morning. The "This weekend" list is five days old by Saturday, a midweek cancellation shows until the next Monday, and a dropped listing takes two Mondays to expire.
5. **Discovery has become a registry sensor with a stuck queue.** Since the promoted-hosts rule, it has added three active events in six weeks for a third of the run's model calls, and its promotion suggestions have waited up to sixteen runs.
6. **Spend is not the constraint; time and attention are.** A run costs $0.35 of a $5 cap and 38 minutes, with model calls made one page at a time. Everything above is affordable; most of it is blocked only by the serial loop and by hand steps nobody has time for.

## The numbers

From the committed dataset after the 2026-10-26 run, that run's report, and a field-level diff of the 10-23 and 10-26 datasets (`615173c` against `73a2d82`).

| Measure | Value |
| --- | ---: |
| Records in `data/events.json` | 1,595: 406 active, 119 unverified (92 held for promotion), 1,070 expired |
| Expired, by reason | past 565, index-page 194, two-strike 137, duplicate 132, promotion 18, stale 15, not-public 7, cancelled 2 |
| Active, by class | one-off 327, limited run 63, recurring 16 |
| Active, by lane | registry 380, discovery 26 |
| Upcoming dated events with an own page never read | 297 of 318 |
| Active dated events with no time | 118 of 390 (Screenland 31, Crossroads 8, Kauffman 8, Nerman 7, T-Mobile 7) |
| Active events with no description | 190 |
| Active events with a price / an age limit / days on a run | 15 / 5 / 6 of 63 |
| Picks | 20 (music 8; one source at most 2) |
| Spend per run | $0.35 of $5 (Luna $0.27 over 182 calls, Sonnet $0.08 over 4) |
| Run time | 38 minutes |
| Model calls per run, by stage (inferred) | about 114 registry reads, 59 discovery, 11 own pages, 4 curation |
| Discovery-led records since 10-19 | 29: 19 held, 3 active, 4 past, 2 promotions, 1 duplicate |
| Promotion queue | kcwineco.com 16 runs, kcai.edu 9, kansascitybrewfest.com 5, bonnersprings.org 3, lenexa.com 3 |
| Fields changed between 10-23 and 10-26 on the 361 events active in both | `evidence.venue` 183, `description` 136, `evidence.date` 59, `kind` 24, `title` 20, `eventUrl` 17, `venue` 15, `start` 13 |
| Active events last judged before 10-12 | 53 on 10-03, 9 on 10-06, 7 on 10-07, 9 on 10-09, 38 on 10-10 |
| Sources | 56 active, 13 excluded; 6 browser-fetched; 1 with `readEventPages` |
| Extraction rules | about 5,000 words, sent with every page |

Run history, from the reports:

| Run | Minutes | Spend | Found | New | Discovery pages extracted | Curation calls / flagged |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10-03 | 22 | $0.39 | 521 | 237 | 65 | 11 / 10 |
| 10-10 | 34 | $0.21 | 518 | 19 | 53 | 2 / 0 |
| 10-13 | 35 | $0.31 | 632 | 87 | 44 | 6 / 7 |
| 10-19 | 32 | $0.24 | 472 | 21 | 69 | 3 / 3 |
| 10-23 | 39 | $0.28 | 441 | 40 | 68 | 4 / 5 |
| 10-26 | 38 | $0.35 | 459 | 63 | 59 | 4 / 9 |

## Findings

Ranked by what a reader would notice first. Each names the issue it went to.

### 1. Own-page links are chosen by position and land on the previous card's page (#250)

`readPage` writes each followable link as a number after the linked text, and the model names an event's own page by number; `linkedPage` resolves the number against the page's anchors and checks only that the link is on the venue's site or a platform. On a card layout where the whole card is one anchor, the marker lands after the card's text, so the next card's title sits between `[n]` and `[n+1]`, and the model takes `[n]`.

Checked against the live Kemper homepage on 2026-10-31: nine of its ten upcoming programs carry the previous card's link (Open Drawing+ links the October curator talk, Silent Concert links the November curator spotlight, Totally Tots links Beyond the Studio, and so on; the table is in #250). A slug-against-title heuristic over the whole active set found no other source with the pattern, but `eventUrl` changed on 17 of 361 events between the last two runs, so the choice is unstable elsewhere too. The 10-10 audit suggested keeping the anchor text and checking it against the title; the idea went to the parking lot. The eight upcoming Kemper links are hand-fixed with this audit as a stopgap; the 11-02 run will overwrite them until #250 lands.

### 2. A verified re-reading rewrites what the model wrote, every week (#251)

`refreshReading` spreads the whole new reading over the stored record and keeps a stored value only when the new one is the same text (title variants, whitespace-equal quotes) or came from an own-page read. Between 10-23 and 10-26, on the 361 events active in both runs: 136 descriptions reworded with no change of meaning, 24 kinds flipped (Dark Forest outdoors/community to theater/dance, Kyle Gordon comedy to music, Muppet Christmas Carol music to film), 15 venues respelled (four Liberty Hall events to "644 Massachusetts St"), 183 venue quotes re-cut.

A kind flip moves an event between kind pages and the per-kind calendar feeds; a description rewrite changes the event page's text; a venue respelling moves it between venue pages until an alias catches it. ADR 0005 asked for page stability week to week and ADR 0006 (#82) for a weekly diff that carries what changed; model variance now dominates both. The fix is the rule the own-page reads already use: keep the stored value when the reading agrees on day and venue, and replace a description only when the stored one is absent or a listing line.

### 3. Weekly cadence against the weekend list (#253)

The run is Monday at 6:17. The front page's "This weekend" is five days old by Saturday; a cancellation posted Tuesday is listed until the next Monday; two-strike expiry takes two Mondays to drop a listing the venue removed. The daily deploy re-renders the same data. The events in the next ten days number about 100 on about 40 primary pages, so a Thursday re-verification-only pass is about 40 pages at one read each, under $0.10 and ten minutes.

### 4. Time, price and description coverage is capped by design (#254)

Own-page reads are the one path to a time the list omits, a price, an age limit, a run's days and a fuller description, and only picks and the Lied Center get them (ADR 0009 as amended by #123 and #133). Of 328 upcoming dated events, 318 have an own page and 297 have never had it read. Curation sees no description for 47% of events; the prompt rightly refuses to flag an unknown title with no description, so picks skew to names the model knows and sit at 20. Screenland's 31 films have no time though their own pages do and the source already has an own-page selector. The mechanism holds up: the 10-21 audit found every sampled own-page quote verbatim. Reading every upcoming event's own page once per date and page is about $0.26 for a first pass of 150 and about $0.10 a week after.

### 5. Discovery costs a third of the run and yields almost nothing (#255)

Per run: 10 searches, 13 index pages read for links, 59 primary pages extracted, perhaps 20 of 38 minutes. Since the promoted-hosts rule (ADR 0012, #103) discovery has started 29 records, 3 of them now active. All 26 active discovery-led events in the dataset are on hosts the registry has since admitted; discovery found them before the source was added, which is the lane working as designed, once. Its output now is the promotion queue, and the queue is stuck: kcwineco.com has been suggested in 16 runs, kcai.edu in 9. Pages on suggested hosts are fetched and extracted again every week to refresh a hold that promotion would re-read anyway. Lifetime, 194 of 646 discovery-led records expired as index-page, before the aggregator list caught up. The lane is worth keeping as a sensor; it is not worth a third of every run.

### 6. The run is latency-bound, which blocks 3 and 4 (#252)

`extractFromPages`, `discover`, `reverify` and the own-page reads all await one page at a time; only a page's two reads start together. At Luna's 21-second median, 111 pages is most of the 38 minutes. Fetches are already throttled per origin by the fetch policy, so three or four pages in flight across origins is safe. The model comparison set Luna Pro aside as the second read because serial reads would take the run to 75 minutes; with a pool that objection goes.

### 7. Curation judgments outlive the prompt that made them (#256)

Curation re-judges only on a fact change. 53 active events were last judged on 10-03 and 38 on 10-10, before the calibration (#80), the description input (#79) and the no-dates rules (#234). Nothing records which prompt judged an event. A prompt hash on the judgment, with a re-judge when it differs, is 16 calls and about $0.30.

### 8. Two hand-kept venue lists overlap, and neighborhoods still come from model geography (#258)

`venueNeighborhoods` in the config has six rows and the job applies them every run; `data/venues.yaml` has 169 rows with addresses and positions and the job never reads it (ADR 0013). Neighborhood is the one field the extractor fills from its own knowledge, which left 26 events in the catch-all at 10-26 and "Mission Woods" proposed twice for the 1900 Building. A `neighborhood` column on the venue table, read by the job, would place known venues deterministically and retire the config map. This amends an ADR, so it is filed as a decision.

### 9. The report's call list cannot attribute spend or time (#257)

Each model call records model, provider, generation id and cost, which reconciles a month against OpenRouter, but not its stage or duration. The per-stage split above is inferred from counts. Items 3, 4 and 6 change the split and need the measure.

### 10. Smaller points

- **Evidence quotes are the model's choice of span**, not a stable citation: half of them were re-cut between two runs on unchanged pages. #251 keeps a stored quote while it is still on the page.
- **Unverified has three sub-states** (never verified, hidden since verified, held for promotion) read off other fields. A named reason would make the report and the invariants plainer. Parked on #101.
- **No presenter field** once the title rules strip "X presents", and **no corroboration count** when a second page with standing confirms an event. Both parked on #101.
- **The extraction rules are 5,000 words** and grow with venue-specific patches (the Secret Show, the Merry Market, The Bird). `checkHints` is the right home for those, and the comparison harness with its cached pages is most of a prompt-edit gate; the parking lot's trigger for one, weekly prompt edits, has been met. Parked on #101.
- **Identity is ten amendments deep** and still reports three likely duplicates a run. A model-judged tie-break for the "Likely duplicates" pairs, pennies a run, may be cheaper than an eleventh rule. Not filed; the section is doing its job.
- **The feed decision** (`.out-of-scope/feed-verification.md`) rests on a 10-03 scratch run before the quote check existed. A narrower use, an ICS `DTSTART` as a time source under the same quote check, is parked on #101; #254 covers the same gap through own pages.
- **Coverage gaps the registry itself names**: food/drink has one active event; comedy two sources; KC Rep, Starlight, Union Station and Funny Bone are excluded for reasons that stand. KC Rep's production pages name the hall, so listing them as `urls` the way the American Theatre Guild's are would bring it in. Not filed; a registry edit.

## What is working and should stay

- Cite-or-drop with the quote check in code (#74), the kept-on-stored-citation rule (#124, #220) and the two reads (#224): 96% of stored records verified a run, no known wrong published date.
- The standing rules (ADR 0008 as amended): a page the search ranked cannot cancel or move an event.
- The hold on discovered hosts (ADR 0012): the site shows only what a person has looked at.
- The one seam, the fakes, the golden runs and the comparison harness: every finding above could be measured from committed files in an afternoon.
- Spend: $0.35 a run, about $1.50 a month, with two layers of cap.

## Not checked, and why

- The site's design, copy and accessibility: the 10-21 audit's lanes A, B and F.
- Every own-page link against its page: one host was checked by hand after the slug heuristic singled it out; #250's acceptance covers the rest.
- Whether the model comparison's stability figures changed since 10-23: no new run of it.
- The home machine's cron, logs and health issue beyond #106's recent comments.

## Method notes

- The field-level diff: `git show 615173c:data/events.json` and `git show 73a2d82:data/events.json`, events active in both, each field compared as JSON.
- The own-page link heuristic: for active events with a wordy slug, no shared word stem between title and slug; 61 flagged, most false positives from query-string URLs and ticket ids, one host (Kemper) confirmed by fetching the page and listing its anchors.
- Stage counts: registry pages × 2 reads, discovery pages extracted, own pages read, curation calls, from the 10-26 report; the call list carries no stage (#257).
