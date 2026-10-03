# KC Events

A weekly-researched, ad-free picture of what is worth doing in Kansas City, built around one structural idea: which events are don't-miss because they won't come around again, versus which are always there.

## Language

### Dataset

**Event**:
A single thing happening at a venue over a date range, recorded once in the dataset regardless of how many sources mention it. Its identity is its primary page plus its title, so a date can move without making a new event.
_Avoid_: item, listing, entry

**Published dataset**:
The `events.json` the site publishes alongside its HTML. It is the interface between the research job, the site, and any downstream reader.
_Avoid_: database, feed, API

**Primary page**:
The page on the event's own web presence (venue calendar, promoter page, organizer site) from which its date and venue were read.
_Avoid_: official page, canonical URL, source page

**Recurrence class**:
Which of three shapes an event's occurrence takes: one-off, limited run, or recurring. Derived from page evidence, not judgment.

**One-off**:
An event that happens once, including a short consecutive span such as a festival weekend or a band playing two nights.

**Limited run**:
An event that happens over a bounded span with a known end date, such as an exhibition or a theatre run.

**Recurring**:
An event that repeats indefinitely on a schedule, such as weekly trivia, a monthly market, or First Fridays.

**Don't-miss flag**:
The editorial call that a one-off or limited run is worth going out of your way for. Never applied to recurring events.
_Avoid_: featured, top pick, interest score, rating

**Why-line**:
The one sentence stating why an event carries the don't-miss flag.
_Avoid_: blurb, description, summary

**Kind**:
The category of an event, from a fixed taxonomy.
_Avoid_: type, category, genre

**Status**:
Whether an event is publishable: `active` (verified and current), `unverified` (not yet, or no longer, meeting cite-or-drop), or `expired`. An expired event carries a reason: `past`, `two-strike`, or `cancelled`. A postponement with a new date is a date change, not an expiry.

**Last-verified**:
The date of the most recent run that read the event's date and venue from its primary page. Shown on every published event.

**Lead**:
How an event was first found: which registry source or which discovery search.

**Venue**:
The place an event happens. A venue is not the same as a source, even when the venue's website is a source.

**Neighborhood**:
The part of the metro a venue is in, from a controlled list, shown on the site in place of a street address. "Lawrence" and "elsewhere in the metro" are the catch-alls.

### Research

**Run**:
One execution of the research job: check sources, discover, extract, verify, curate, publish.

**Run report**:
The committed record of one run: counts, spend against the cap, per-source results, sources failing repeatedly, unmappable neighborhoods, and promotion suggestions.

**Promotion**:
Moving a source that the discovery lane has found twice into the registry. Always a suggestion in the run report, acted on by hand; never automatic.

**Source**:
A venue, institution, or organizer whose page or feed the research job checks. A source produces leads; it is not an event.
_Avoid_: site, feed (when meaning the thing we check)

**Registry**:
The committed list of sources checked on every run. Hand-editable.
_Avoid_: whitelist, seed list

**Registry lane**:
The part of a run that checks every registry source directly.

**Discovery lane**:
The part of a run that uses web search to find events outside the registry.

**Aggregator**:
A third-party events listing site. Read only as an index of leads, never as a source of published text or facts.

**Cite-or-drop**:
The rule that an event publishes only if its date and venue were read from its fetched primary page. Anything less is held as `unverified` and never rendered.

**Two-strike expiry**:
The rule that an active event which fails re-verification on two consecutive runs becomes `expired` on the site while staying in the dataset.

**Spend cap**:
The per-run cost ceiling, enforced by the loop from the cost returned on every model call and backstopped by a monthly limit on the API key itself. When hit, the run publishes what it verified and logs the shortfall.

**Excluded source**:
A source the job knows about but does not fetch, because its `robots.txt` disallows it or its information is not worth checking, with the reason recorded.

### Site

**Don't-miss list**:
The top section of the site: one-offs and limited runs carrying the don't-miss flag, grouped by horizon.
_Avoid_: picks, highlights, featured

**Horizon**:
The time bucket a don't-miss event falls into: this weekend, next two weeks, further out.

**Always there**:
The section below the don't-miss list that lists recurring events.

**Methods page**:
The page explaining how the site is made and where to report a wrong listing.

**Staleness banner**:
The notice shown when the last run failed and the site is serving last-good data.
