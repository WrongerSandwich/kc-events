---
target: site/src/pages/index.astro
total_score: 23
p0_count: 0
p1_count: 3
timestamp: 2026-10-05T20-43-17Z
slug: site-src-pages-index-astro
---
Method: dual-agent (A: design review · B: detector + browser evidence). Both ran via the repo's own headless Playwright; the Playwright MCP browser is not installed.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Run stamp, Verified, staleness banner good; Save gives no hint where saves go |
| 2 | Match System / Real World | 2 | Limited runs filed by closing date: a show opening Thu Oct 8 sits under "Further out" |
| 3 | User Control and Freedom | 2 | No way to see saves from the front page; no jump links between sections |
| 4 | Consistency and Standards | 3 | Uppercase section labels break the spec's own plain-noun rule; host link louder than title |
| 5 | Error Prevention | 2 | Duplicate cards (127th Livestock Show x2); same-day cards sorted by title not time; dead Save buttons without JS |
| 6 | Recognition Rather Than Recall | 2 | Always there sorted by an invisible kind; saved view needs a filter on another page |
| 7 | Flexibility and Efficiency | 2 | 9,144px phone scroll, no section anchors |
| 8 | Aesthetic and Minimalist Design | 2 | Four lines of preamble; "Verified Oct 5" x19; 38-row Always there |
| 9 | Error Recovery | 2 | Staleness banner names the problem, offers no next step |
| 10 | Help and Documentation | 3 | Footer method link good; claims ("Verified", lede) don't link to it |
| **Total** | | **23/40** | **Acceptable** |

## Anti-Patterns Verdict

LLM: structure and voice are honest (no images, no hype, real why-lines), but the styling carries four AI tells: cream background (#faf8f4), uppercase tracked section labels, 3px kind-colored left stripe on every card, 19 identical stacked cards. Inter on beige is the default look.

Detector: source scan 2 x side-tab (DontMissCard.svelte:29, ResultRow.svelte:40). Built HTML: side-tab, plus a numbered-section-markers false positive (dates 10/11/12). Browser overlay: 17 side-tab, 5 tight-leading (h3 title links at 1.25, false positive for headings), single-font, cream-palette, theater-slop-phrase (in curation-written event text, not UI copy). Detector and review agree on the stripe and the cream; the detector did not flag the uppercase labels, which the review did.

## Priority Issues

- [P1] Always there undercuts the promise. 38 unranked rows, ~15 of them Power & Light bar promos, with duplicates; it is the last thing read before the footer. Fix: cut to a curated handful with a link to all recurring events in the explorer, or move it off the front page. Command: /impeccable distill
- [P1] Section placement contradicts headings. horizon.ts anchors limited runs on their close date (deliberate: "the regret is in missing the close"), so things open now appear under "Further out". Fix: place by max(open, today) and keep "closes Nov 1" in the date line; dedupe same-title same-venue runs upstream. Command: /impeccable clarify (plus a lib change)
- [P1] Slop styling instead of identity. Drop the card stripe, make section headings sentence-case real headings, rethink cream-on-Inter. Command: /impeccable typeset, then /impeccable colorize
- [P2] Metadata row crowded and repetitive: Verified on every card, Save at 28px tall, wraps to three lines on phone. Fix: show Verified only when older than the last run; move Save to a 44px target; fold host onto the venue line. Command: /impeccable layout
- [P2] Saved events have nowhere to go. Fix: "Saved (n)" in the header linking to /explore?saved=1; render Save only after hydration. Command: /impeccable harden

## Persona Red Flags

Casey (phone, one hand): Save 47x28, host links 18px tall, nav top corner; 9,144px of scroll with no jump to this weekend; save feedback is color only.
Jordan (from reddit): five-second test passes, but nothing says why to trust it up top; "Verified Oct 5" unexplained; livestock duplicates and happy-hour list read as scraped.
Sam (screen reader/keyboard): ~142 tab stops; SaveButton changes aria-label and aria-pressed (double-announces); staleness banner role=status is server-rendered so may never announce; duplicate identical links.

## Minor Observations

- Save button border uses --rule (1.24:1), barely reads as a control in light mode.
- Staleness banner floats 32px below the header rule.
- "Browse all 493 events" sits after 38 rows; repeat it after the don't-miss sections.
- text-wrap: balance on h3 gives awkward two-line titles at 1280; try pretty.
- "Further out" has no date range unlike the other two headings.
- Comedy chip #946800 at 4.67:1 is close to the AA floor.
- Dark mode is well tuned.

## Questions to Consider

- If the why-line is the product, should the card lead with it?
- What would you lose by deleting Always there from the front page?
- Should the front page stop at two weeks and say "11 more picks into December"? Calm density may mean fewer, not tighter.
- If kind matters enough to color, why can't readers filter by it here? If not, why color it?
