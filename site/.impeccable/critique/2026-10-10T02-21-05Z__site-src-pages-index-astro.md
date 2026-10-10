---
target: homepage
total_score: 28
p0_count: 0
p1_count: 3
timestamp: 2026-10-10T02-21-05Z
slug: site-src-pages-index-astro
---
Method: dual-agent (A: design review · B: detector + browser evidence). Both used a node Playwright script against the fresh build at localhost:4400; the Playwright MCP browser is not installed.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Started labels, Saved badge, and the run stamp are good; the week strip shows Sat/Sun as empty when three picks run all weekend |
| 2 | Match System / Real World | 3 | The "Until 25 Oct" tile makes the closing date the biggest number; "other" and "Elsewhere in the metro" read as leftovers |
| 3 | User Control and Freedom | 3 | Chips and Save toggle back; the live region confirms |
| 4 | Consistency and Standards | 3 | Grey means both "started" and kind "other"; the card's kind chip looks like the clickable filter chips |
| 5 | Error Prevention | 3 | Started events keep Save and .ics, so you can add a gig that began an hour ago |
| 6 | Recognition Rather Than Recall | 3 | The calendar-plus button is labelled only by `title`, which a phone can't show |
| 7 | Flexibility and Efficiency | 2 | 4 tab stops per card, about 32 before "Later"; no way to skip between sections |
| 8 | Aesthetic and Minimalist Design | 3 | Calm and tidy; the h1 and lede take about 280px of the phone's first screen; every card repeats the same chrome |
| 9 | Error Recovery | 3 | Staleness banner and honest lines for empty sections |
| 10 | Help and Documentation | 3 | "here's how" and the footer's "How this is made" |
| **Total** | | **28/40** | **Good** |

## Anti-Patterns Verdict
LLM: mostly passes the product slop test. The palette is grey with colour only where it means something, type is one sans, rules are hairlines, and there is no marketing chrome. No side-stripes, gradient text, glass, hero metrics, eyebrows, or numbered markers. Two things look wrong:
- On a phone, a pressed Save button wraps its word to "✓ Save / d".
- Eight full cards in a row have the same shape, so on a phone the page reads as one long repeated block (4,911px tall).

Detector:
- CLI: 0 findings in source and in dist/index.html. Re-run with --no-config to rule out suppression; still 0.
- In-page: 4 findings, the same at every width and scheme.
  - tight-leading ×3 on the card h3 links (--leading-tight 1.25). A judgment call on a 2–3 line heading.
  - theater-slop-phrase ×1 on "Folly Theater", a false positive: it's a real KC venue.
- Contrast: every text pair passes AA in both schemes; the lowest is 5.03:1.
- Overflow: none at 320, 390, or 1280px.

## Priority Issues
- [P1] Started events lead "This weekend". On a Friday or Saturday evening the first cards are three grey, already-started events, so the page looks stale and the weekend looks empty. Fix: sort started picks to the end of their section or collapse them into one line; drop .ics on started events; give "started" its own treatment. Command: /impeccable layout
- [P1] The week strip says the weekend is empty when it isn't. `weekDays` (src/lib/week.ts) counts a limited run only on its opening and closing days. So Sat 10 and Sun 11 are drawn as dashed empty boxes, and screen readers hear "Sat 10: no picks", while the Livestock Show and two exhibitions run all weekend. Fix: a quiet "on now" mark or count for running picks on each day, and an honest label. Command: /impeccable clarify
- [P1] On a phone, the Saved button wraps to "✓ Save / d". The .actions column (DontMissCard.svelte, max-width:30rem) is about 56px wide. Fix: put Save and .ics in a row under the body, or show an icon with a visually hidden label, with nowrap. Command: /impeccable adapt
- [P2] Grey is overloaded: "started" and kind "other" share a tile colour, against the "colour carries meaning" principle. Fix: give "started" its own state treatment and reclassify the obvious "other" events (the Livestock Show is a festival or fair). Command: /impeccable colorize
- [P2] The phone opening is slow and the page is long: about 280px of h1 and lede, then about 2,300px of full cards. Fix: --text-2xl h1 on phones and a one-line lede; compact rows for "Next two weeks". Command: /impeccable distill

## Persona Red Flags
**Casey (phone, from /r/kansascity):**
- At 390×844 there is no live, actionable pick above the fold; the first card is a grey started one.
- The Saved word wraps on a phone.
- The 21px host links are fiddly for a thumb.

**Jordan (first-timer):**
- "Until 13 Dec" reads as the event's date.
- The card's span.chip looks clickable but isn't.
- The page never names "picks" until "These picks in the explorer".
- The calendar button is explained only by a tooltip.

**Sam (screen reader, keyboard):**
- The empty-day role="img" labels are false.
- About 32 tab stops through the cards with no per-section skip.
- Filtering by kind doesn't update the week strip.
- Focus is always visible (passes).

## Minor Observations
- **Copy and data:**
  - "First Friday · First Friday" in Always there is a duplicated schedule.
  - "Monday, Friday-Saturday, Select times" reads like raw data.
  - "Frizzi 2 Fulci : …" has a stray space before the colon.
  - The Grand Temple card's host link is therecordbar.com.
- **Repetition:** the strip says "Today 9" and every Friday tile repeats "Today 9 Oct".
- **Width:** at 1280px the Save/.ics column narrows the why lines while about 300px of gutter sits unused.
- **Pressed chip:** the only signal is a 1.5px inset ring.
- **Link copy:** "These picks in the explorer" appears twice.
- **Touch targets:** the 30px filter chips, 18px footer links, and 21px venue and explorer links are under 44px. The footer, venue, and explorer links are also under WCAG 2.2's 24px minimum, though spacing may exempt them.

## Questions to Consider
- If a pick has already started, is it still a pick?
- The why line is the product's whole differentiator; why is it the quietest (muted grey) text on the card?
- Does a "this week" homepage need an h1 on a phone, or should "This weekend, Oct 9–11" be the first thing?
