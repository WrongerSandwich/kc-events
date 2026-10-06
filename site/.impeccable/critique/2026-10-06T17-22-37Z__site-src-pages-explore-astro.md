---
target: /explore (explorer page)
total_score: 24
p0_count: 0
p1_count: 3
timestamp: 2026-10-06T17-22-37Z
slug: site-src-pages-explore-astro
---
Method: dual-agent (A: design review · B: detector + overlay). Both passes used the repo's @playwright/test Chromium, because the Playwright MCP browser is not installed.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Live count and URL sync are good. On a phone the active slice is unnamed ("Filters (2)"), and filtering while scrolled leaves you mid-list. |
| 2 | Match with the real world | 2 | The default "All" opens on 38 "On now" long runs; there is no Fri–Sun weekend preset. |
| 3 | User control and freedom | 3 | Clear filters plus shareable URLs, but no per-filter removal. |
| 4 | Consistency and standards | 2 | Lags the front page: uppercase legends, native date inputs, mixed black and tinted pressed states. |
| 5 | Error prevention | 2 | "Export this view" writes 439 events with no count; without JS the filters are dead. |
| 6 | Recognition rather than recall | 3 | Options are visible and kinds carry an icon and label; active filters are hidden on a phone. |
| 7 | Flexibility and efficiency | 2 | 1,357 tab stops; search is the 41st; 3 stops per row; no skip to results, no jump to a day. |
| 8 | Aesthetic and minimalist design | 2 | "✓ Oct 6" ×439, a noisy host column, a ragged kind-chip column, ragged phone rows. |
| 9 | Error recovery | 3 | The empty state names the filters and offers Clear. |
| 10 | Help and documentation | 2 | "On now", "✓ Oct 6" and "●" are never explained. |
| **Total** | | **24/40** | **Acceptable** |

## Anti-patterns verdict
LLM: mostly honest. The 1280+ one-line grid is a real tool. Tells the front page has already dropped remain: uppercase tracked legends, raw native date inputs, an off-palette black pressed state. The worst trust problem is content order: conventions and gallery runs appear first.

Detector: the CLI scan is clean (0). The overlay found 271 at desktop, 22 with the comedy filter and 75 at phone width:
- Mostly truncation that ResultRow intends (`a.host`, `span.venue`).
- One token, `--leading-tight` 1.25, counted 55–73 times.
- `p.why` at about 124 characters per line.
- False positives: single-font (Geist only, a deliberate choice) and theater-slop-phrase (adjacent kind labels).
- Real bug the design review missed: `span.when` is cut off on 37 dated rows. "10:00 am, runs through Sat Oct 10" overflows the 11.25rem column, whose comment in ResultRow.svelte assumed no start time before "runs through".

## Priority issues
1. **[P1] The default view buries the job.** On desktop the weekend starts 2,253 px down, behind 38 "On now" runs. Fix: lead with dated days, collapse "On now" to one summary line, and add a Fri–Sun "This weekend" preset; consider defaulting to the next 7 days. Commands: /impeccable distill, /impeccable clarify.
2. **[P1] Phone rows and touch targets.** Save is 47×17 px, rows wrap unpredictably, and a phone scroll is 41,440 px. Fix: a fixed two-line phone row, a 44 px Save, and host and verified dropped below 800 px. Command: /impeccable adapt.
3. **[P1] Keyboard and screen-reader path.** Search is the 41st stop, each row takes 3 stops, the skip link misses the results, and the live count announces on every keystroke. Fix: search in the result bar, "Skip to results", host out of the tab order, a debounced count. Command: /impeccable harden.
4. **[P2] The active slice is invisible.** Fix: removable filter pills in the sticky bar, scroll to the top on change, the phone sheet closed at first render (it currently causes a 685 px layout shift), and a no-JS notice. Commands: /impeccable harden, /impeccable clarify.
5. **[P2] Lags the front-page language; the kind colour doesn't form a column.** Fix: shared columns (subgrid) so chips align, a visible don't-miss treatment, sentence-case legends, From/To behind "Custom dates…", and the `.when` truncation fixed. Commands: /impeccable polish, /impeccable typeset.

## Persona red flags
- **Casey (phone, from a shared link):** "Filters (2)" without saying which; "On now" exhibitions first; a 17 px Save; the sheet pushes results 685 px down; a tempting bulk Export.
- **Sam (keyboard and screen reader):** 41 tabs to search; 3 stops per row; a chatty live count; Show toggles that are `role=switch` but look like checkboxes; the "Saved , 2" accessible name.
- **Evan (power user):** venue sort has no venue headings; no jump to a day; no export of saved events; no per-filter removal.

## Minor observations
About 240 px of chrome above the first result; sticky day headings let rows peek beneath them; kind names leak the data model ("outdoors/community"); Export should say "Add 45 to calendar"; `--fg-faint` columns compete.

## Questions
- Should the default be a week rather than "All"?
- What would anyone lose if host and verified lived only on the event page?
- Should search plus "This weekend" be the only things above the fold, with the facets as the drill-down?

## Issue #36 verdicts
- **Shortcuts: reshape.** Keep "/" (focus search) and Esc now. Defer j/k/s/c until rows are one stop each (roving tabindex) after the P1 keyboard fixes. Drop the "?" overlay.
- **Day-mix dots: drop as specified.** They duplicate the per-row chip and make 58 headings verbose. If an overview is wanted, reuse WeekStrip as day jump links at the top of dated views.
