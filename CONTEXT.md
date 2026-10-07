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
The page on the event's own web presence (venue calendar, promoter page, organizer site) from which its date and venue were read. Verification and identity hang on it.
_Avoid_: official page, canonical URL, source page

**Own page**:
The event's own page (`eventUrl`), when the primary page links one: its details or its tickets, on the venue's site or a ticketing platform. Where the site's "Details and tickets" sends the reader. Named by the extractor as a link number, resolved by the job against the page's own anchors, never fetched, and no part of verifying; an event whose primary page links none sends the reader to the primary page instead.
_Avoid_: event page (the site's page for the event), ticket link, link-out

**Recurrence class**:
Which of three shapes an event's occurrence takes: one-off, limited run, or recurring. Derived from page evidence, not judgment.

**One-off**:
An event that happens once, including a short consecutive span such as a festival weekend or a band playing two nights.

**Limited run**:
An event that happens over a bounded span with a known end date, such as an exhibition or a theatre run.

**Recurring**:
An event that repeats indefinitely on a schedule, such as a monthly market, First Fridays, or a museum's weekly tour.

**Promotion**:
A business's own standing night, or a bar's watch party, listed as if it were an event: a happy hour, a food or drink special, a themed or DJ night, trivia, karaoke, a game-day party. Never an event, whatever it offers; extraction skips it. A recurring event is bigger than one business's night. A class or workshop is never a promotion, wherever it is held.
_Avoid_: special, deal

**Schedule phrase**:
How a recurring event repeats, in a few words from its page ("Every Tuesday, 7pm"). A recurring event carries it instead of a start and end date. A sports team's season is one recurring event with a schedule phrase, not a one-off per game.

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
Whether an event is publishable: `active` (verified and current), `unverified` (not yet, or no longer, meeting cite-or-drop), or `expired`. An expired event carries a reason: `past`, `two-strike`, `cancelled`, `index-page` (its primary page was an index page), or `duplicate` (another record turned out to be the same event and was seen first). A postponement with a new date is a date change, not an expiry.

**Last-verified**:
The date of the most recent run that read the event's date and venue from its primary page. Shown on every published event.

**Last-changed**:
The run that first saw an event or last changed its date, venue, or status. Curation re-judges an event only when it has changed since it was last judged.

**Last-judged**:
The run that last judged an event for the don't-miss flag. Absent until curation has seen the event; a run the spend cap cuts short leaves it absent, so the event comes up again.

**Lead**:
How an event was first found: which registry source or which discovery search.

**Venue**:
The place an event happens. A venue is not the same as a source, even when the venue's website is a source. One venue can go by several names: the building, a room inside it ("Helzberg Hall" at the Kauffman Center), or a program that runs there ("Tivoli Cinema" at the Nelson-Atkins). These are its **venue aliases**, kept by hand; event identity treats them as one venue.
_Avoid_: location, room (when meaning the venue as a whole)

**Neighborhood**:
The part of the metro a venue is in, from a controlled list, shown on the site in place of a street address: the most specific place name people use, a district in the core ("Crossroads") or a city in the suburbs ("Olathe"). The list is the config's, grouped by region, plus the catch-all "elsewhere in the metro", which is in no region; an address that maps to nothing lands there and is flagged as unmappable in the run report. A stored neighborhood the list no longer holds (a region name from before regions, a renamed neighborhood) is placed again in any run in which no page re-reads the event: the list's spelling, the event's registry source's neighborhood for the name of the region that lists it, or else the catch-all; the run report names each such value. A registry source's neighborhood must be on the list.

### Research

**Run**:
One execution of the research job: check sources, discover, extract, verify, curate, publish.

**Run report**:
The committed record of one run: counts, spend against the cap, per-source results, sources failing repeatedly, unmappable neighborhoods, and promotion suggestions.

**Promotion**:
Moving a source that the discovery lane has found events on in two runs into the registry. The run tracks discovery sources by host (a ticketing platform is no one source and is never suggested). Always a suggestion in the run report, acted on by hand; never automatic.

**Source**:
A venue, institution, or organizer whose page or feed the research job checks. A source produces leads; it is not an event.
_Avoid_: site, feed (when meaning the thing we check)

**Registry**:
The committed list of sources checked on every run. Hand-editable.
_Avoid_: whitelist, seed list

**Registry lane**:
The part of a run that checks every registry source directly.

**Candidate**:
One event as the extraction model reports it from a single page, before cite-or-drop decides whether it becomes an active or unverified event. A candidate is not yet in the dataset.
_Avoid_: result, hit, extraction

**Sighting**:
A candidate after cite-or-drop has made it an active or unverified event, together with whether its page says it is cancelled. A run matches each sighting against the dataset by event identity.
_Avoid_: match, hit

**Strike**:
One run in which an active event's primary page loaded and no longer listed it, or told the job it is gone (not found) or may not be read (its `robots.txt` now disallows it). A page that loaded without an event starting after the weeks the run researches (`horizonWeeks` in the config, not the site's horizon buckets) is not a strike: extraction is asked only for events within those weeks, so leaving it out says nothing. Any run that lists the event clears its strikes; the second consecutive strike is two-strike expiry.

**Outage**:
One run in which an event's primary page could not be loaded: the connection failed, the site refused the job, or it errored. An outage says nothing about the event, so it is not a strike. An event is held as it was through a few consecutive outages, then becomes `unverified` until its page loads and lists it again.
_Avoid_: failed check, strike (when the page never loaded)

**Extraction rules**:
The editable document (`prompts/extraction-rules.md`) sent to the extraction model with every page. The first of the two editorial surfaces; a wrong date in the dataset is a bug here first.
_Avoid_: prompt (when meaning this document specifically), system prompt

**Curation prompt**:
The editable document (`prompts/curation-prompt.md`) sent to the curation model with every curation call, which judges active one-offs and limited runs in batches. The second of the two editorial surfaces; a flag that reads as arbitrary is a bug here first.
_Avoid_: prompt (when meaning this document specifically), system prompt, curation rules

**Reading**:
One value an event carries, its date or its venue, together with the evidence snippet it was read from. The grading audit checks each reading against its primary page.
_Avoid_: extraction, value

**Evidence snippet**:
The exact text, quoted verbatim from the primary page, that a date or venue was read from. Stored beside the value so it can be audited without re-fetching.
_Avoid_: citation, quote, proof

**Discovery lane**:
The part of a run that uses web search to find events outside the registry.

**Aggregator**:
A third-party events listing site. Read only as an index of leads, never as a source of published text or facts.

**Index page**:
A page read only for its links to events, never as a primary page: every page on an aggregator, and a ticketing platform's listing pages (search, browse, and category listings), whose individual event pages are primary pages. An event whose primary page turns out to be an index page is expired, not struck.
_Avoid_: listing page, directory page (when meaning this)

**Cite-or-drop**:
The rule that an event publishes only if its date and venue were read from its fetched primary page. Anything less is held as `unverified` and never rendered.

**Two-strike expiry**:
The rule that an active event which takes a strike on two consecutive runs becomes `expired` on the site while staying in the dataset. Outages do not count toward it.

**Spend cap**:
The per-run cost ceiling, enforced by the loop from the cost returned on every model call and backstopped by a monthly limit on the API key itself. When hit, the run publishes what it verified and logs the shortfall.

**Excluded source**:
A source the job knows about but does not fetch, with the reason recorded: its `robots.txt` disallows it, its pages cannot be read (listings rendered by script, or the site refuses the job's fetcher), or its information is not worth checking.

### Site

**Don't-miss list**:
The top section of the site: one-offs and limited runs carrying the don't-miss flag, grouped by horizon.
_Avoid_: picks, highlights, featured

**Region**:
A group of neighborhoods at the scale of a trip decision (Central KC, Johnson County, the Northland). Fixed by the config, which lists each neighborhood under one region, not read from any page: an event's region is its neighborhood's. What the site lets a reader browse by; the neighborhood is what each event shows.
_Avoid_: area, zone

**Horizon**:
The time bucket a don't-miss event falls into: through Sunday (headed "This weekend" Thursday to Sunday, "This week" Monday to Wednesday), next two weeks, further out (headed "Later, after <date>" and listed one line each). A one-off is bucketed by its start, a limited run by when it can first be seen: its opening, or today once it is open. Its closing date stays in its date line.

**Always there**:
The section below the don't-miss list: a short, hand-kept list of recurring events (`site/src/always-there.ts`). Every recurring event is in the explorer.

**Methods page**:
The page explaining how the site is made and where to report a wrong listing.

**Staleness banner**:
The notice shown on every page when the last successful run is more than nine days old. The site cannot see a failed run (a failed run commits nothing), so age is the proxy: a weekly cadence plus two days of slack.

**Explorer**:
The page that lets a reader slice every active event by date, kind, region, don't-miss, recurrence, and search, with the filters in the URL so a view can be shared.
_Avoid_: browse page, search page, list view

**Event page**:
The page for one active event, at `/e/<id>`: its date, venue, why-line when flagged, primary link, calendar file, last-verified stamp, and corrections link.
_Avoid_: detail page, listing page
