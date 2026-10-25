---
target: homepage
total_score: 28
p0_count: 0
p1_count: 2
timestamp: 2026-10-25T04-45-00Z
slug: site-src-pages-index-astro
---
Method: dual-agent (A: design review in its own Playwright MCP tab · B: `npx impeccable --json` on dist/index.html and the source, then the live detector on a CSP-stripped copy of the build). Real data, viewed Sat Oct 24 at 11:45 pm Central, after PR #240.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | "Running now" on an exhibition at 11:45 pm, the museum shut |
| 2 | Match System / Real World | 3 | "This weekend, Oct 24–25" with Saturday done; "Closes / 1 / Nov" reads as the event's date |
| 3 | User Control and Freedom | 3 | Chips toggle, All resets, Save undoes in place |
| 4 | Consistency and Standards | 3 | Two runs: "Fri–Sun" beside "Running now" |
| 5 | Error Prevention | 2 | Add to calendar on a run wrote the whole span, from a day gone |
| 6 | Recognition Rather Than Recall | 3 | "Which to use" does not say between what |
| 7 | Flexibility and Efficiency | 2 | No accelerators; the filter is not shareable |
| 8 | Aesthetic and Minimalist Design | 3 | Three chips for two cards; a saved Save is a black slab |
| 9 | Error Recovery | 3 | The copy failure's recovery line |
| 10 | Help and Documentation | 3 | "here's how", the disclosure; nothing says what a pick is |
| **Total** | | **28/40** | **Good** |

## Anti-Patterns Verdict
LLM: passes; no bans. Detector: 27 CLI findings on the build and 1 in the source, the same mix as before, all false positives (16 cramped-padding on date tiles and divided rows, 11 dark-scheme kind pairs and greys, "#188" in a comment). Overlay: "No anti-patterns found".

## Priority Issues
- [P1] Saturday night, the top section is about a day that is nearly over. Fixed: once today's picks have all begun and the rest are on later days, the first section's dates start tomorrow ("Tomorrow, Sun Oct 25" on a Saturday).
- [P1] "Running now" read as open at this hour. Fixed: a run without days says nothing under its title (the tile's "Closes" has it); its label is "Closes Sun Dec 13".
- [P2] A run's own calendar file was its whole span (Judy Chicago, Jul 14 to Dec 14). Fixed: one day to go, the first it is open and plays from the build's day, the span in the notes; feeds and the explorer's export keep the span.
- [P2] The chip row for two cards. Not chosen.
- [P2] A saved Save outweighs the card. Not chosen.
