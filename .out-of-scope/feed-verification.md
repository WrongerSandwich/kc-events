# Verifying events from ICS or RSS feeds

Registry sources point at venues' HTML calendar pages, not at their ICS or RSS feeds, and an event's date and venue count as read only from its primary page. There is no path by which an event verifies against a feed.

## Why this is out of scope

A feed entry carries its own page's URL (the ICS `URL:` line, the RSS `<link>`), and the extractor rightly cites that page as the event's primary page. The run never fetches it, so cite-or-drop (ADR 0002) leaves every feed-read event `unverified`. In a scratch run on 2026-10-03, nine feed sources gave about 99 events and almost none verified; the same sources as calendar pages gave 92 of 92 active.

Making feeds work would mean letting a reading count as cited from the feed while the event keeps its own page as primary. That amends cite-or-drop, and it brings problems the calendar page doesn't have:

- **Drift.** A stale feed can disagree with the event's own page. An event the feed keeps showing would never have its page checked.
- **Cost.** An ICS feed is several times the size of the same venue's page text, about 17KB against 2–4KB.
- **Volume.** Feeds don't reliably list more events: Bottleneck gave 17 from its feed and 10 from its page, but Replay Lounge gave 25 from its feed and 37 from its page.

The case for doing it was correctness: a feed's structured dates might beat a calendar page's prose. The milestone one audit (`docs/milestone-one-grading.md`) found zero wrong published dates, on feed sources or anywhere else. The only gain left is coverage. Seven events, four from American Royal and three from KC Parks, were held because their calendar pages name no venue, and an ICS `LOCATION:` might have supplied one. ADR 0002 says coverage is fixed by adding sources, not by changing what counts as cited.

Each source's feed URL stays in its registry `notes` ("ICS feed at ..."), so the work is easy to pick up if this changes.

## When to reconsider

- A calendar page on a source that has a feed publishes a wrong date or time, and the feed has it right.
- Events held for "no venue could be cited" on feed sources grow from a handful into a real gap in coverage.

## Prior requests

- #13: "Verify events read from an ICS or RSS feed"
