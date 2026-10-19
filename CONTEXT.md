# KC This Week

A weekly-researched, ad-free picture of what is worth doing in Kansas City, built around one structural idea: which events are don't-miss because they won't come around again, versus which are always there.

## Language

### Dataset

**Event**:
A single public, in-person thing happening at a venue over a date range, recorded once in the dataset regardless of how many sources mention it. Its identity is its primary page plus its title, so a date can move without making a new event. What the public cannot simply attend (a gala, a graduation, an annual meeting, a members-only business) and what is held only online are not events; extraction skips them.
_Avoid_: item, listing, entry

**Published dataset**:
The `/events.json` the site publishes alongside its HTML: the active, not yet past events with the fields the site shows, each with its description, plus `schemaVersion`, `generatedAt` and `lastSuccessfulRun`. It is the interface between the site and any downstream reader. The job's own `data/events.json` (evidence, leads, counters, held-back and expired records) stays in the repository and is not published.
_Avoid_: database, feed, API

**Archive**:
`data/archive/<year>.json`: the expired records a run moved out of `data/events.json` once both their last day and their last change were more than eight weeks back (#82), as they were when it did, filed by the later of the two. Nothing reads it to run: folding and matching see the live file alone, so a page that lists an archived event again starts a new record. Kept so the record is not lost, and so the live file each run loads holds only what may still matter.
_Avoid_: history, backup

**Primary page**:
The page on the event's own web presence (venue calendar, promoter page, organizer site) from which its date and venue were read. Verification and identity hang on it. It is the same page whichever way its URL is written (with or without `www.`, http or https, a trailing slash or a fragment); a query string makes another page.
_Avoid_: official page, canonical URL, source page

**Site**:
The web presence a page belongs to: its registrable domain, approximately the public suffix plus one label ("knuckleheadskc.com" for "tickets.knuckleheadskc.com"). An event's site is its primary page's. The job has no public suffix list, so a hosted platform's tenants count as one site, except that a ticketing platform the config lists is no one's site.
_Avoid_: domain (when meaning this), host (which is the full hostname)

**Own page**:
The event's own page (`eventUrl`), when the primary page links one: its details or its tickets, on the primary page's site or a ticketing platform the config lists; a link anywhere else is no own page (ADR 0009). Where the site's "Details and tickets" sends the reader. Named by the extractor as a link number, resolved by the job against the page's own anchors, and no part of verifying. Never fetched, but for a registry source flagged `readEventPages`, whose events' own pages are read for the time the list does not give (ADR 0009, amended #123), and for a pick, whose own page is read once per date and own page for the time, the price, the age limit, and a fuller description (amended #133). Two records with one own page on one date are one event (ADR 0007, amended #66). An event whose primary page links none sends the reader to the primary page instead.
_Avoid_: event page (the site's page for the event), ticket link, link-out

**Recurrence class**:
Which of three shapes an event's occurrence takes: one-off, limited run, or recurring. Derived from page evidence, not judgment.

**One-off**:
An event that happens once, including a short consecutive span such as a festival weekend or a band playing two nights.

**Limited run**:
An event that happens over a bounded span with a known end date, such as an exhibition or a theatre run. It is named by when it closes: two records with the same title at the same venue ending on one calendar date are one event, whatever their starts (ADR 0007, amended #68). A sighting matched that way keeps the stored start (#120). It is open every day of its span unless its own page names the weekdays it plays (its days, #143); then it is on, in the site's sense of "On now", only on those.

**Recurring**:
An event that repeats indefinitely on a schedule, such as a monthly market, First Fridays, or a museum's weekly tour.

**Promotion**:
A business's own standing night, or a bar's watch party, listed as if it were an event: a happy hour, a food or drink special, a themed or DJ night, trivia, karaoke, a game-day party. Never an event, whatever it offers; extraction skips it. A recurring event is bigger than one business's night. A DJ date with a named headliner, ticketed on its own, is a show, not the venue's standing night. A class or workshop is never a promotion, wherever it is held. Extraction skips it, and the job skips by title what extraction lets through (#81).

**Not public**:
What the public cannot simply attend, though a calendar lists it: a graduation, a benefit gala, an annual meeting or dinner, a class reunion, a memorial, a board meeting, professional development, anything held only online. Never an event; extraction skips it, and the job skips by title or venue what extraction lets through (#81). A record stored before that is expired `not-public`, as a stored promotion is expired `promotion`.

**Away game**:
A team's game in another city, which its own schedule lists as "<Team> at <place>", often with no venue. Outside the geography, so dropped and counted, never held unverified (#81).
_Avoid_: special, deal

**Schedule phrase**:
How a recurring event repeats, in a few words from its page ("Every Tuesday, 7pm"). A recurring event carries it instead of a start and end date. A sports team's home game is a one-off, one per game; a season as a whole is not an event (#159).

**Don't-miss flag**:
The editorial call that a one-off or limited run is worth going out of your way for. Never applied to recurring events. The curation prompt names a density, on the order of 30 to 50 flags across an eight-week horizon of about 500 events: a calibration for the threshold, never a quota for a batch.
_Avoid_: featured, top pick, interest score, rating

**Why-line**:
The one sentence stating why an event carries the don't-miss flag.
_Avoid_: blurb, description, summary

**Description**:
One or two sentences, in our own words, on what an event is, written by extraction from what its page says; absent when the page says nothing beyond the listing line. Not a judgment: that is the why-line. Never copied from the page (ADR 0001).
_Avoid_: blurb, summary, synopsis

**Kind**:
The category of an event, from a fixed taxonomy.
_Avoid_: type, category, genre

**Status**:
Whether an event is publishable: `active` (verified and current), `unverified` (not yet, or no longer, meeting cite-or-drop), or `expired`. An expired event carries a reason: `past`, `two-strike`, `cancelled`, `index-page` (its primary page was an index page), or `duplicate` (another record turned out to be the same event and was seen first, or is the recurring event this one is one month of), `promotion` or `not-public` (stored before the skip in code matched it, #81), or `stale` (no reading ever verified it, and no lane has sighted it in four runs that could have, #82: re-verification never reads such a record, so nothing else would end it). A duplicate names the record it was folded into (`duplicateOf`) and stands for it: a sighting that matches the duplicate is a sighting of that record. A postponement with a new date is a date change, not an expiry.

**Last-verified**:
The date of the most recent run that read the event's date and venue from its primary page. Shown on every published event.

**Last-changed**:
The run that first saw an event or last changed its title, date, venue, or status. A name that changes only in case or punctuation, or a date read with a time where it had none (or none where it had one), is no change. Curation re-judges an event only when it has changed since it was last judged.

**Last-judged**:
The run that last judged an event for the don't-miss flag. Absent until curation has seen the event; a run the spend cap cuts short leaves it absent, so the event comes up again.

**Lead**:
How an event was first found: which registry source or which discovery search.

**Venue**:
The place an event happens. A venue is not the same as a source, even when the venue's website is a source. One venue can go by several names: the building, a room inside it ("Helzberg Hall" at the Kauffman Center), or a program that runs there ("Tivoli Cinema" at the Nelson-Atkins). These are its **venue aliases**, kept by hand; event identity treats them as one venue, and the site shows the event at the venue's display name with the page's room after it ("Kauffman Center for the Performing Arts · Helzberg Hall"). An alias made only of generic words ("Pavilion", "Main Auditorium") names that room alone, never a longer name that contains it.
_Avoid_: location, room (when meaning the venue as a whole)

**Neighborhood**:
The part of the metro a venue is in, from a controlled list, shown on the site in place of a street address: the most specific place name people use, a district in the core ("Crossroads") or a city in the suburbs ("Olathe"). The list is the config's, grouped by region, plus the catch-all "elsewhere in the metro", which is in no region. A region may list its own name ("Northland") beside its cities, for an address in none of them; an address that maps to nothing lands there, keeping the place the extractor proposed instead, and is flagged as unmappable in the run report: every record that ends the run there is counted, and listed only when it is new there or its proposal changed since the run began. A stored neighborhood the list no longer holds (a region name from before regions, a renamed neighborhood) is placed again in any run in which no page re-reads the event: the list's spelling, the event's registry source's neighborhood for the name of the region that lists it, or else the catch-all; the run report names each such value. A registry source's neighborhood must be on the list. A venue the config maps to a neighborhood (`venueNeighborhoods`, keyed on its display name) overrides the page: every event at it not expired is placed there each run, read or not, and the run report names each venue that moved one.

### Research

**Run**:
One execution of the research job: check sources, discover, extract, verify, curate, publish.

**Run report**:
The committed record of one run: counts, spend against the cap, per-source results, sources failing repeatedly, unmappable neighborhoods, and promotion suggestions. Since #135 its JSON twin also records the run's changes against the run its dataset came from: new picks, moves, and events gone, which the changes page shows.

**Promotion**:
Moving a source that the discovery lane has found events on in two runs into the registry. The run tracks discovery sources by host (a ticketing platform is no one source and is never suggested). Always a suggestion in the run report, acted on by hand; never automatic. Promoting a host releases the events held for promotion from it on the next run (ADR 0012); each suggestion says how many it would release.

**Source**:
A venue, institution, or organizer whose page or feed the research job checks. A source produces leads; it is not an event.
_Avoid_: site, feed (when meaning the thing we check)

**Registry**:
The committed list of sources checked on every run. Hand-editable.
_Avoid_: whitelist, seed list

**Registry lane**:
The part of a run that checks every registry source directly.

**Candidate**:
One event as the extraction model reports it from a single page, before cite-or-drop decides whether it becomes an active or unverified event. A candidate is not yet in the dataset; one with a field past its length cap (a runaway title or evidence quote) never gets there, and is counted in the run report.
_Avoid_: result, hit, extraction

**Sighting**:
A candidate after cite-or-drop has made it an active or unverified event, together with whether its page says it is cancelled. A run matches each sighting against the dataset by event identity; what it may then do to the event depends on whether its page speaks for it.
_Avoid_: match, hit

**Speaks for**:
A page speaks for a known event when it is the registry lane's (a source a person admitted) or on the event's own site (ADR 0008, amended #75). Only such a page's sighting can cancel the event, refresh its reading, or clear its strikes; only the event's own primary page can hide it on an uncitable re-reading. A sighting from any other page says nothing about the event (amended #78): it is left as it was and re-verified against its own page, which decides. A cancellation from any other page is also a line in the run report. When one page lists a show on two nights within the fuzzy window, the night nearest the stored start is the event's reading, whichever the page gives first.
_Avoid_: trusted, authoritative, confirms (a page with no standing confirms nothing)

**Strike**:
One run in which an active event's primary page loaded and no longer listed it, or told the job it is gone (not found) or may not be read (its `robots.txt` now disallows it). A reading that says nothing about the event is not a strike (ADR 0008, amended #39 and #78): a page that loaded without an event starting after the weeks the run researches (`horizonWeeks` in the config, not the site's horizon buckets), less two days of slack at the end, since extraction is asked only for events within those weeks; or without an event starting after the latest start the page listed this run, since the page's window stops short of it. A page read as listing nothing where three or more active events would be struck is an outage, not a strike each. Any run in which a page that speaks for the event lists it clears its strikes; the second consecutive strike is two-strike expiry.

**Outage**:
One run in which an event's primary page could not be loaded: the connection failed, the site refused the job, it errored, or the job's fetch policy refused the page (a host on a private network, a body over budget, a content type it cannot read). Three readings count as one too (amended #78, #111): a page that loaded but read as listing nothing where three or more active events cite it; an excluded source's page, which is not fetched at all; and a page whose redirects ended on an index page, which is never read as a primary page. An outage says nothing about the event, so it is not a strike. An event is held as it was through a few consecutive outages, then becomes `unverified` until its page loads and lists it again.
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
The exact text, quoted verbatim from the primary page, that a date or venue was read from. The page is quoted as the job reads it: its visible text, then the schema.org event data in its code, one line per event with times in local time (#98). Stored beside the value so it can be audited without re-fetching. The run checks that it is there: see cite-or-drop.
_Avoid_: citation, quote, proof

**Discovery lane**:
The part of a run that uses web search to find events outside the registry. It finds; it does not admit: a new event from a host that is neither a registry source nor a ticketing platform is **held for promotion** until a person promotes the host (ADR 0012), and a host the registry excludes is never followed. A page it finds speaks for a known event only when it is on the event's own site; otherwise it can confirm the event and nothing more.

**Held for promotion**:
The state of an event the discovery lane found on a host nobody has looked at (no active registry source is on it, and it is no ticketing platform): stored unverified with its reading, marked (`heldForPromotion`), never rendered on the site, and not re-verified (its page is neither fetched for it nor sent to the model while it is held) until the host is promoted into the registry, which releases it to re-verification against its own page. The first run under the rule held every discovery-led event already on such a host, verified or not. Discovery finding the page again keeps the reading current and the hold in place; the event expires `past`, or `stale` if no reading of it was ever verified, like any other. Only a discovery-led event is ever held: a registry-led event whose page has moved to another host, or whose source was since excluded, was admitted by a person. Released by promotion, not by time; the run report counts what it held and released, by host.
_Avoid_: quarantined, pending, draft

**Aggregator**:
A third-party events listing site. Read only as an index of leads, never as a source of published text or facts.

**Index page**:
A page read only for its links to events, never as a primary page: every page on an aggregator, and a ticketing platform's listing pages (search, browse, and category listings), whose individual event pages are primary pages. An event whose primary page turns out to be an index page is expired, not struck.
_Avoid_: listing page, directory page (when meaning this)

**Cite-or-drop**:
The rule that an event publishes only if its date and venue were read from its fetched primary page. Anything less is held as `unverified` and never rendered. A date or time that does not exist (February 30th, 24:00), or an end before the start, is a misreading, not a read date: the candidate is held uncitable and counted. Both evidence snippets must occur in the page's text as the model was given it, with the job's own link numbers (`[12]`) stripped and runs of whitespace, case, curly quotes, dashes and an ellipsis not counting as differences; a candidate whose quote is not on the page is held `unverified` and counted, and a re-reading like that from the event's own primary page makes an active event unverified, unless the event's stored quotes are still on that page and the reading agrees with the stored one (date, time when both give one, or schedule, and venue): then the event stays active on its stored citation and is listed as kept (ADR 0008, amended #124).

**Two-strike expiry**:
The rule that an active event which takes a strike on two consecutive runs becomes `expired` on the site while staying in the dataset, until it is archived. Outages do not count toward it.

**Spend cap**:
The per-run cost ceiling, enforced by the loop from the cost returned on every model call and backstopped by a monthly limit on the API key itself. When hit, the run publishes what it verified and logs the shortfall.

**Excluded source**:
A source the job knows about but does not fetch, with the reason recorded: its `robots.txt` disallows it, its pages cannot be read (listings that even a browser fetch does not show, or a site that refuses the job's fetcher), or its information is not worth checking. Its pages are not fetched for re-verification either (#78): the events it led to, and any event whose primary page is one of its pages, are held as through an outage until it is active again, and the run report names it. Discovery never follows a lead on its host, whether a search result or a link off an index page (ADR 0012); the run report counts those leads by source. A discovery-led event on its host is held for promotion, not as through an outage: a person said no to the host.

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

**Shortlist**:
A handful of events named in an explorer link (`/explore?ids=evt_a,evt_b`), shown in the order the link gives them, under "Shortlist · N events". The saved view's Share saved builds one from the visitor's saves still to come; ids of events no longer to come drop silently.
_Avoid_: list, collection, playlist

**Event page**:
The page for one active event, at `/e/<id>`: its date, venue, why-line when flagged, description when there is one, primary link, calendar file, last-verified stamp, and corrections link.
_Avoid_: detail page, listing page

**Venue page**:
The page for one venue, at `/v/<slug>` (#137): its address, a map link and its own site when the venue table has them, then its events in the explorer's rows grouped by day, each with the room it is in. Every venue a published event is at has one, and so does every venue table row, with "Nothing listed at the moment" when nothing is coming up. The slug comes from the venue's display name, so two spellings of one name are one page. Every venue page is listed at `/venues`, the **venue directory**, by region with its count of events, those with nothing coming up last; each venue page links it.
_Avoid_: location page, place page

**Venue table**:
`data/venues.yaml`, hand-kept: one row per venue, keyed on its display name, with its street address and, when looked up, its position and its own site; a district with no one address has its position alone (ADR 0013). Read only by the site's build, which fails on a row keyed on an alias or on no venue it knows.
_Avoid_: venue list, venue database

**Changes page**:
The page at `/changes` listing what the last run changed against the run before it: new picks (active and flagged, not flagged before), moved events (active before and now, the start on another day or time, from a start not yet passed), events gone (active before, expired as cancelled or two-strike), and events new this week (first seen in the seven days through the run).
_Avoid_: changelog, what's new, digest
