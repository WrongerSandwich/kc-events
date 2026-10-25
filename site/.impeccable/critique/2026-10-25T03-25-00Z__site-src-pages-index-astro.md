---
target: homepage
total_score: 28
p0_count: 0
p1_count: 2
timestamp: 2026-10-25T03-25-00Z
slug: site-src-pages-index-astro
---
Method: dual-agent (A: design review in its own Playwright MCP tab · B: `npx impeccable --json` on dist/index.html, then the live detector on a CSP-stripped copy of the build, since the site's CSP blocks the injected script). Real data, viewed Sat Oct 24 at 9:41 pm Central, after PR #233.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | "On now" on an exhibition at 9:40 pm, with the museum shut |
| 2 | Match System / Real World | 3 | "3 already started today" includes a race that ended twelve hours ago |
| 3 | User Control and Freedom | 3 | All first and pressed; chips and Save toggle back |
| 4 | Consistency and Standards | 2 | "Add to calendar" (one event's file) beside "In your calendar" (a feed) |
| 5 | Error Prevention | 3 | A kind chip can filter the weekend to nothing |
| 6 | Recognition Rather Than Recall | 3 | Every icon has its word |
| 7 | Flexibility and Efficiency | 3 | The filter covers this weekend only |
| 8 | Aesthetic and Minimalist Design | 3 | A lone chip wraps at 1440; the saved Save outweighs the title |
| 9 | Error Recovery | 2 | A filter emptied by started picks says nothing |
| 10 | Help and Documentation | 3 | "here's how", the inline calendar steps |
| **Total** | | **28/40** | **Good** |

## Anti-Patterns Verdict
LLM: passes. No bans; grey chrome, colour only for kinds and the don't-miss state; no em dashes, "we" or exclamation marks in the rendered text.
Detector: 27 CLI findings, all judged false positives (16 cramped-padding on date tiles, divided rows and a wrapper; 11 colours that are DESIGN.md's dark-scheme kind pairs and greys, or "#188" in a comment). The browser overlay: "No anti-patterns found".

## Priority Issues
- [P1] Chips counted started picks: "2 film" at 9:41 pm left no cards and announced "Showing 2 film picks". Fixed: chips count what is still to come; a kind with nothing left loses its chip and lets its filter go.
- [P1] Late-day labels: "On now" with no hours known; "already started today"; a span's timed last day (Dark Forest, 7 pm) stayed a card after it began. Fixed: "Running now", "N earlier today", and the last day folds once begun.
- [P2] "In your calendar" sat between Later and Always there, a block of instructions with the page's only monospace. Fixed: "The picks as a calendar", after Always there, two controls in a row, the steps behind "Which to use".
- [P2] Kind names in three forms (slash chip, card chip, By kind words). Left: written-out chip names wrapped the row to four lines on a phone (tried 10-24).
- [P3] "1 theater/dance" alone on a second row at 1440. Not seen after the fix (fewer chips late in the week); not addressed directly.

## Minor Observations
- Later rows' venue column is ragged (each row its own grid).
- A saved Save is a solid ink block, heavier than the title.
- Header on the wide frame, content on the measure (known, left).
