# A past event's URL shows an ended page, then redirects to its venue

An event page (`/e/<id>`) was built for each published event, and only those. The daily deploy rebuilds the site every night, so the URL turned into a plain 404 the first night after the event's last day. Search Console on 2026-11-22 showed what that costs (#303): of the 154 pages that had earned impressions in three months, 56 no longer existed, and they had taken 40% of the impressions. 45 of those were event pages. Google also crawls the new site slowly, so many event URLs expire before they are crawled at all.

So a past event's URL now outlives the event in two stages.

**An ended page for 28 days** (`ENDED_PAGE_DAYS` in `site/src/build/load-dataset.ts`). An event that was once published (active, or expired as `past` having been verified at least once, the rule ADR 0016 uses for venues), is not outside the geography, and whose last day is 1 to 28 days before the build's day keeps its event page, marked ended. The page says "This event has ended" in its HTML, so a crawler reads it with no script. It carries `noindex`: a searcher who lands on a finished event has been poorly served. Its links are still followed, and it keeps its Event JSON-LD with its real dates, which Google reads as past; it is not marked cancelled. The ticket button, the calendar file, Save, Share and the report form go, since none of them means anything for a finished event. In their place come "More at <venue>" (the kind's page when the venue has none) and the venue's and kind's events still to come. Ended events are their own collection from the loader (`ended`, written to `src/generated/ended.ts`), which only the event page imports. No list, feed or payload can pick one up by importing the published events. Expired records stay in `data/events.json` for eight weeks, so the window costs no new data. The 11-23 data gives 354 ended pages, about 10 MB of the build's output.

**Then a redirect to the venue page, until a year after the last day** (`REDIRECT_DAYS`). Past the 28 days, the URL is a static page in the form Astro writes for a static redirect: an immediate `<meta http-equiv="refresh">` to `/v/<slug>`, the venue page as its canonical URL, `noindex`, and a plain link. The page is written by `Astro.redirect` in the event page's route. It is emitted only when the venue has a page in the same build. ADR 0016 keeps a venue page up for 365 days after its last published event, so a past event's venue nearly always has one. When it does not (a street address, generic words, a venue now outside the geography), the URL 404s. The records come from `data/events.json` and every `data/archive/<year>.json`, read once by `readArchive`. After the year, the URL 404s. That bounds the redirects to about a year of past events, some 5,700 small files at the current rate. The 11-23 data gives 494 redirects, 0.2 MB in all.

**The last day is the site's.** It is the end's day, else the start's, except for an overnight event: one that ends after midnight counts from its first night, as the site's `isPast` reckons it. Otherwise the page would 404 for a day between leaving the live pages and becoming ended. The venue page counts from the end's day, so it always outlasts the redirect to it.

**Duplicates follow the record they were folded into.** A record expired as `duplicate` with a `duplicateOf`, verified at least once, is followed through its chain (`throughDuplicates` in `src/identity.ts`, the job's own) to the record that stands. Its URL redirects to that record's event page, live or ended, or else wherever that record redirects. Some duplicates get nothing:
- one never verified, whose URL was never published;
- one whose chain loops or leaves the records;
- one from before the job kept the pointer.

**Every other expiry reason keeps its 404:** cancelled, two-strike, index page, promotion, not public, stale, outside the geography. So does a record never verified, which was never on the site.

**Why not the alternatives.**
- **Redirects in `vercel.json`.** It holds at most 2,048 routes, a few months of past events.
- **Vercel's bulk redirects.** They need the Pro plan.
- **A function at `/e/[id]`** looking ids up in a committed map. That is a second function beside `/api/report`, called on every miss and kept in step with the build, for what a static file does.
- **An ended window and then 410 Gone, with no redirect.** It would throw away the venue page as the place a URL's earned links point to, and the venue pages are now built to last a year for exactly that.

A meta refresh is served with a 200, not a 301. Google treats an immediate meta refresh as a permanent redirect, and the canonical link says the same.

**Daily, not weekly.** Both windows are counted from the build's day, so the nightly deploy moves an event from live to ended to redirected to gone without waiting for a run. A page built before the event's day still shows the island's notice once the visitor's day is past it, and says the same words.
