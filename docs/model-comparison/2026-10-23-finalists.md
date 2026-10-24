# Extraction model comparison 2026-10-23

56 saved page(s) from 54 active registry source(s), each read 3 time(s) by each model through the run's own extraction (`extractPage`: the same rules, schema, skips and quote check). Its trials cost $1.83 in all (each invocation capped at $6.00). Made by `pnpm compare-models` (#222).

Not fetched: Midwest Trust Center (failed: https://www.jccc.edu/midwest-trust-center/events/: HTTP 403).

## Summary

| Model | Quote pass | Set stability | Field stability | Events/page | Verified | Quote misses | Failed calls | $/page | Total | Median s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `openai/gpt-6-luna` | 99.0% | 87.2% | 86.5% | 7.9 | 1271 | 13 | 0 of 168 | $0.0017 | $0.287 | 21.5 |
| `openai/gpt-6-luna-pro` | 99.0% | 88.0% | 89.3% | 7.8 | 1246 | 12 | 0 of 168 | $0.0048 | $0.799 | 39.8 |
| `anthropic/claude-haiku-5.5` | 99.5% | 83.9% | 90.9% | 7.6 | 1189 | 6 | 0 of 168 | $0.0044 | $0.741 | 19.7 |

- **Quote pass**: of the candidates with a usable date and a venue quoted, the share whose quotes are on the page; the rest the run would hold unverified (#220).
- **Set stability**: how far the repeats of one page find the same events (by title and first date), averaged over pages.
- **Field stability**: of the events found in two or more repeats of a page, the share read identically every time (dates, times, schedule, venue, recurrence, days, verified or not).

## Agreement with the stored records

Verified readings matched to a stored active record by page and title. The stored records are mostly `openai/gpt-6-luna`'s own past readings (some hand-fixed), so this leans toward it: a disagreement is something to read, not a wrong answer.

| Model | Matched | Date | Time | Venue | Recurrence |
| --- | ---: | ---: | ---: | ---: | ---: |
| `openai/gpt-6-luna` | 1063 | 97.6% | 94.4% | 95.7% | 98.0% |
| `openai/gpt-6-luna-pro` | 1048 | 97.6% | 94.5% | 98.4% | 98.3% |
| `anthropic/claude-haiku-5.5` | 992 | 96.7% | 92.3% | 94.6% | 99.0% |

## Hard cases

Right means a verified reading with the right fields, out of the model's trials of the case's page (a failed call counts as a miss).

| Model | Secret Show: dated monthly run, no days | Merry Market: weekend run, Sat+Sun | Farmers Market: year-round, stays recurring | Kenneth Spencer: start 19:00, not doors |
| --- | :---: | :---: | :---: | :---: |
| `openai/gpt-6-luna` | 3/3 | 3/3 | 3/3 | 2/3 |
| `openai/gpt-6-luna-pro` | 3/3 | 3/3 | 3/3 | 3/3 |
| `anthropic/claude-haiku-5.5` | 3/3 | 3/3 | 3/3 | 3/3 |

- `openai/gpt-6-luna`: Kenneth Spencer: not found ×1

## Disagreements with the stored records

### `openai/gpt-6-luna`

- KU Wind Orchestra: time stored "19:30", read "none" ×6
- Art On Walnut: date stored "recurring", read "2026-04-05–2026-10-25" ×3
- Art On Walnut: time stored "none", read "08:00" ×3
- Art On Walnut: recurrence stored "recurring", read "limited-run" ×3
- Crossroads Flea is Back at Mildred’s: date stored "recurring", read "2026-11-08–2026-11-08" ×3
- Crossroads Flea is Back at Mildred’s: time stored "none", read "09:00" ×3
- Crossroads Flea is Back at Mildred’s: recurrence stored "recurring", read "one-off" ×3
- Curious George: The Golden Meatball: time stored "19:00", read "none" ×3
- Dark Forest: time stored "19:00", read "none" ×3
- Holiday Choirs: venue stored "crown center shops", read "crown center shops, level 1 atrium" ×3
- IAKC – India Nite 2026: time stored "13:00", read "none" ×3
- Kansas vs Missouri Men’s Basketball: time stored "16:00", read "none" ×3
- KU Symphony Orchestra: time stored "19:30", read "none" ×3
- KU Wind Symphony & University Band: time stored "19:30", read "none" ×3
- Legoland Discovery Center: Brick or Treat: venue stored "crown center square", read "crown center square, south side" ×3
- Mayor's Christmas Tree Ornaments Through the Years: venue stored "crown center shops", read "crown center shops, level 2" ×3
- Mrs. Doubtfire: time stored "19:30", read "none" ×3
- Preschool Storytime: date stored "2026-10-26–2026-10-26", read "recurring" ×3
- Preschool Storytime: time stored "09:30", read "none" ×3
- Preschool Storytime: recurrence stored "one-off", read "recurring" ×3
- Preschool Storytime: venue stored "lenexa city center library", read "central resource library" ×3
- Santa Visits at Destination North Pole: venue stored "crown center shops", read "crown center shops, level 1 showplace" ×3
- Second Fridays Open Studios: venue stored "1801 east 18th street", read "zhou b art center kc" ×3
- Straight No Chaser: time stored "19:30", read "none" ×3
- The Secret Show: date stored "recurring", read "2026-10-02–2027-02-05" ×3
- …and 48 more (in the trials file)

### `openai/gpt-6-luna-pro`

- KU Wind Orchestra: time stored "19:30", read "none" ×6
- Art On Walnut: date stored "recurring", read "2026-04-05–2026-10-25" ×3
- Art On Walnut: time stored "none", read "08:00" ×3
- Art On Walnut: recurrence stored "recurring", read "limited-run" ×3
- Curious George: The Golden Meatball: time stored "19:00", read "none" ×3
- Dark Forest: time stored "19:00", read "none" ×3
- IAKC – India Nite 2026: time stored "13:00", read "none" ×3
- Kansas City Mavericks vs Wichita Thunder: date stored "2026-11-15–2026-11-15", read "2026-11-27–2026-11-27" ×3
- Kansas City Mavericks vs Wichita Thunder: time stored "16:05", read "19:05" ×3
- Kansas vs Missouri Men’s Basketball: time stored "16:00", read "none" ×3
- KU Symphony Orchestra: time stored "19:30", read "none" ×3
- KU Wind Symphony & University Band: time stored "19:30", read "none" ×3
- Mrs. Doubtfire: time stored "19:30", read "none" ×3
- Preschool Storytime: date stored "2026-10-26–2026-10-26", read "recurring" ×3
- Preschool Storytime: time stored "09:30", read "none" ×3
- Preschool Storytime: recurrence stored "one-off", read "recurring" ×3
- Second Fridays Open Studios: venue stored "1801 east 18th street", read "zhou b art center kc" ×3
- Straight No Chaser: time stored "19:30", read "none" ×3
- The Secret Show: date stored "recurring", read "2026-10-02–2027-02-05" ×3
- The Secret Show: recurrence stored "recurring", read "limited-run" ×3
- Trio Azura: time stored "14:00", read "none" ×3
- Crossroads Flea is Back at Mildred’s: date stored "recurring", read "2026-11-08–2026-11-08" ×2
- Crossroads Flea is Back at Mildred’s: time stored "none", read "09:00" ×2
- Crossroads Flea is Back at Mildred’s: recurrence stored "recurring", read "one-off" ×2
- Halloween HAUNT Art Gallery: time stored "none", read "21:00" ×2
- …and 36 more (in the trials file)

### `anthropic/claude-haiku-5.5`

- KU Wind Orchestra: time stored "19:30", read "none" ×6
- Mathis Picard, solo piano: time stored "19:30", read "none" ×6
- An Evening with David Sedaris: time stored "19:30", read "none" ×3
- An Evening with Lyle Lovett and his Small Large Band: time stored "19:30", read "none" ×3
- ASL Tour: American Prospects and Landscape Photography, 1839 to Today: venue stored "the nelson-atkins museum of art", read "galleries" ×3
- Between Image and Sound: Farhad Ostovani: venue stored "the nelson-atkins museum of art", read "atkins auditorium" ×3
- Book Social: A Reading Party: venue stored "the nelson-atkins museum of art", read "bloch lobby" ×3
- Cinema Paradiso: venue stored "the nelson-atkins museum of art", read "tivoli cinema" ×3
- Coco: venue stored "the nelson-atkins museum of art", read "tivoli cinema" ×3
- Curious George: The Golden Meatball: time stored "19:00", read "none" ×3
- Dark Forest: time stored "19:00", read "none" ×3
- Free First Friday Comedy: date stored "recurring", read "2026-11-06–2026-11-06" ×3
- Free First Friday Comedy: time stored "none", read "19:00" ×3
- Free First Friday Comedy: recurrence stored "recurring", read "one-off" ×3
- Hidden Treasures: venue stored "the nelson-atkins museum of art", read "art reference library" ×3
- Holiday Choirs: venue stored "crown center shops", read "crown center shops, level 1 atrium" ×3
- IAKC – India Nite 2026: time stored "13:00", read "none" ×3
- Kansas vs Missouri Men’s Basketball: time stored "16:00", read "none" ×3
- KU Symphony Orchestra: time stored "19:30", read "none" ×3
- KU Wind Symphony & University Band: time stored "19:30", read "none" ×3
- Legoland Discovery Center: Brick or Treat: venue stored "crown center square", read "crown center square, south side" ×3
- Mathis Picard, solo piano: date stored "2026-11-16–2026-11-16", read "2026-11-17–2026-11-17" ×3
- Mayor's Christmas Tree Ornaments Through the Years: venue stored "crown center shops", read "crown center shops, level 2" ×3
- Minds in Motion Public Tour: Portraits of Power: venue stored "the nelson-atkins museum of art", read "bloch lobby" ×3
- Minsoo Sohn, piano: time stored "14:00", read "none" ×3
- …and 52 more (in the trials file)

## Two reads

Each set-up's readings of every saved page, sent through the run's own merge and duplicate fold against the stored dataset, as Monday's run would make them (#223). Figures are the mean over the set-up's draws: each saved repeat for one read, each pair of repeats for two reads of one model, the repeats side by side for two models. The stored records are mostly one model's past readings, so a model that titles or dates them another way finds fewer of them and starts more new records.

| Set-up | Draws | Stored on pages | Verified | Kept on stored citation | Made unverified | Unsighted (a strike) | Retitled | New records | Churn | Folded | $ a run | Minutes, one after the other | Minutes, side by side |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `openai/gpt-6-luna` | 3 | 426 | 94.4% | 4.3 | 1.7 | 18.0 | 16.0 | 3.0 | 0.7 | 0.7 | $0.096 | 22.2 | 22.2 |
| `openai/gpt-6-luna` ×2 | 3 | 426 | 96.3% | 0.7 | 1.0 | 14.0 | 16.3 | 3.7 | 1.0 | 1.0 | $0.191 | 44.4 | 24.2 |
| `openai/gpt-6-luna-pro` | 3 | 426 | 93.6% | 1.3 | 5.3 | 20.7 | 14.0 | 2.0 | 0.0 | 0.0 | $0.266 | 38.9 | 38.9 |
| `openai/gpt-6-luna-pro` ×2 | 3 | 426 | 96.9% | 0.3 | 0.3 | 12.7 | 14.3 | 3.0 | 0.7 | 0.3 | $0.532 | 77.9 | 42.4 |
| `anthropic/claude-haiku-5.5` | 3 | 426 | 87.6% | 1.7 | 14.3 | 36.7 | 11.3 | 5.0 | 0.7 | 0.7 | $0.247 | 19.8 | 19.8 |
| `anthropic/claude-haiku-5.5` ×2 | 3 | 426 | 90.3% | 1.3 | 11.7 | 28.3 | 13.3 | 6.7 | 1.7 | 1.3 | $0.494 | 39.6 | 21.3 |
| `openai/gpt-6-luna` + `openai/gpt-6-luna-pro` | 3 | 426 | 96.6% | 0.3 | 0.7 | 13.3 | 16.3 | 3.0 | 0.7 | 2.0 | $0.362 | 61.1 | 38.9 |
| `openai/gpt-6-luna` + `anthropic/claude-haiku-5.5` | 3 | 426 | 96.3% | 0.7 | 1.7 | 13.3 | 16.3 | 6.0 | 2.0 | 2.0 | $0.343 | 42.0 | 24.2 |

- **Verified**: the share of the stored records read verified. **Kept on stored citation**: held only on a quote, kept on the stored one (#124, #220). **Made unverified**: hidden by an own-page reading that cited nothing usable. **Unsighted**: no reading found it, so it takes a strike. **Retitled**: given another title by a reading.
- **New records**: what the readings started, after the fold. **Churn**: of those, the ones beside an earlier record of the same page under the same title on another day, or on the same day under a title one of the two contains: likely an event under a second identity (a page listing a show on two nights counts too, so read it against the one-read set-ups). **Folded**: new records the fold caught.
- **Retitled** includes the title rules' own clean-ups of stored titles (a venue or presenter dropped, #217), which every set-up makes alike.
- **Minutes**: model time for the extraction calls alone; the run reads pages one after the other.

## Recommendation (written by hand after reading the above)

This is #223's rerun. The three finalists read the same saved pages as the 10-23 comparison (`2026-10-23.md`). They read them under the rules after #220 (keep the stored citation, quote one unbroken run), #221 (hours by season) and #223's headliner title rule. Trials started before the rule's comma exceptions ("Black Country, New Road") were added, so those few titles read the first version.

**The rule changes did what they were for.**

- Quote misses fell for every model: Luna 31 → 13, Luna Pro 21 → 12, Haiku 17 → 6.
- The hard cases are all right but one: Luna missed Kenneth Spencer once (not found), and that is the only miss left. On 10-23 Luna got the Secret Show and the Farmers Market 2 of 3 each.
- Bills are titled by the headliner by all three models on every trial: "Endrid", "Brother Ali", "Icon For Hire", "Molly McGuire".
- Haiku's agreement with the stored records rose from 917 matched to 992, with venues at 94.6% against 92.4%. It still writes the Nelson-Atkins's rooms as the venue ("Bloch Lobby", "Tivoli Cinema", "Atkins Auditorium") despite the room rule. That miss remains.

**Two reads, through the run's merge.** Measured on the 426 stored active records whose primary page is a saved page:

- **One Luna read** verifies 94.4%. The first estimate (85.8%) matched by title on the 10-23 trials; this one goes through the real merge, with #220's keep-the-stored-citation path.
- **A second read gains about 2 points, not 6:**
  - Luna ×2 reaches 96.3%; strikes fall from 18 a run to 14, and records hidden by an uncitable read from 1.7 to 1.0.
  - Luna + Luna Pro reaches 96.6%, and Luna Pro ×2 96.9%.
- **A second model buys nothing over a second Luna read.** Luna + Haiku reaches 96.3%, the same as Luna ×2. It starts more new records (6.0 against 3.7) and twice the likely duplicates (2.0 against 1.0). On its own Haiku is the weakest reader of these records: 87.6% verified, 37 strikes and 14 hidden a run. The 10-23 hint that two models beat two reads does not hold through the merge.
- **The cost is small:** about $0.10 more a week for the registry pages ($0.19 against $0.10).
- **The time is the constraint:**
  - One after the other, two reads double extraction: 22 → 44 minutes for these 56 pages alone, and the run also reads discovery pages and own pages under `weekly-run.sh`'s 90-minute timeout.
  - Side by side, a page's two reads add about 2 minutes (24.2).
- **"Retitled" is much the same (11–16) in every set-up.** It is the title rules' clean-ups of older stored titles ("An Evening with Goose" → "Goose", "… at Crown Center", "Presented by …"), which a single read makes too, not churn from a second read.

**Recommended: two reads of one model, `openai/gpt-6-luna` ×2, each page's two reads made side by side.** The second read's verified sighting confirms the first's, and the first stands, as in this measure. It saves about four strikes a week, so fewer events are wrongly struck after two misses, for about $0.10 a week and a couple of minutes. A second model adds churn and Haiku's room venues for no gain. Luna Pro alone does not beat Luna (93.6%), and its 39 s pages rule it out of the serial run. The extraction change is filed as its own ticket, #224. Staying single-model is the fallback if the change turns out not to be worth its code.
