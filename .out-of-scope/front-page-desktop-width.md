# Widening the front page on desktop

On a desktop window the front page is one column at the reading measure (42rem), centred, while the header and the listing pages (the explorer, kind, region and venue pages, `/changes`) use the wide frame. The front page's heading does not sit under the wordmark.

## Why this is out of scope

Every way of filling the frame that has been tried read worse than the centred column, which Evan prefers on desktop too:

- **The measure ranged left** under the wordmark (#235, PR #248, 2026-10-31): the right half of the screen sat empty.
- **The rows stretched** to the frame: a pick (date, title, venue, a one-line reason) has too little in it to fill a 1,300px line. This was dropped without being built.
- **The cards as a grid** in the frame (#259, PR #268, 2026-11-04), three across and then two across: much less readable than one column of cards.
- **The picks column ranged left, with a side column** holding Always there, the calendar block and the ways to browse (#259, branch `259-sidebar`): also passed over.

The centred measure is how the front page reads, so the split stays as it is. The front page is laid out as a reading page, and only the pages of rows use the frame.

## When to reconsider

- The cards gain content that wants width (images, say), which #259 ruled out of scope.
- Readers on desktop say the page looks unfinished or hard to scan.

## Prior requests

- #235: "Front page on desktop: header and main column have different left edges"
- #259: "Front page on desktop: picks as a grid across the header's frame (prototype first)"
