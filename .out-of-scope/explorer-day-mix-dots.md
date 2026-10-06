# Kind-coloured "day mix" dots in the explorer's day headings

Each sticky day heading in the explorer would show a row of tiny kind-coloured dots, one per event that day, with a visually hidden text equivalent ("2 music, 1 film"). Proposed in #31 (idea 5), carried by #36.

## Why this is out of scope

The 2026-10-06 explorer critique (`site/.impeccable/critique/2026-10-06T17-22-37Z__site-src-pages-explore-astro.md`) found the dots repeat information a few lines below them. Every result row already shows its kind as an icon plus a label. Repeating that in a 14px sticky heading adds colour that carries no new meaning, which goes against "colour carries meaning" in `site/PRODUCT.md`. The hidden text also adds screen-reader noise to every one of the roughly 58 day headings.

The real colour-scanning problem is that the kind chips don't line up as a column from row to row. Aligning them fixes that without a new pattern; that's in the explorer parity issue.

## When to reconsider

If the explorer gets a day overview, build it from the front page's week strip (`WeekStrip.svelte`: one column per day with kind icons and "+n"), with each day as a jump link at the top of dated views, not as dots in the headings. That gives the explorer navigation, which it lacks, and reuses an existing pattern.

## Prior requests

- #36 (from #31): "A day mix in explorer day headings"
