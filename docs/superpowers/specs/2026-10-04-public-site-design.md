# The public site

Design for milestone two's first half: the public website over the published dataset. Agreed in conversation on 2026-10-04 after milestone one passed (`docs/milestone-one-grading.md`), then reviewed and revised the same day; this document is the design of record. The hub push is the second half and is not covered here.

## 1. Intent

A site for Kansas City that Evan would post to /r/kansascity and be proud of: a stranger lands on it and thinks "this is actually good." That is a higher bar than the proposal's "clean picture he can open when planning," and it changes the shape from a flat weekly list to a site that is both an editorial front page and a genuinely functional explorer over every active event.

What a visitor can do that no local aggregator lets them do:

- See a curated, reasoned list of what is worth going out of the way for, with one sharp sentence each, before seeing anything else.
- Slice the full set of ~600 active events fast: by date, kind, region, don't-miss, recurrence, and free-text search, with every slice shareable as a URL.
- Save events in the browser and export any view to a calendar file.
- Trust every date: each event shows when it was last verified against its own page, and the site says when it was last researched.

What the proposal fixed and this design keeps: no ads, no accounts, no tracking; cite-or-drop (only `active` events exist to the site); link out to the primary page, never republish descriptions or images; visible last-verified and staleness; standalone from personal infrastructure (ADR 0004); the published `events.json` as the contract (ADR 0006); the don't-miss/always-there spine (ADR 0005).

What the proposal left open and this design settles: stack (Astro + Svelte), hosting (Vercel), front page shape (editorial first, explorer behind), a page per event, the horizon buckets, and the visual approach (typographic, no imagery).

Success: a /r/kansascity reader comes back; and the proposal's lived test, Evan proposes one thing to friends that he found here and would not have found otherwise.

Vocabulary is `CONTEXT.md`'s: *don't-miss list*, *always there*, *horizon*, *methods page*, *staleness banner*, *region*. Two glossary entries change with this design and are amended as part of delivery (section 13): the staleness banner's trigger (section 8) and the horizon's buckets (section 5).

## 2. Non-goals for v1

- **No backend, no user-generated input.** No comments, "going," suggestions, inline corrections. Corrections are a GitHub issue link. User state is browser-local only.
- **No map.** Wanted, but it needs a venue coordinate table the dataset does not have. Second release, once the venue list has stabilized.
- **No price or ticket fields.** The dataset does not carry them; adding them is a research-job change (extraction and cite-or-drop) and is deferred.
- **No event images.** Legal exposure and the thing that makes aggregators look like aggregators. The visual identity comes from type and color. The one image the site has is a single site-wide typographic share card (section 7), generated once, so links unfurl without looking broken.
- **No venue pages, no kind landing pages.** Candidates for v1.1; the explorer's URL state covers both cases for now.
- **No daily rebuild.** The site is rebuilt when the weekly run commits; client-side logic keeps the day-dependent parts correct between builds (sections 4, 7, 8). A deploy hook on a daily cron is a cheap follow-up if the no-JS HTML going a week stale ever matters.
- **Naming.** The site name is a single config value. It shipped as "KC Events" at a Vercel subdomain; on 2026-10-07 it became "KC This Week" at kcthisweek.com (#61).

## 3. Architecture

```
data/events.json  (committed by the weekly run)
       │
       ▼  build time, inside site/
  loadDataset(): parse with the research job's own schema (import from ../src/dataset.ts)
                 → active events only, and only those not already past at build time
                 → project each to a PublishedEvent (section 4): adds region, drops job internals
       │
       ├──► Astro static pages
       │      /            front page: the don't-miss list by horizon, always there, link to explore
       │      /explore     the explorer: filter rail + results, one Svelte island
       │      /e/<id>      one page per active event, plus /e/<id>.ics
       │      /about       the methods page: how the site is made, corrections link, dataset and llms.txt pointers
       │      /events.json the published dataset, verbatim
       │      /llms.txt    a plain-text description and pointers for chatbots
       │      /sitemap.xml, /robots.txt, /404
       │
       └──► Svelte components, server-rendered at build and hydrated in the browser
              DontMissList (front page)  Explorer (/explore)  EventPageIsland (/e/<id>)  StalenessBanner (all)
              All share site/src/lib/*: pure functions, no DOM, no clock, unit-tested with vitest.
```

**Stack.** Astro (current stable) with the Svelte 5 integration, TypeScript, vitest, pnpm. Hosted on Vercel from the Git integration, static output, no Vercel adapter. Chosen because the site is mostly static HTML with one interactive region, which is exactly Astro's model; because it shares the research job's toolchain; and because Vercel is where Evan already runs things and gives a preview URL per branch, which matters for design work.

**Location.** `site/` is a package inside this repo. The repo root becomes a pnpm workspace: `pnpm-workspace.yaml` lists `packages: [site]` and sets `includeWorkspaceRoot: true`, so `pnpm -r test` and `pnpm -r typecheck` run both the root and the site (listing `.` as a package does not include the root in recursive commands; verified with pnpm 10.33). The root gains a `vitest.config.ts` that excludes `site/**`, so the root's vitest does not pick up the site's tests under a config with no Svelte plugin. The root `package.json` keeps its scripts; `site/package.json` adds `dev`, `build`, `preview`, `test`, `test:e2e`, `typecheck`, and pins `engines.node` to 22 (Vercel reads that, not `.nvmrc`).

**Imports from the job.** The site imports `src/dataset.ts`, `src/config.ts`, `src/taxonomy.ts`, and `src/time.ts` from the root package by relative path (`../../src/dataset.ts`); nothing in `src/` imports from `site/`. This works because Astro's base tsconfig uses `moduleResolution: "Bundler"` with `allowImportingTsExtensions`, under which the root's `./x.js` specifiers resolve to `.ts` files, and the four modules pull in only `zod`. Rules that keep it working: `zod` and `yaml` are not added to `site/package.json` (they resolve from the root's `node_modules` by file location; a second copy would be bundled twice); only `site/src/build/` imports from `../../src`; nothing under `site/src/lib/` or `site/src/components/` does (zod would land in the island bundle), pinned by a test that greps for it. The site pins TypeScript 6 in its own devDependencies and `astro check` runs under it: TypeScript 7, which the root keeps for its own `tsc`, ships no JavaScript API, and `@astrojs/check` and `@astrojs/svelte` peer `typescript ^5 || ^6`.

**One schema, two consumers.** The site parses `data/events.json` with `parseDataset` and `research.config.yaml` with `parseConfig`, both imported from the job. A shape change in the job fails the site build immediately rather than rendering wrong. The site also hardcodes `SITE_EXPECTS_SCHEMA_VERSION = 1` and asserts it equals the job's `DATASET_SCHEMA_VERSION`, so a deliberate bump in the job is a deliberate site change (importing the job's constant alone would be a tautology, since the job's schema already pins it).

**Build fails loudly, deploy keeps the last good site.** Any parse failure, a schema version mismatch, a dataset with `lastSuccessfulRun: null`, an id collision among active events, or a projected payload over 400 KB raw throws during `astro build`. Vercel then keeps the previous deployment live. The weekly workflow already commits nothing on a failed run, so the two failure modes compose: a bad run leaves the old data, a bad build leaves the old site.

**Production.** The site is live at https://kcthisweek.com (Vercel project `kc-events`, first deployed 2026-10-05 from 05345fa at https://kc-events-lime.vercel.app, which still serves; the custom domain was attached 2026-10-07). Vercel Authentication is off so the production URL is public, and the monorepo "skip when no changes" switch is off so the ignored build step below is the only skip rule.

**Deploy trigger.** Vercel project settings: root directory `site`, framework Astro, "Include source files outside of the Root Directory" on, and the automatic "skip deployment when unaffected" switch for monorepos **off**: Vercel's own change detection follows declared workspace dependencies, and the site reaches the dataset by relative path, so the one commit that matters (the weekly `data/events.json` change) could be classified as unrelated and skipped, which would silently freeze the site. Instead an explicit *ignored build step* command, versioned as `ignoreCommand` in `site/vercel.json` so the dashboard needs no custom command (it uses the previous deployed SHA when Vercel provides one and falls back to `HEAD^`), runs inside `site/` and skips the build on exit 0, builds on exit 1:

```
[ -n "$VERCEL_GIT_PREVIOUS_SHA" ] && git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- . ../data/events.json ../src ../research.config.yaml ../pnpm-lock.yaml ../pnpm-workspace.yaml
```

so a run-report-only or docs-only commit does not rebuild. Ticket 1's acceptance includes pushing a data-only commit to a branch and confirming a preview deploy happens, and pushing a docs-only commit and confirming one does not. `site/vercel.json` (read from the root directory) sets `cleanUrls` and the headers in section 10. No new GitHub workflow is needed for deploys.

A small `site-ci.yml` workflow runs `pnpm -r typecheck`, `pnpm --filter kc-events-site build`, a separate `pnpm --filter kc-events-site size` step, `pnpm -r test` (after the build, because the built-output tests read `dist/`), and the end-to-end suite (built into its own `dist-e2e/`) on pull requests and on pushes to `main`. Note what it guards: GitHub does not trigger workflows from pushes made with the default `GITHUB_TOKEN`, so the weekly research commit runs no CI; on that commit the build assertions run only inside Vercel's build, which is sufficient because that build is the one that would publish bad data.

**Configuration.** `site/src/site.config.ts` holds the site-level values: `name` ("KC This Week"), `tagline`, `repoUrl` (for the corrections link), `staleAfterDays` (9), and nothing about slugs; islands import it, so it reads no environment. The canonical origin for sitemap, JSON-LD, and share tags is build-only, in `site/src/build/origin.ts`: `SITE_ORIGIN` once a fixed production domain exists, falling back to `https://${VERCEL_PROJECT_PRODUCTION_URL}` so previews are not canonical. Slugs: kind and region slugs are derived by one `slugify` function from the config's names, with a test pinning them distinct (section 6). The time zone is `timezone` from `research.config.yaml`, not duplicated. Two environment overrides exist for reproducible builds: `SITE_TODAY=YYYY-MM-DD` fixes the build's date and `SITE_DATASET=<path>` points the build at a fixture dataset; both are used by the end-to-end suite and otherwise unset.

## 4. Data contract

### What reaches the browser

The job's `Event` carries fields the site must not show or does not need (`evidence`, `lead`, `verificationFailures`, `consecutiveOutages`, `lastChanged`, `lastJudged`, `expiryReason`). The build projects each active event to a `PublishedEvent`:

```ts
type PublishedEvent = {
  id: string;
  title: string;
  start?: string;        // local ISO date or date-time with offset, as in the dataset
  end?: string;          // a limited run may have an end and no start (already underway when first read)
  schedule?: string;     // recurring only
  venue: string;         // always present on an active event
  neighborhood: string;
  region: string;        // see "Region" below
  primaryUrl: string;
  kind: string;
  recurrence: "one-off" | "limited-run" | "recurring";
  dontMiss: boolean;
  whyLine?: string;
  lastVerified: string;  // always present on an active event
};
```

The explorer receives every `PublishedEvent` (today ~560 non-past active events, 208 KB raw, 29 KB gzip, measured 2026-10-04). A build step writes them to generated modules (gitignored), which the components import directly, so the same data serves the server render and the hydrated one with nothing serialized into island props. There are three, so each island ships only what it renders and the section 9 budgets hold: `site/src/generated/meta.ts` (kinds, regions, run stamp, build date, time zone; under 1 KB), `site/src/generated/events.ts` (every `PublishedEvent`, imported by the explorer), and `site/src/generated/dont-miss.ts` (the flagged events, imported by the front page's list); the staleness banner and the event page's island import `meta` alone. With the whole event list in every island, the front page measured 55 KB against its 50 KB budget. Props are avoided because Astro serializes props into an HTML attribute with entity escaping, which inflates JSON badly, and the components' only props are small (the build date). The build fails if the raw payload exceeds 400 KB, so a dataset growing past the design is noticed.

The build-only code (parsing, projection, the generator) lives under `site/src/build/` and is the only place in the site that imports from the job's `src/`; `site/src/lib/` and `site/src/components/` are client-safe and never do.

`/events.json` is the dataset verbatim, unprojected, copied as a file and never re-serialized (the generator copies it to `site/public/events.json`, gitignored, which Astro copies into the output): it is the contract downstream readers and the hub push depend on, and the site is not the place to narrow it. It republishes the evidence snippets (short verbatim page text per event) that the repo already publishes; no new exposure.

### Which events exist to the site

- `status === "active"` only. Unverified and expired events are not rendered anywhere, have no `/e/<id>` page, and are not in the explorer's data. They remain in `/events.json` because that file is verbatim.
- **Past events are dropped at build.** A one-off or limited run whose `end` (or `start` when there is no `end`) is before the build's date is omitted. This is the job's own `past` rule; the site does not wait for the next run to apply it.
- Recurring events have no dates and are always current; they are never dropped for being past.

### Region

`region = regionOf(neighborhood, config) ?? (neighborhood is itself a region name ? that region : "Elsewhere in the metro")`. The middle case exists because the committed dataset holds 31 active events whose neighborhood is "Johnson County," written before #23 grouped neighborhoods under regions; they belong to that region. Anything else unlisted goes to the catch-all, and the build prints a count of events it mapped this way so drift is visible. The catch-all is 113 of 618 active events today, so "Elsewhere in the metro" is a real region chip, not an edge case. A job-side issue (section 13) covers remapping stored off-list neighborhoods, which the job only maps at extraction time.

### Derived values

All derivation is in `site/src/lib/`, pure functions over `PublishedEvent` and a `today: YYYY-MM-DD`, with no DOM, no I/O, and no clock: every function takes `today` as a parameter, and a test greps `site/src/lib` for `new Date()` (empty parentheses) and `Date.now(` to keep it so; `new Date(ms)` and `new Date(iso)` are pure and allowed. The Astro pages and the Svelte components call these; neither does its own date arithmetic.

- `localDate(iso)`: the `YYYY-MM-DD` of a dataset date. The job writes local wall time with its offset (`src/time.ts`, `fromLocal`), so this is `iso.slice(0, 10)` for both forms; the function exists so the rule lives in one place.
- `isPast(event, today)`, as above.
- `isMultiDay(event)`: `localDate(end) > localDate(start)` (52 one-offs today; none has a same-day end).
- `isUnderway(event, today)`: a limited run or multi-day one-off whose span includes today; a limited run with no `start` is underway by definition (the job's `citedDate` rule).
- `horizon(event, today)`: section 5; total over every non-past dated event.
- `matches(event, filters, today)`, `groupResults(events, filters, today)`: section 6.
- `toIcs(events)`: section 7.
- `parseQuery(params) / toQuery(filters)`: section 6.
- Calendar arithmetic (today plus fourteen, the coming Sunday) is done on `YYYY-MM-DD` strings through `Date.UTC`, never on local `Date` objects, so DST changes (there is one on 2026-11-01) cannot shift a day.

### Time

All date math is in `America/Chicago`, at build and in the browser, regardless of the visitor's zone: the site is about Kansas City and "this weekend" means Kansas City's weekend. `today` has one source per context: at build, `toLocalDate(new Date(), config.timezone)` from `src/time.ts`, or `SITE_TODAY` when set; in the browser, the same conversion of the visitor's clock, done once in each island's `onMount` and passed down. Server-rendered HTML therefore carries the build's date; hydrated components switch to the visitor's. Day-of-week math uses `Intl.DateTimeFormat` with the zone; no date library is added.

**Hydration rule.** Every island hydrates with exactly the state it was server-rendered with (build date, default filters) and only then, in `onMount`, sets the visitor's date and the URL's filters. Hydrating with different state would trip Svelte's hydration mismatch path and render the list twice.

## 5. The front page

The editorial surface. It reads top to bottom, with no interaction required and nothing hidden behind controls.

**Header.** Site name, one-line tagline, and the research stamp: "Researched weekly; last run Mon Oct 5" (from `lastSuccessfulRun`). Nav: Explore, About. The staleness banner (section 8) sits below the header when it applies.

**The don't-miss list.** The don't-miss one-offs and limited runs, grouped by horizon and sorted by date within each group. `horizon` is total: every non-past dated event lands in exactly one bucket for any `today`.

- **Through Sunday.** Today through the coming Sunday (the current day when today is Sunday). The heading reads "This weekend" when today is Thursday to Sunday and "This week" when Monday to Wednesday, always with the dates ("This week, Oct 5–11"). The proposal's "this weekend" alone left Monday-to-Wednesday events in no bucket; a quarter of dated events start on those days.
- **Next two weeks.** After that Sunday, through fourteen days from today. Heading "Next two weeks, through Oct 19."
- **Further out.** Everything later. The dataset's horizon is eight weeks, so this group is bounded.

A one-off is bucketed by its start. A limited run is bucketed by its **closing date**, and its card says "closes Sun Oct 11" rather than a start, because the regret is in missing the close; a run that closes further out but is already on says "on now, closes Nov 14." An event already underway whose close is this Sunday or sooner is in the first bucket.

Each card: title (links to `/e/<id>`), date or closing line, venue and neighborhood, kind, the why-line in full, a direct link to the primary page showing its host ("therecordbar.com"), a save button, and a small last-verified stamp. The primary link is on the card, as the proposal asked, so the outbound click is one hop and the honesty signal is visible everywhere an event is. The why-line is the point of the card and is set as the largest secondary text. No images, no description, no "read more."

An empty bucket is shown with its heading and one line ("Nothing flagged yet for this week"), never hidden: an honest gap beats a page that silently reshapes itself. If there are no don't-miss events at all, the page says so and points at the explorer.

**Always there.** The recurring events, in a compact list below: title, schedule phrase, venue, neighborhood, primary link. Sorted by kind then title. Heading "Always there," with one line explaining that these repeat and are never on the don't-miss list.

**Explore link.** A prominent link to `/explore` with the count: "Browse all 560 events." The front page does not host filters; the explorer does.

`DontMissList` is a Svelte component server-rendered at build with the build date and hydrated with the visitor's date under the hydration rule, so headings and buckets are correct on the day viewed and events that passed since the build drop out. It reads the visitor's clock (in the site's zone) on mount and again whenever the tab becomes visible, never on a timer. With the clock, a card whose pick starts today reads "Today" on a tile ringed in its kind's colour, and a timed one-off whose start has passed reads "Started 7:00 pm" and dims (muted title, the grey "other" kind's shades on its tile and chip, still AA), staying on the page since the site knows no end times. Built HTML has no clock, so it shows neither state. Its JavaScript is small; the page is fully readable without it.

## 6. The explorer

`/explore`. One Svelte island, `Explorer`, hydrated with every `PublishedEvent` from the embedded JSON block. Everything is client-side; the page is fast because there is no server to wait for and the data is already on the page.

### Filters

| Filter | Control | Values | Default |
|---|---|---|---|
| When | segmented control plus a custom range | `today`, `weekend`, `7d`, `30d`, `all`, or `YYYY-MM-DD..YYYY-MM-DD` | `all` |
| Kind | chips, multi-select | the 11 kinds from config | none selected (all) |
| Region | chips, multi-select | the 7 regions plus "Elsewhere in the metro" | none selected (all) |
| Don't-miss only | toggle | on/off | off |
| Include always-there | toggle | on/off | off |
| Saved only | toggle | on/off | off |
| Search | text input | free text | empty |
| Sort | select | `date` (default), `venue` | `date` |

Semantics:

- **When.** `weekend` is section 5's first bucket (today through the coming Sunday). `7d` and `30d` are today through today plus N. A dated event matches a range if its span (start through end, or the single day) intersects the range. Recurring events ignore the date filter and appear only when "include always-there" is on.
- **Kind and region** are OR within a filter and AND across filters.
- **Search** matches case-insensitively against title, venue, neighborhood, and why-line; terms are split on whitespace and all must match somewhere. No stemming, no fuzzy matching; the set is small enough that plain substring is right.
- **Saved only** reads the saves store (section 7).
- Neighborhood is shown on every row but is not a filter: 32 values is too many to toggle, and region covers the trip-scale decision. Searching a neighborhood name works.

### Results

Grouped and ordered, with sticky group headings:

1. **On now**: events that are underway today (limited runs and multi-day one-offs, section 4), sorted by closing date, each row saying "closes Sun Oct 11." Present only if non-empty.
2. **One group per day**, ascending, heading "Fri Oct 9," rows sorted by start time then title; date-only starts sort first and show "all day." A limited run or multi-day one-off that has not started appears once, under its opening day, with "opens; runs through Nov 14."
3. **Always there**, only when the toggle is on: recurring events sorted by kind then title.

With `sort=venue`, groups are replaced by one list sorted by venue then date; this is for "what is on at the Folly this month."

Each row: title (links to `/e/<id>`), time (or "all day"), venue, neighborhood, a kind chip, a don't-miss mark with the why-line when flagged, the primary link as a small host label, a save button. Rows are dense: rows may take two lines between 1024 and 1279 px, and an unflagged row is no taller than 28 px from 1280 px up, so roughly 30 rows fit a laptop screen, the "calm density" the proposal asked for.

The result count is always visible ("48 events") and announced to assistive technology through a live region after each change; a one-click "clear filters" appears whenever any filter is non-default. An empty result says which filters are active and offers to clear them.

### URL state

Every filter is reflected in the query string, and the query string is the only source of truth for filter state. Multi-valued filters use repeated keys and slugs derived from the names (`slugify`: lowercase, runs of non-alphanumerics to one dash), because one region name contains a comma ("Kansas City, Kansas") and kinds contain slashes: `?when=weekend&kind=music&kind=film&region=central-kc&dontmiss=1&recurring=1&saved=1&q=jazz&sort=venue`. Defaults are omitted. `parseQuery` and `toQuery` are pure, round-trip, and ignore unknown keys, unknown slugs, and malformed ranges. Changing a filter uses `history.replaceState` (typing in search does not create history entries); the browser back button leaves the page rather than stepping through filter states. A filtered view is therefore a shareable link, which is the point.

### Progressive rendering

The island server-renders at build with default filters and the build date, so a no-JS reader (or a chatbot) sees the full list grouped by day. On hydration, under section 4's rule, it switches to the visitor's date and the URL's filters.

## 7. Event pages, saves, and calendar export

### `/e/<id>`

One static page per active event. Contents, in order: kind and don't-miss mark; title as the `h1`; the date line in full ("Friday, October 9, 7:00 pm" / "Through Sunday, November 14" / the schedule phrase); venue and neighborhood with region; the why-line when flagged, set as a pull quote; a prominent link to the primary page ("Details and tickets at therecordbar.com"); save button; "Add to calendar" (`/e/<id>.ics`); the last-verified stamp ("Date and venue verified Oct 3 from the page linked above"); and a "Wrong? Report it" link to a prefilled GitHub issue (title and URL in the body). Below: "More like this": up to five upcoming events of the same kind, by date, chosen at build.

A small island, `EventPageIsland`, owns the save button and, under the hydration rule, shows a "This has already happened" notice when the visitor's date is past the event's end, since the page itself stays published until the next build. The notice is the only day-dependent element; the date line and "More like this" are build-time.

The page carries `schema.org/Event` JSON-LD (name, startDate, endDate, location name and address locality, url pointing at the primary page), omitted for a recurring event and for a run read after it began, which have no start date to state, and Open Graph tags with the site name and the date line. All pages share one site-wide share image: a typographic PNG with the site name and tagline, generated once from the design tokens and committed under `site/public/`, so a link pasted into a reddit comment or a text unfurls with a card and no event imagery is ever involved.

URLs are extensionless and without trailing slashes (`trailingSlash: "never"`, `build.format: "file"`, `cleanUrls` in `vercel.json`), so `/e/<id>` and `/e/<id>.ics` are stable and match the sitemap, JSON-LD, and share tags. When an event leaves the active set its page is simply gone; the next build does not emit it and Vercel serves `404.html` from the static output, which links to the explorer. No tombstones in v1.

### Saves

`site/src/lib/saves.ts` wraps `localStorage` under the key `kc-events.saved.v1`: a JSON array of event ids. API: `list()`, `has(id)`, `toggle(id)`, and a subscribe so every save button on a page reflects the same state. Reads and writes are wrapped so a blocked or full storage degrades to "nothing saved" rather than an error. Ids of events no longer active are kept in storage (an expired event may come back verified) but never shown. The explorer's "saved only" and the front page's save buttons use it. There is no saved-events page; `/explore?saved=1` is that view.

### `.ics` export

`toIcs(events)` produces an RFC 5545 calendar with one `VEVENT` per one-off or limited run. Rules, each pinned by a fixture test:

- `UID` is `<id>@kc-events`, a fixed token rather than the host, so a later domain change does not duplicate entries in subscribers' calendars.
- Times are emitted in UTC (`DTSTART:20261010T000000Z`), converted from the stored offset, so no `VTIMEZONE` component is needed and every client reads them correctly. The dataset carries both `-05:00` and `-06:00` offsets across the November change.
- `DTSTART` and `DTEND` share one value type. If both are date-times, both are UTC date-times. If either is a date, both are `VALUE=DATE`: `DTSTART` is the start's local date and `DTEND` is the day *after* the end's local date (RFC 5545 date ends are exclusive). A single-day event with no end gets `DTEND` one day after `DTSTART` as a date, or `DTSTART` plus two hours as a date-time (a placeholder length; the description says the page has the details).
- A limited run with an end and no start (three today) is emitted as a single all-day event on its closing date, with the description beginning "Last day."
- `SUMMARY` the title, `LOCATION` venue and neighborhood, `URL` the primary page, `DESCRIPTION` the why-line when present, then "Verified <date> by <site name>; details at <primary URL>."
- Recurring events are skipped: turning a schedule phrase into an `RRULE` is a research-job question, and a calendar entry with no date is worse than none.
- Line folding at 75 octets and text escaping follow the RFC.

Two surfaces: `/e/<id>.ics` is a static file per event (an Astro endpoint under `getStaticPaths`); "Export this view" in the explorer generates a file in the browser from the current results, saved-only included, through a `Blob` and an `a[download]` click. Both call the same function. iOS Safari opens `.ics` in a viewer rather than downloading; that is the platform's behavior and is left alone.

## 8. Honesty and degradation

- **Research stamp** in the header on every page, from `lastSuccessfulRun`.
- **Staleness banner.** If the visitor's date is more than `staleAfterDays` (9) after `lastSuccessfulRun`, every page shows a banner: "This list was last researched on Oct 5 and may have missed changes since." The glossary and proposal describe the banner as showing "when the last run failed," but the site cannot see a failed run (a failed run commits nothing), so age is the proxy: a weekly cadence plus two days of slack. `StalenessBanner` is a small island so a two-week-old build says so in the visitor's browser; the server-rendered HTML carries the banner too when the build itself is stale. The glossary entry is amended to this rule (section 13).
- **Last-verified on every event**, everywhere an event appears.
- **A failed run** commits nothing; the site keeps serving the last good data and the stamp does not move, so the banner appears on its own after nine days. **A failed build** leaves the last deployment live.
- **Past events are hidden** at build and, in hydrated components, at view time. The event page is the one static surface that outlives its event by up to a week; it carries the hydrated "already happened" notice (section 7).
- **Cancelled and postponed events** are the job's responsibility: a cancellation expires the event (gone from the site at the next build); a postponement is a date change (the page updates). The site adds nothing here.

## 9. Design

The site has no imagery, so it has to be beautiful as a page of text. The direction is **calm density**: many items readable at a glance, the thing the aggregators cannot do because they are built around thumbnails and ads. The paragraphs below are direction; the measurable requirements are the ones with numbers, and section 12 names the test for each.

**Type.** One variable sans with tabular figures, self-hosted under an open license (no Google Fonts request: that is a tracking surface). Dates set in tabular figures so columns align. A clear size scale: the why-line is the largest secondary text on the page; metadata (venue, neighborhood, verified) is small and quiet; titles are set at a size that reads at arm's length on a phone.

**Color.** A near-black on warm off-white base with a dark scheme via `prefers-color-scheme`, no toggle. Each of the eleven kinds has a hue, used sparingly: a chip, a left rule on a card, never a filled background behind text. Don't-miss has one distinct treatment (a mark and a slightly heavier card) that does not compete with the kind hue. All text and chip pairings meet WCAG AA in both schemes; the tokens live in one CSS file as custom properties.

**Layout.** A single column that never exceeds a comfortable measure on the front page; the explorer is a filter rail beside results on wide screens and a collapsible filter sheet above them on phones. 16 px side gutters, no horizontal scroll at any width from 320 px up. Sticky day headings in the explorer. Space is the main separator; rules are thin and few.

**Motion.** Almost none. Filter changes re-render instantly; no transitions on lists. Any motion honors `prefers-reduced-motion`.

**Register.** Plain and friendly; a utility, not a bit. Headings are nouns ("This weekend," "Always there"), not slogans. No exclamation marks in site copy.

**Accessibility.** Semantic landmarks, one `h1` per page, keyboard-operable filters with visible focus, chips as real buttons with `aria-pressed`, the live region of section 6, and contrast as above.

**Performance budget**, measured as compressed transfer of HTML, CSS, and JavaScript per page (the event data arrives inside the HTML, so a JavaScript-only budget would miss it): front page under 50 KB; explorer under 50 KB measured on the end-to-end build's fixed fixture data, so the budget is for its code (until 2026-10-07 it was measured on the real data, 100 KB and then 120 KB once each event carried a link to its own page, #53, and the weekly event count alone pushed it over; the build's 400 KB raw-payload limit bounds the data); event page under 40 KB. No third-party requests of any kind. A size check after `astro build` (the separate `size` step in CI, not part of the deploy build) fails CI when a budget is exceeded.

## 10. Chatbot and search legibility

- Clean semantic HTML on every page; the front page's `h1` is "What's on in Kansas City" with the site name in the title tag.
- `/llms.txt`: what the site is, how it is made, where the dataset is, the URL patterns, and the one-paragraph cite-or-drop rule.
- `/events.json`: the published dataset, served with `Cache-Control: public, max-age=3600` and `Access-Control-Allow-Origin: *` from `site/vercel.json`, so browser-side readers can fetch the contract.
- `schema.org/Event` JSON-LD on event pages; `sitemap.xml` listing every page from the canonical origin; `robots.txt` allowing everything.
- No cookies, no third-party requests. The one measurement is Vercel Web Analytics (added 2026-10-07 at Evan's call): cookieless page views, its script served from the site's own origin. The about page says so.

## 11. The methods page

`/about`, in plain language: what the site is for; how it is made (a weekly research job that reads venue and organizer pages directly, extracts dates and venues only from those pages, and holds back anything it cannot cite); what don't-miss means and that it is an editorial call made by a model under written rules; that visits are counted only by cookieless first-party analytics; where the dataset is and that it is free to reuse with attribution; and how to report a wrong listing (a link to a prefilled GitHub issue). It links the repo.

## 12. Testing

- **Unit (vitest, in `site/test/`)**: every function in `site/src/lib/`. Horizon: each weekday as `today`, including Sunday, a year boundary, the DST Sunday, a limited run underway, a run closing this Sunday, a run with no start; the totality property (every non-past dated event lands in exactly one bucket) over the committed dataset for each of seven consecutive `today`s. Past dropping, `isMultiDay`, `isUnderway`. The explorer predicate for every filter alone and in combination, including the no-start limited run and a span that straddles the range edge. Grouping and both sorts. URL round-trip, repeated keys, unknown slugs, malformed ranges, the comma region. `toIcs` against fixture files for each rule in section 7. The saves store against a fake storage that throws. The no-clock grep over `site/src/lib` (`new Date()` and `Date.now(`) and the no-job-import grep over `site/src/lib` and `site/src/components`. These are the tests that matter; they run in milliseconds.
- **Build assertions**: a test loads the committed `data/events.json` and `research.config.yaml` through the site's `loadDataset` and checks it succeeds, the schema version matches, every active event gets a region under section 4's rule, ids are unique, and the payload is under the limit. This is the site's equivalent of `test/committed-files.test.ts`.
- **Component**: `Explorer` and `DontMissList` rendered with a fixture of a dozen events through `@testing-library/svelte` (its `svelteTesting` Vite plugin, with Astro's `getViteConfig` so `.svelte` compiles identically) in vitest's jsdom environment: filter interactions change the result list and the URL; "clear filters" resets; the live region carries the count; the hydration rule holds (first render equals SSR state, then updates).
- **End to end (Playwright, `site/e2e/`)**: against `astro preview` of a build made with `SITE_TODAY` and `SITE_DATASET` pointing at `site/e2e/fixtures/events.json`, with the browser clock fixed to the same date (`page.clock.setFixedTime`): the front page shows the fixture's don't-miss events under the expected headings; `/explore?when=weekend&kind=music` shows only the matching rows; an event page exists and its `.ics` downloads; a past event's page shows the notice; the 404 page renders; at a 320 px viewport `scrollWidth <= clientWidth` on every page; every request in the trace is same-origin; an axe scan passes on every page under both `prefers-color-scheme` values.
- **Size check**: a script after `astro build` that fails if a page in section 9 exceeds its budget, measuring compressed size of the HTML plus its referenced CSS and JS.
- **Not in the suite**: the `/events.json` headers (set by Vercel, not by `astro preview`) are a `curl` check against the preview URL in ticket 1's acceptance.

## 13. Delivery

Issues are cut from this spec in the order below; each is one agent-sized ticket. The first shippable site is the end of step 4; everything after is layered on a live preview URL.

0. Job-side housekeeping, independent of the site: an issue to remap stored off-list neighborhoods (the 31 "Johnson County" events) and to keep them on the list going forward; and the two `CONTEXT.md` amendments (staleness banner trigger, horizon buckets).
1. Workspace and skeleton: `pnpm-workspace.yaml` with `includeWorkspaceRoot`, root `vitest.config.ts`, `site/` with Astro + Svelte, `site.config.ts`, `loadDataset` and the `PublishedEvent` projection with the region rule, the build assertions test, `site-ci.yml`, `vercel.json`, and the Vercel project wired with the ignored build step: acceptance includes the data-only and docs-only deploy checks and the `curl` header check.
2. `site/src/lib/`: date helpers, horizon, underway, the explorer predicate, grouping, URL state, slugs, with their unit tests and the two grep tests. No UI.
3. Front page and methods page, with the design tokens, type system, and the share image. `DontMissList` hydrates under the hydration rule; `StalenessBanner`.
4. Event pages with JSON-LD and share tags, `EventPageIsland`, `.ics` per event with `toIcs` and its fixtures, 404, sitemap, llms.txt, robots.
5. The explorer island: filter rail, results, URL state, clear filters, live region, venue sort; component tests; the end-to-end suite with its fixture dataset.
6. Saves and export: the saves store, save buttons on all three surfaces, saved-only filter, export-this-view.
7. Size check in CI, accessibility pass with axe, dark scheme pass, phone layout pass.

Design review happens on the preview URL after steps 3 and 5. The /r/kansascity post waits on the curation work that the front page now puts pressure on, not on the site.
