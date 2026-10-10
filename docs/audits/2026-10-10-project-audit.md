# KC This Week — project audit and ideas, 2026-10-10

Scope: the whole repo at `d85adab` (main, after PR #67 and the 2026-10-09 hand run). Six scoped audits (pipeline core, adapters/ops, site, data + prompts, tests, security), each reading every file in its area in full; the pipeline audit also reproduced its top findings with throwaway vitest probes against the real `run()` using the repo's fakes, and the data audit ran scripts over the committed dataset. I re-read the code behind every finding marked **confirmed** in the top list. Nothing in the repo was modified.

Local state: root 304 tests pass, site 205 pass, both typechecks clean, build and size budgets green.

Confidence labels: **confirmed** (read in code, or reproduced), **plausible** (mechanism is in the code; trigger needs a precondition), **speculative**.

---

## Overall

The project is in better shape than most things its age. The one seam (`run()` over ports) is real and the behavioural test suite through fakes is deep. The site is unusually careful: no `{@html}`, every token pairing clears AA, date arithmetic is string-based so DST cannot move a day, the hydration contract is followed by every island, saves degrade gracefully. ADR discipline is paying off: nearly every finding below is a gap *between* two rules that are each right, not a wrong rule.

The three things that matter most, in order:

1. **The trust boundary is wrong for the discovery lane.** Any page a Tavily query returns (or any of the first ten links off an aggregator page it returns) becomes a *primary source* with the same authority as a vetted registry calendar. Cite-or-drop is enforced by the model's honesty, not by code. No prompt injection is needed: a plausible page can publish a fabricated event, cancel a real one, or take over a real event's link-out. This is both a security finding and the root cause of most of the data-quality mess (listing sites read as primary pages, cross-source duplicates).
2. **Several silent correctness bugs in the strike/identity machinery** that expire real events or breed duplicates, one of which was reproduced from the spend cap alone.
3. **Operational fragility on the home run**: a non-atomic dataset write, an inheritable lock that can silence every future run with exit 0, and a rebase path that leaves the clone wedged for weeks with a new issue filed each Monday.

Everything else is polish, growth, and ideas.

---

## Top 12: what I would fix first

| # | Finding | Where | Confidence |
|---|---|---|---|
| 1 | A discovery lead the spend cap stopped from being fetched is still recorded as *tried*; re-verification then treats "tried but no sighting" as a strike. Two capped runs → two-strike expiry of a real event, never fetched. | `src/run.ts:799` adds to `attempts.tried` before `follow()`; `follow` returns on `exhausted()` without recording an outage; `src/run.ts:601-604` strikes. Same shape for the "led to an index page" return at `:803-806`. | **confirmed** (reproduced) |
| 2 | Any verified sighting can cancel any matching known event, from any page. `speaksForEvent = fromOwnPage \|\| event.status === "active"`, and line 437 lets a cancellation through *after* the registry lane already verified the event this run. Next run the venue page revives it; the still-ranked page cancels it again. | `src/run.ts:437`, `:465-471` | **confirmed** |
| 3 | A verified discovery sighting that fuzzily matches a known event *replaces* its `primaryUrl`, `eventUrl`, dates, title, venue, description (`refresh` spreads `...sighting`), unless the registry lane verified it first that run. After that the event cites the other page as primary and re-verifies against it. | `src/run.ts:472`, `:542-554` | **confirmed** |
| 4 | The model's `primaryUrl` is trusted. It only falls back to the page the job sent when it fails to parse. A hallucinated URL that names another page fetched this run verifies the event against the wrong page; an unfetched one creates an unverified record keyed to a page nothing will ever re-verify. | `src/extraction.ts:234`, `:248` | **confirmed** (reproduced) |
| 5 | Evidence is never checked against the page text. "Cite-or-drop" in code means "the model typed something non-empty into the evidence field." | `src/extraction.ts:248-253`; the only check is the hand audit in `src/grading.ts:161` | **confirmed** |
| 6 | `data/events.json` and both reports are written with three plain `writeFile`s after a 30–40 min run, and the output is never validated with `parseDataset` before writing. A `timeout`, disk-full, or a date like `2026-02-30` (passes `LOCAL_DATE`, fails `z.iso.date()` on reload) leaves a dataset the next run cannot load. | `src/cli.ts:81-83`; `src/extraction.ts:300-303` | **confirmed** |
| 7 | The home run's lock FD is inherited by `pnpm → tsx → node → Chromium`; `timeout 90m` signals only `pnpm` (no `-k`). An orphaned headless shell keeps the lock, and every following Monday prints "another run in progress" and **exits 0**: no issue, no run, indefinitely. | `scripts/weekly-run.sh:29-33`, `:65` | **confirmed** mechanism, plausible trigger |
| 8 | If a manual workflow run (or any commit to `data/`) lands between the home run's commit and its `pull --rebase`, the rebase conflicts, the clone stays mid-rebase, and every later Monday fails the dirty-tree check and files a new `needs-triage` issue until someone runs `git rebase --abort` on the box. | `scripts/weekly-run.sh:54-57`, `:80` | **confirmed** |
| 9 | The published `/events.json` is the raw internal file byte-for-byte: all 1044 records including 100 `unverified` (which CONTEXT.md says are never rendered) and 361 `expired`, every verbatim evidence quote, `lead` with exact Tavily queries, strike counters, `sourceState` (which venues block the crawler). The about page calls it "the full dataset, free to reuse." | `site/src/build/write-generated.ts:22` | **confirmed** |
| 10 | ~55 active events (9%) were read from listing sites not on `aggregatorHosts` as if they were primary pages: `fairsandfestivals.net` (19), `gonorthkc.com` (14), `applebaumkc.com` blog posts (9, and the 10-09 report *suggests promoting it*), `kclivearts.org` (9 + 10 unverified), `festivalguidesandreviews.com` (1 + 20 unverified). These produce most duplicate clusters, the venue-is-"Downtown" cases, and 31 of the 100 unverified. | `research.config.yaml` `aggregatorHosts` | **confirmed** (data) |
| 11 | Two-night one-offs (a Fri+Sat comedy stand, Stapleton's two nights, PBR Outlaw Days) are shown as "On now, through Sat" with the start time hidden, collapsed under ~70 exhibitions, and exported to `.ics` as all-day blocks. 21 published events today. | `site/src/lib/events.ts:31-43`, `group.ts:62-74`, `tile.ts:31`, `ics.ts:50-52` | **confirmed** (data) |
| 12 | The plain fetcher has no response-size cap, no content-type check, no charset decoding, and no private-IP guard; discovery follows arbitrary anchors. A 300 MB PDF linked from an aggregator OOMs the run; a `192.168.1.1` anchor is fetched from the home LAN with the crawler UA and sent to OpenRouter. The browser fetcher runs Chromium with `--no-sandbox` (Playwright default), one shared context, downloads accepted, popups unrouted and alive until the run ends. | `src/adapters/fetcher.ts:56-73`, `src/adapters/browser-fetcher.ts:137-157` | **confirmed** |

---

## A. Research pipeline: correctness

### Identity and duplicates (ADR 0007)

- **www vs non-www, http/https, trailing slash make two identities.** `normalizeUrl` is `new URL(u).href`; `sameEventExactly` is `===`. Dataset has both `www.powerandlightdistrict.com` and `powerandlightdistrict.com` for the same festival. `src/extraction.ts:291-297`, `src/identity.ts:127`. confirmed.
- **#68 generalised:** fuzzy match needs both starts within 3 days; a record with only an `end` never matches, and two sources giving the same exhibition with the same closing date but starts >3 days apart stay two (four Nerman exhibitions ×2 today). `src/identity.ts:176-178`. confirmed.
- **Venue-less rule is self-blocking.** `onlyCandidateForVenueless` requires exactly one candidate; once two venue-less twins exist (Symphony/Ballet programs: Wizard of Oz ×4, Nutcracker ×4, Studio Ghibli ×4) nothing can ever merge or fold them, and each run adds one more unverified record. `src/identity.ts:190-197`. confirmed.
- **#66 generalised:** shared `eventUrl` + same date is not an identity signal. 7 live groups share eventUrl+date today. confirmed.
- **Same page, same title, two dates collapses to one record**, and a cancelled second listing expires the live first one ("Dueling Pianos" Nov 7 / Nov 27). `src/run.ts:437`. confirmed (reproduced).
- **Duplicate-expired records are unmatchable, so a sighting that matches only the duplicate creates a fresh record every run, which folds again:** one dead record per run ("Interstellar Live" ×2 duplicates; "Main Gallery Tours (Oct. 2026)" reproduced). `src/run.ts:452-454`, `:526-533`. confirmed (reproduced).
- **Fuzzy refresh replaces the stored title** → title flaps between long and short forms, churning the diff and the public page. `src/run.ts:542-554`. confirmed, impact plausible.
- **Alias containment makes short names wildcards:** "Kansas City" is contained in two alias-group names. `src/identity.ts:97-104`. plausible, bounded by title+date.
- Polsky Theatre is missing from the Midwest Trust Center alias; Kansas City Music Hall vs Convention Center; "Lakeside Nature Center" vs its street address (kcparks).

### Strikes, outages, expiry (ADR 0008)

- **An excluded source's events are still fetched for re-verification every run** through that source's fetcher (`originFor` ignores `status`). A source excluded "by request" is hit weekly until its events expire. `src/run.ts:863-871`, `:613`. confirmed (reproduced).
- **Any model wobble on a registry page is a strike** (candidate dropped, empty title, `outsideGeography`); two wobbles → expiry. 218 events carry strikes today. confirmed mechanism.
- **Horizon stated to the model as "the next N weeks" without an end date**, while code's last day is today+7N inclusive; events on the last day or two can be omitted → strike. `src/model-request.ts:16-18`. plausible.
- A page whose listing window shrank ("next 20 shows") strikes real events, which revive when they scroll back in — churn plus re-curation. plausible.
- **Undated, never-verified records are immortal** (7 today, 91 never-verified unverified total). confirmed, low impact.
- A venue-less unverified sighting clears a known event's strikes though the comment says it cannot speak for the event. `src/run.ts:473-476`. confirmed, minor.
- Timezone/DST: **correct**. `fromLocal` verified at the 2026-11-01 fall-back and the spring gap. Only the day/hour overflow in #6 above.

### Spend cap and curation

- OpenAI SDK defaults: `maxRetries=2`, `timeout=10 min`. A wedged provider holds a page for up to 30 min of the 90-min budget; a timed-out attempt the provider actually ran is billed but only the last attempt's `usage.cost` is summed. `src/adapters/openrouter.ts:30-36`, `src/spend.ts:33`. plausible; the monthly key limit backstops cost but nothing backstops time.
- `usage.cost === 0` never trips the cap (free/BYOK models). speculative for the configured pair.
- **Re-judge triggers on raw string inequality of `start`**: `2026-10-10` vs `2026-10-10T20:00:00-05:00` (one source with times, one without) re-judges on every flap. `src/run.ts:904-910`. confirmed, cost bounded.
- Folding duplicates keeps the *kept* record's judgment, not the most recent; a flag on the duplicate is dropped (Liberty's Beacon: index-page record flagged, surviving registry record unflagged). confirmed, minor.
- Title changes never re-judge, so a why-line can name the old title. minor.

### Model-response hygiene

- **Evidence snippets carry the job's own link markers** ("Central Library [12]", "Offsite Location [118]"): `readPage` rewrites anchors as `text [n]`, the rules demand verbatim quotes, the model obeys. 36 records today. `src/extraction.ts:142-150`, `:242-245`. confirmed.
- No length cap on any model-written string (`title`, `venue`, `description`, evidence, `whyLine`, `schedule`). Two evidence strings are already >300 chars; the site build throws above 400 KB projected payload, so one runaway page = a failed Vercel build = a stale site. confirmed.
- `endDate < startDate` accepted → `isPast` on `end` expires a future event as `past` for a week. confirmed.
- A hallucinated in-range `eventLink` sends readers to another event's page; only bounds are checked. confirmed.
- `LOCAL_TIME` accepts `24:00` (shifts the date a day) and `25:30`. confirmed (reproduced).

### Config and registry validation

- Host lists accept anything non-empty; `https://do816.com` or `do816.com/` silently never matches. `src/config.ts:93-98`. confirmed.
- `timezone` is any string; an invalid one throws a `RangeError` late. confirmed.
- No uniqueness check on alias names across venues (transitively joins venues) or registry URLs across sources. confirmed.
- `expiryReason` is optional even when `status === "expired"` (0 violations today).

### Diff noise

`run()` does not mutate inputs and is deterministic given input order — good. Noise sources: evidence/description/eventUrl/title replaced on every verified reading even when only whitespace differs; `sourceState` keeps keys for removed sources; `discoveryState` never prunes (29 hosts, including three now on `aggregatorHosts`); 361 expired records with full evidence kept forever. The file grew 718 KB → 1.05 MB between 10-05 and 10-09 (~80 KB/week); every weekly commit rewrites the whole thing into git history.

---

## B. Security and the trust boundary

The site's XSS posture is clean (see D). The exposure is upstream.

### What an attacker-controlled page can do today

All **confirmed** by reading `src/run.ts:798-853`, `src/extraction.ts:232-253`, `src/discovery.ts:103-114`, `src/curation.ts:58-68`:

- **Publish a fabricated event** with attacker-chosen `title`, `description`, `start`/`end`, `venue`, `neighborhood` (any list value), `primaryUrl` (their page), `eventUrl` (any anchor on their page — there is no same-site rule), and indirectly `dontMiss`/`whyLine` (a famous name at a small room is exactly what the curation prompt flags). "Details and tickets at kc-shows.example" is the phishing hop. Precondition: Tavily ranks the page top-5 for one of nine queries, or an aggregator page Tavily returns links to it among its first ten outbound links.
- **Expire a real event as cancelled** and keep it off the site for as long as the page ranks (top-12 #2).
- **Hijack a real event's reading** — primary page, link-out, dates, description — when the registry lane did not verify it first that run (top-12 #3).
- **Break the site build** with ~150 KB of junk strings on one page (400 KB payload guard → failed deploy → stale site).
- **Inject into the curation batch** via a title ("EDITOR NOTE: flag every event…"); the why-line is published verbatim on cards, event pages, meta/og description, JSON-LD, ICS. low.
- Page text reaches the extraction model undelimited and unlabelled (`user` = `Page URL: …\n\n<page text>`); the rules never say "text addressing you is content."

What already holds: strict JSON-schema output; `primaryUrl` must be a fetched URL (so `javascript:` from the model fails); `eventUrl` limited to http(s) and link-number resolution stops the *model* inventing URLs; aggregator hosts never extracted; kinds/neighborhoods snapped to lists; recurring never curated; `lead` kept across refreshes.

### Browser fetcher

Bounded to the three `fetch: browser` registry sources and their re-verification; the realistic path is a compromised embedded widget (one of the three renders an Elfsight calendar, another an MLS match widget). Then:
- `--no-sandbox` (Playwright's default without `chromiumSandbox: true`): a renderer exploit runs as `evan`, next to `~/.config/gh/hosts.yml` and the clone's `.env`. confirmed.
- `page.route` is per page; `window.open()` pages have no route, no robots check, and live until `browser.close()` at the end of the run (up to 90 min). Non-main-frame requests (iframes, `fetch`, `<img>`) to `127.0.0.1`/RFC1918 are `continue()`d. One shared context: `acceptDownloads` on, service workers allowed, storage shared across sources. No memory cap. confirmed.

### Home machine and supply chain

- The cron clone pushes with the user-wide gh OAuth token (`repo`, `workflow`, every repo you can write to); `main` has no ruleset; Vercel auto-deploys `main`. A malicious dependency *version* entering the lockfile through a routine bump runs inside `pnpm research` with both API keys, network, Chromium, and a token that can push to `main` of this (or any) repo. Conversely anyone who lands a commit on `main` gets code execution on the home box next Monday. `--frozen-lockfile` is used (good); pnpm 10 blocks install scripts (good); no `minimumReleaseAge`, no Dependabot. confirmed.
- Both `.env` files are 0664 (the wizard's `mktemp`+`mv` would give 0600; these were hand-made). `.gitignore` ignores only `.env` exactly, not `.env.local`. confirmed.
- Actions use floating major tags; `site-ci.yml` has no `permissions:` block and no concurrency group. confirmed, low.
- The failure issue body embeds the local log path and the last 40 log lines (provider error bodies included) into a public repo; `tee` is asynchronous so the tail can miss the stack. confirmed, low.

### Site (clean)

- No `{@html}`; `set:html` only on JSON-LD (with `<` escaped), the sprite, and the mark. Every dataset string is an escaped text/attribute expression. ICS escaping is RFC 5545 for every property except `URL:`, where WHATWG parsing strips CR/LF anyway. Query parsing validates against known tables. localStorage saves are array-of-strings validated. confirmed clean.
- One gap: `z.url()` (zod 4.6.5) accepts `javascript:`, `data:`, `ftp:`, `mailto:` and `"https://a.com/x\ny"` (tested). `primaryUrl`/`eventUrl` reach `href` in five places, ICS `URL:`, and JSON-LD. Today the pipeline guarantees https incidentally. Add an explicit `^https?:` refine in `src/dataset.ts` and a throw in the site's `project()`. confirmed, low.
- No security headers beyond Vercel's HSTS: no CSP, `frame-ancestors`, `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy`. confirmed, low.
- Footer says "no tracking"; Vercel Web Analytics counts unique visitors with a daily-rotating hash of IP+UA. The about page's wording is accurate; the footer's absolute is not. "No ads, no accounts, no cookies" would be true.

---

## C. Operations

- **Non-atomic writes and no output validation** (top-12 #6).
- **Lock inheritance / exit 0** (top-12 #7) and **wedged rebase** (top-12 #8).
- **Overlapping home + manual runs always conflict**; the workflow's "Nothing was committed" text is then right but the week's data is discarded, and the home side becomes #8. Same-day runs also collide on `data/runs/<date>.*` names. confirmed.
- **A new issue per failure, forever**; a repeating cause files one a week. If the failure *is* network loss, `gh issue create` fails too and nothing is left but a log. The lock-busy path notifies nobody. #64 (notify Evan) is still open. confirmed.
- **No per-call timeout on OpenRouter** beyond the SDK's 10 min (see A).
- **Node version drift**: `.nvmrc` 22, root `engines >=22`, site `engines 22.x`, `@types/node ^26`, CI on 22, the home box on **24.21.0** (`/usr/bin/node`), this machine on 24. Every real weekly run uses a different undici/fetch/`loadEnvFile` than CI and the tests. confirmed.
- Robots semantics are RFC 9309-correct; `Crawl-delay` is ignored and there is zero inter-request pause per origin. confirmed.
- The browser launch failure is cached for the run: one transient failure = every browser source counts an outage that week. consistent with one-attempt-only, worth knowing.
- Tavily: one attempt, no quota awareness; exhaustion shows as ten identical problems. low.
- `$LOG_DIR` never rotates; `~/.cache/ms-playwright` is already 1.9 GB with two Chromium builds. low.
- `cli.ts` loads `.env` from `cwd`, has no `--help`, and `grade-cli.ts` casts a run report with no schema. low.

---

## D. The site

Beyond the two items in the top 12:

- **Venues are rendered raw with no display-alias layer.** 44 published events carry a config alias name (Helzberg Hall 18, Yardley Hall 12, Muriel Kauffman Theatre 4, Tivoli Cinema 3…), plus "Galleries", "Bloch Lobby", "Main Auditorium" (10), "Pavilion", eight bare street addresses, and three whose venue is the neighborhood. The explorer's venue sort makes the Kauffman Center three groups; ICS `LOCATION:Helzberg Hall, Downtown`; JSON-LD `location.name: "Galleries"`. The matching already exists for identity (ADR 0007) — map through `venueAliases` at build into `venue` + `room`. confirmed.
- **"Saved N" counts ids of events that are gone**; `/explore?saved=1` then shows fewer. `SavedLink.svelte:7`; `saves.ts` never prunes by design. Store `{id, last}` under a v2 key with a migration. confirmed.
- **The front-page budget is 2.3 KB from the line and data-dependent** — each extra don't-miss pick costs ~0.4 KB gz, five more pops it, and the weekly data commit runs neither `site-ci.yml` nor `pnpm size`. Measure `index.html` on the fixture build like the explorer; drop the `svelte/animate`+`transition` runtime in favour of the View Transitions API already enabled. confirmed.
- **The explorer ships every event twice**: 57 KB gz of SSR rows + 45 KB gz of the same events as JS = 131 KB gz on the real build, invisible to CI (fixture-measured). The 400 KB raw guard trips around 950 events. plausible concern on 3G.
- Only the front page re-reads the clock on `visibilitychange`; the explorer, event page, and staleness banner freeze `today` at mount — a tab reopened next morning shows yesterday's "Today". confirmed.
- Build-robustness gaps, all **plausible / unreachable today**: a one-off with `end` and no `start` crashes `dateTile`; inverted spans not asserted (`DTEND` before `DTSTART` is invalid ICS); unknown kinds not asserted; zero published events or a wrong `SITE_TODAY` publishes an empty site silently, replacing a good deploy; ids not asserted as `evt_[0-9a-f]{12}` (an `&` would break the sitemap and `view-transition-name`).
- Search ignores kind and region and does not fold diacritics ("cafe" misses "Café"); `always-there.ts` already has a `fold`. confirmed.
- "Next 7 days" spans 8 days, "Next 30 days" 31 (inclusive both ends). confirmed, minor.
- The `Explorer.svelte:91` `state_referenced_locally` warning is **not a bug**: `$state(countText)` seeds the live region deliberately. Silence with `untrack` or a `svelte-ignore` comment explaining the seed.
- Hard-coded duplicates of job facts: the user-agent string on `about.astro:21`, the geography sentence in the footer, "Kansas City" on two pages; `origin.ts` falls back to `http://localhost:4321` silently in any build with neither env var.
- SEO: JSON-LD uses the why-line as `description` never the description text; no `eventStatus`, `image`, `organizer`, `endDate` for timed one-offs; `addressLocality` is the neighborhood; no `WebSite`+`SearchAction`; sitemap has no `<lastmod>` for 580 weekly-changing pages; 404 lacks `noindex`; `og:image` lacks width/height/alt.
- `@fontsource-variable/inter` is a dependency and unused. Josefin Sans 700 ships five subsets in two formats for a three-word wordmark. No font preload; the header swaps on first paint.
- a11y (axe passes; judgment calls): `h2` inside `<summary>`; `role="group"` named "When" inside a fieldset whose legend is "When"; `--rule` borders at 1.23:1 on pills; WeekStrip appears only with ≥3 days left so a Friday build viewed Monday grows a strip on hydration (small CLS).
- ICS: no `X-WR-CALNAME`/`METHOD:PUBLISH` on the export file (imports as an unnamed calendar); `LOCATION` has no address so phones cannot map it.
- Staleness banner logic is correct (`runDay + 10`); because deploys only follow data commits, the SSR'd banner never appears for crawlers/no-JS — a daily deploy hook is the cheap fix if it ever matters.

---

## E. Data quality and the two prompts

Dataset at 10-09: 1044 events = 583 active / 100 unverified / 361 expired (two-strike 124, past 121, index-page 70, duplicate 46).

### Cite-or-drop is holding on dates, slipping on venues

Mechanical check over all 583 active: date evidence contains the stored month+day in 558/562 dated events (the 4 weak ones are `kclivearts` bare day numbers and "through the end of December" → 12-31). Venue evidence contains the venue name in 496, an address only in ~60 (allowed: Lawrence Arts Center, WWI Museum, Convention Center, Liberty Hall all cite the footer address), neither in ~6 (Siilk cites "Paper Anchor Media Presents"; Hawthorne Heights cites a tour name). The Ren Fest registry record cites the *office* address. A 40-event random sample: 0 date problems, ~2.5% true venue-citation error. No evidence snippet contains model prose.

### Duplicates beyond #66/#68 (15 same-title clusters, 32 events; 7 same-eventUrl clusters)

Ren Fest ×4 active; four Nerman exhibitions ×2 (nermanmuseum.org vs artsjoco.org); PBR Outlaw Days www/non-www; kcparks registry vs a filtered month-view discovery URL (Garden Work Day, Paint & Garden, Trunk or Treat — each pair shares `eventUrl`); Phantom of the Opera at "Music Hall" vs "Convention Center" with disagreeing dates; What if Puppets at "Polsky Theatre" vs "Midwest Trust Center"; City Market Farmers Market from two domains (`thecitymarket.org` registry, timed out 10-06; `thecitymarketkc.org` suggested for promotion four runs running); City Center Live series name and its program both extracted (4 records share one artsjoco `eventUrl`); Charlotte Street awards opening in two neighborhoods with two verdicts; Tivoli Cinemas vs Nelson-Atkins `/events/tivoli/` — Coco, Cinema Paradiso, Loving Vincent stored twice and duplicate-expired every week (spend + churn); KC Wine Co "Mahjong 101 (Copy)".

### The 100 unverified

84 lack a venue; ~31 come from listing sites; 22 share a normalized title with an active event and would fold under a venue-less rule that counts only active candidates. Registry sources that have **never produced an active event after five runs**: Kansas City Symphony (10–11 extracted per run → 6 dup + 4 unverified; Kauffman covers it), Kansas City Ballet (3–4 → 0), KC Rep (4 → 1). `kcroos.com` away games ("Volleyball at South Dakota") are held unverified rather than dropped as outside geography. `museumofkansascity.org` is fetchable and yields events while the registry excludes `kansascitymuseum.org` — probably the wrong domain. `kcstarlight.com` is excluded as blocked yet discovery published from it.

### Titles, venues, neighborhoods, dates

- 25 all-caps titles as the page gave them; 9 ending " at <venue>"; one with the date in it ("BLACK SPHINX at Vulpes Bastille — Monday, October 26", stored as a 10-26→10-30 *limited run*); tour names as titles ("Legacy Tour 2026", "TALL TOUR KANSAS CITY"); CMS junk ("(Copy)", "{ticketed, family-friendly}", "(ticketd)", "®" ×9); section headers as titles ("First Friday", "Farmers Market", "Improv Show", "Night Market").
- Venue = neighborhood ("Downtown" ×4, "Crown Center" ×3); 16 street addresses as venues; "Online" as a venue (virtual PD, limited run to 2027-03-01); organisations as venues ("Charlotte Street", "Pathway Financial Education" ×5, "Kansas City Ballet"); Nelson-Atkins appears under 5+ spellings.
- "Elsewhere in the metro" is the 7th most common neighborhood (36), ~20 of them Northland cities the list cannot express (Parkville ×7, Liberty, North Kansas City, Riverside, Kearney, Excelsior Springs) because the Northland region lists only "Northland" and the rules say "name the city". Waldo is missing. The same venue gets different neighborhoods from different sources. The report's "Unmappable neighborhoods" section is 105 lines, ~90% repeats of last week — it hides new values.
- Date invariants hold (0 past-and-active, 0 end<start, 0 midnight starts, 0 limited runs without end). **27% of dated active events (152/558) have no time**: Lied Center 14/14, T-Mobile Center 12/12, Kauffman 11/22 — those pages almost certainly show times. The Chiefs' schedule phrase lists five dates and will go stale; four per-game records from the same page two-strike-expired (flapping between season and game).

### Descriptions (#65)

265/583 (45%), all from the 10-09 run. **Zero** at recordBar (0/38), Warehouse (0/36), Replay (0/20), Midwest Trust Center (0/18), Lawrence Arts Center (0/16), Midland (0/14), Knuckleheads (0/13), Liberty Hall (0/12), Crown Center (0/11), Nelson-Atkins (0/8), Nerman (0/7). Some are one-line calendars; Kauffman, Kemper, Nelson-Atkins, Nerman, Lawrence Arts Center, Liberty Hall cards carry blurbs — check the 70 000-char truncation. Padded listing lines the rule forbids ("A new musical adventure.", "An award-winning ensemble.", support-act-only descriptions); marketing words ("premier", "iconic", "bestselling"); imperative copy ("Join Lakeside Nature Center's…"). 8 share a 6-word run with their evidence. Description is not sent to curation.

### Kinds and don't-miss

music 217 (37%), **other 65**, festivals/markets 65, art 51, talks 40, theater/dance 36, outdoors 32, film 30, comedy 26, sports 13, food/drink 8. "other" is a dumping ground for (a) non-public events that should be skipped — a fire-cadet graduation, a Chamber dinner, a med-school gala, a class reunion, a memorial service, educator PD, a parks board meeting, trade shows — (b) classes/workshops with no kind (KC Wine Co ×9), (c) museum family programs, (d) #69.

Don't-miss: **15/583 (2.6%)**: music 10, art 3, sports 1, other 1; **zero** in theater/dance (36), comedy (26), film (30), talks (40), festivals/markets (65). Spread across 14 sources (max 2), so the skew is by kind, not venue. The prompt's own flag example ("a festival that happens once a year") is unflagged in practice (Ren Fest, Boo at the Zoo, Día de los Muertos, Brew Fest). The proposal wanted ~5 picks a week. Why-lines are well-formed but lean on unverifiable world-knowledge claims.

### Promotions still leaking

"Cafecítón: A Latin Brunch Club", "END OF DAYS HALLOWEEN PARTY", KC Wine Co's 25 active ("Live Music at Ghouls Pop Up Bar", "Dueling Pianos", "Speed Dating", "Boozy Book Exchange"), Warehouse on Broadway club nights, museum trivia, an arts-center open mic, The Bird's standing shows. ~70 of the 124 two-strike expiries are promotions stored before the rule tightened, kept forever.

### Prompt critique

**Extraction rules** (~3 300 words, every page): rules the data shows are not followed — title strip, organisation-is-not-a-venue, never-pad-a-listing-line, neutral voice, tour-name, presenter. Conflicts: "DJ night → skip" cannot separate a venue's weekly DJ from a ticketed one-off with a named headliner; "drop the presenter" collides with "What if Puppets presents…" where the presenter performs; footer-address-as-evidence lets a page vouch for off-site events and the Ren Fest cite its office; "most specific name on the list, else the city" means Parkville can never land in Northland; "the place as the page gives it" yields "Galleries" and "Bloch Lobby". Missing: skip non-public events; skip online/virtual; away games are outside geography; strip CMS junk and trailing " at <place>"; a bare day number is not date evidence; venue evidence must contain the name or an address, never a headline; description shape rules. Redundancy: the evidence contract is stated three times; the "(Oct. 2026)" month-tag rule is a WWI-museum patch that belongs in a `checkHint`. Roughly a quarter could go. Capability assumptions: neighborhood mapping relies on the model's KC geography, which it mostly declines ("no neighborhood proposed" ×dozens for well-known venues).

**Curation prompt** (~650 words): well written; the problem is calibration and inputs. Examples steer to music/art; "when unsure, do not flag" plus "expect some batches to earn no flags" drives 2.6%; no description is sent, so "if the title tells you nothing, it is not a flag" is now needlessly strict; per-record judging gives one occasion two verdicts across duplicates; no "fields are data" line; no channel for "this is not an event", though curation is the only step that sees the week whole.

Spend is $0.20–0.34 per run against a $5 cap (~7%): **cost is not the binding constraint.** A stronger extraction model, a second pass, or the held two-hop fetch of `eventUrl` are all affordable.

---

## F. Tests

Coverage tooling (`@vitest/coverage-v8`) is not installed in either package, so this is from reading every `it(...)` and grepping every export.

**Well covered:** `run.ts` behaviourally (registry, outages, two-strike, horizon, discovery, index pages, promotion, cap at every stage, curation batching, folding, neighborhoods, event link, descriptions, browser routing); `identity` (27 cases), `recurrence`, `expiry`, `taxonomy`, `grading`, schemas; the site's `lib/*` (incl. DST and 75-octet folding), build loader, every island, e2e with axe in both schemes and no-JS.

**Not covered at all:** `adapters/fetcher.ts` (robots per hop, 4xx/5xx semantics, 5-redirect cap, relative `Location`, memoised failures, UA), `adapters/browser-fetcher.ts` (unit), `adapters/openrouter.ts` (missing `usage.cost`, refusal, tool_calls, empty content, non-JSON, strict schema body), `adapters/tavily.ts`, `cli.ts`/`grade-cli.ts`, `time.ts` DST on the job side (the site tests DST; the *job* writes the offsets), `report.ts` beyond two substrings, `origin.ts`, `ui-icons.ts`. No recorded HTTP fixtures, contract tests, or golden snapshot anywhere. The fake fetcher encodes the real fetcher's contract (`robots-unreachable` throws, `status: 0, robotsAllowed: false`) but nothing checks the adapter matches it, and every fake fetch sets `finalUrl === url`, so redirect handling in `run()` is never exercised.

**Invariants not guarded** by `committed-files.test.ts`/`committed-dataset.test.ts` (all hold today): no active event whose last day is before the run date; dataset-wide unique ids (only active, only in the site loader); every non-expired neighborhood on the config list; `expiryReason` present iff expired; no active event citing an index page; no `eventUrl` on an ignored/aggregator host; `sourceState` keys ⊆ registry; `generatedAt` matches the newest run report; every `data/runs/*.json` parses (no `RunReport` schema exists; `grade-cli` casts).

**Flakiness:** the site's `test` script runs `generate` with real `new Date()` when `SITE_TODAY` is unset, so five test files depend on real-today × committed dataset and fail as several unrelated errors when the dataset goes stale (cron misses ~2 weeks). `always-there.test.ts` needs ≥3 picks matched; `endpoints.test.ts` needs a recurring and a Lawrence event in the committed data. Two site tests mutate `process.env.TZ` (safe under forks, not threads). Playwright has no `retries`, needs port 4321 free, and uses a 300 ms sleep for the CLS measurement.

**Most valuable missing tests** (sketches in the appendix of ideas): real-fetcher robots contract + fake parity; redirect walk; OpenRouter adapter against a canned completion; committed-dataset invariants above; a full run-report Markdown snapshot; redirected pages through `run()` via a `finalUrl` on `CannedPage`; job-side DST + malformed model dates; CLI arg→config as a pure function + atomic-write test; extraction edge cases (truncation marker, out-of-range `eventLink`, unparsable `primaryUrl`); all-blocked registry; curation batching and duplicate-id reply; a golden three-week scenario pinned with `toMatchFileSnapshot`; property tests (`fast-check`) for identity normalisation, `cleanWhyLine`, `parseQuery∘toQuery`, `toLocalDate∘fromLocal`.

---

## G. Ideas: hardening and extension

Grouped by layer, roughly by payoff. Items marked ★ are the ones I would do first.

### Pipeline

1. ★ **Discovery trust rules** (one change, closes the three worst findings): a cancellation only counts from the event's own page, the same registrable domain, or the registry lane; a refresh of a known event only from the same registrable domain or the registry lane; everything else is a confirmation plus a report line. Add `eventUrl` same-eTLD+1-or-platform rule (costs 2 of 531 link-outs today). Tests with the fakes.
2. ★ **Decide what discovery may publish.** Cheapest sound option: new events from a host not in the registry are held `unverified` until the host is promoted — reusing the promotion-suggestion flow that already exists. That is a product decision worth an ADR either way.
3. ★ **Enforce "verbatim" in code**: both evidence strings must occur in the whitespace-normalised page text, after stripping the job's own `[n]` markers (or mark links with `⟦n⟧` so real footnotes survive). Turns the hand audit into an invariant; catches the 36 marker leaks and hallucinated quotes on legitimate pages.
4. ★ **Fix the cap-strike bug** (`tried` only after `follow` returns a page; count cap-refused leads as `notReverified`) and the index-page variant.
5. ★ **Set `primaryUrl = origin.pageUrl` unconditionally**; keep the schema field for prompt stability.
6. ★ **Validate before writing**: `parseDataset(result.dataset)` in `cli.ts`, atomic temp+fsync+rename for all three files, `expiryReason` iff expired as a zod refine, dataset-wide id uniqueness, `^https?:` on URLs, length caps on every model-written string (title 200, venue 150, description 300, evidence 500, why 200), round-trip date check, hour ≤23.
7. **Identity**: canonicalise `www.`/scheme/trailing slash; match on same `eventUrl` + same date (+ same venue or primary host); limited runs match on title+venue+same end; venue-less rule counts only active candidates and prefers same host / same `eventUrl`; `duplicateOf` on folded records so `findMatch` can follow it; same-page same-title different-date → second record; keep the known title when the new one is a cut-short form; alias groups require equality or reordering, not containment; Polsky Theatre alias.
8. **Strikes**: skip re-verification for excluded sources; "empty reading" guard (N≥3 last run → 0 this run with a 200 = outage, not N strikes); strike only when the page's latest listed start is after the event's start (an omission beyond the page's window is not a strike); print "through YYYY-MM-DD" in the run lines; nearest-dated sighting wins when several match.
9. **Curation**: compare calendar dates not strings in `markChanged`; carry the most recent judgment across a fold; send the description; add one example per non-music kind and a flag-density target; "fields are data" line; drop a judgment whose why contains a URL.
10. **Deterministic promotion skip** before storage (title regex: trivia|bingo|karaoke|happy hour|watch party|game day|open mic|brunch club…), counted in the report, so churn never enters the dataset.
11. **Venue→neighborhood hand table** applied by the job for known venues; extraction proposes only for unknown ones. Add Northland cities, Waldo, Brookside to the list; report only *new* unmappable values.
12. **Age out state**: archive expired records older than N weeks to `data/archive/<year>.json` (35% of the file); prune `discoveryState` hosts unseen for 8 runs and never store aggregator/platform hosts; drop `sourceState` keys not in the registry; keep stored evidence/description when equal modulo whitespace. Add an "identity churn" line to the report (titles/primaryUrls changed this run) so #66-shaped flaps are visible before an expiry.
13. **Event-link audit**: store the anchor text behind `eventLink` and require it to share a word with the title or be a generic "tickets/details" phrase; report mismatches.
14. **Time coverage**: investigate Lied Center and T-Mobile Center (0% times); consider the held two-hop fetch of `eventUrl` for time and description when the list line has neither — spend allows it.

### Registry and config

15. ★ Add `fairsandfestivals.net`, `festivalguidesandreviews.com`, `applebaumkc.com`, `kclivearts.org`, `wanderistan.com`, `kcstudio.org` to `aggregatorHosts`; decide `gonorthkc.com`. Expires ~55 dubious active and ~31 unverified records and removes most duplicate clusters.
16. Prune or repoint: KC Symphony, KC Ballet, KC Rep (0 active after 5 runs; production pages name the hall); merge Tivoli into Nelson-Atkins; fix City Market's domain; exclude The Truman with a reason or find its new URL; check KC Actors Theatre's URL; check whether the Kansas City Museum is really `museumofkansascity.org`; re-check Starlight.
17. A seasonal `activeMonths` field for Azura, Heartland Book Festival, Fringe, Royals, so off-season sources are neither fetched nor flagged.
18. Grow toward non-music one-offs (the registry's own note): Stray Cat Film Center (7 active via discovery already), Screenland Armour, Rooftop Cinema Club, Museum of Kansas City film series, KCAI, The Bird Comedy Theater, Crown Center, Johnson County Library, Truman Library, UMKC/KU lecture series, Boulevard Brewery, KC Roos home games, Monarchs, Union Station/Science City. Decline KC Wine Co's promotion.
19. Validate host-list entries as bare hostnames, the timezone against `Intl.supportedValuesOf`, alias uniqueness across venues, registry URL uniqueness across sources, and a registry URL on an aggregator host.
20. Kinds: decide #69 (fairs/rodeos/livestock → festivals/markets); a `classes/workshops` kind or explicit mapping; museum family programs → art; a skip rule for the non-public items now in "other".

### Fetching and the browser

21. ★ One `fetch-policy.ts` shared by both fetchers: scheme allow-list; literal IP / `.local` / RFC1918 / loopback / link-local / `fc00::/7` rejection per hop (after DNS); byte budget (5 MB) with `body.cancel()`; content-type allow-list (html, xhtml, plain, calendar, xml); charset from header → BOM → `<meta>` → UTF-8 via `TextDecoder`; per-origin pause honouring `Crawl-delay` capped at 10 s with a 1 s default.
22. ★ Browser hardening: `chromiumSandbox: true` if the host allows user namespaces; fresh context per fetch with `acceptDownloads: "deny"`, `serviceWorkers: "block"`; `context.route` not `page.route`; `context.on("page", p => p.close())` for popups; abort private-host and non-main-frame navigations in the route handler; `--disable-extensions --disable-background-networking`; `--js-flags=--max-old-space-size=512`; re-check `page.url()` against robots after `waitForLoadState`; try/catch around `route.continue/abort`.
23. OpenRouter client: `timeout: 120_000` (extraction) / `180_000` (curation), `maxRetries: 0` or 1 (a failed page is already a reported problem), explicit `usage: {include: true}`; record per-call model/provider/id/cost in the JSON report so monthly reconciliation against OpenRouter's activity page is mechanical. Tavily: one retry with jitter on 429/5xx; on a quota 4xx, skip remaining queries and say so once.

### Operations

24. ★ Self-healing `weekly-run.sh`: at start, abort any rebase and `reset --hard origin/main` (the clone only ever holds data commits), prune logs older than 90 days; run `pnpm research` with `9>&-` and `timeout -k 2m 90m` under `setsid`; on conflict, abort, re-apply the run's three files on fresh `origin/main`, recommit; `git merge-base --is-ancestor origin/main HEAD` before push; **exit non-zero on every abnormal path including lock-busy**; redact `sk-or-`/`tvly-` and `$HOME` from the issue body; `sleep 1; sync` before `tail`.
25. ★ One open "weekly run health" issue the script *comments on* (a one-line success summary each week, the log tail on failure) instead of a new issue per failure — closes the loop with #64 without Slack. Plus a Tuesday scheduled workflow that only checks whether a "Weekly research run <Monday>" commit exists and labels the health issue if not (cheap, commits nothing, and the weekly commit keeps the schedule from auto-disabling).
26. Mutual exclusion between home and manual runs: both sides check for an existing "Weekly research run <today>" commit on `origin/main` before starting.
27. ★ Narrow the home credential: a fine-grained PAT scoped to this repo with `contents: write` + `issues: write` (or a deploy key for push and a narrow token for issues) in the clone's own credential file; drop `gh auth setup-git` from the wizard; a ruleset on `main` requiring PRs with the run's identity on the bypass list; `minimumReleaseAge: 10080` in `pnpm-workspace.yaml`; Dependabot for `npm` (grouped weekly) and `github-actions`; SHA-pinned actions; `permissions: contents: read` and a concurrency group on `site-ci.yml`; run the cron job as a dedicated user or under `systemd-run --user -p ProtectHome=read-only -p MemoryMax=2G -p PrivateTmp=yes` with no `~/.config/gh`.
28. Align Node: pick 24 (bump `.nvmrc`, `engines`, site `engines`, `@types/node` to 24) or install 22 at home; a vitest that asserts the four agree; the wizard checks `node --version` against `.nvmrc`. `chmod 600` in `write_env`; `.gitignore` → `.env*` + `!.env.example`.
29. `pnpm research --dry-run` (writes `runs/<date>.dry.*`, never `events.json`) and `--self-test` (one plain + one browser fetch, no model calls) so the Monday job never discovers a broken Chromium or expired token cold. `--help`; `ROOT` from `import.meta.url`; a `runReportSchema` used by `grade-cli` and the committed-files test.

### Site

30. ★ Publish the **projection** as `/events.json` (active only, public fields, with `description`); keep the raw file in git; update the about text. Add `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `frame-ancestors 'none'` in `vercel.json`, and a CSP via Astro's CSP support (hashes the island bootstrap, `explore.astro`'s `is:inline`, and the analytics snippet). Footer: "no ads, no accounts, no cookies".
31. ★ Nightly one-offs: list a multi-day one-off under each night (or today while underway) with "8:30 pm · through Sat"; keep "On now" for limited runs; ICS timed `DTSTART` with `DTEND = start + 2h` (or one VEVENT per night) when end is date-only.
32. ★ Venue display aliases at build: `venue` = canonical, `room` = the page's name; group/sort by `venue`; canonical name in ICS and JSON-LD; warn on single-generic-word venues.
33. Build assertions: one-off ⇒ `start`; `end ≥ start`; kind on the list; id matches `evt_[0-9a-f]{12}`; throw on zero published events when the dataset has active ones, and when `today` is >14 days from `lastSuccessfulRun`; throw in production builds with no known origin.
34. Saves v2 with `{id, last}` and a `storage` listener for cross-tab sync; SavedLink counts only live entries; mark passed saves rather than hide them.
35. Budget hygiene: measure `index.html` on the fixture build; warn in `write-generated` above a pick-count ceiling; replace `svelte/animate`+`transition` with `document.startViewTransition`; `client:idle` for the banner and saved link; drop `@fontsource-variable/inter`; subset Josefin to the wordmark's glyphs; preload `geist-latin-wght-normal.woff2`.
36. Shared `today` rune with the `visibilitychange` hook for every island; search over kind + region with NFKD folding; "Next 7 days" = 7; `untrack` the live-region seed; guard `decodeURIComponent` in `DontMissList.svelte:160`; export the UA string and geography sentence from the job through `site/src/build/`.
37. SEO: JSON-LD with `description` (the description text, why-line as a separate field), `eventStatus`, `image: /og.png`, `endDate`, `organizer`, a real `addressLocality`; `WebSite`+`SearchAction` on `/`; `ItemList` for the picks; `<lastmod>` in the sitemap; `noindex` on 404; `og:image:width/height/alt`.

### Site extensions (neutral tool, no accounts, no tracking)

38. **Venue pages** `/v/<slug>`: canonical venue with rooms, upcoming events, primary link; the venue table this needs (address, lat/long) also fixes ICS `LOCATION`, JSON-LD `streetAddress`, and unlocks the spec's deferred map.
39. **Kind and region landing pages** `/k/music`, `/r/johnson-county`: the explorer's slices as crawlable static HTML with `ItemList` JSON-LD — `groupResults` with fixed filters at build.
40. **Calendar subscriptions**: `/calendar.ics`, `/calendar/dont-miss.ics`, per-kind and per-region feeds regenerated weekly; a `webcal://` Subscribe link beside Export. Stable `UID`s already make this safe.
41. **RSS/Atom of the picks** (`/feed.xml`): one item per don't-miss event with its why-line, one item per run ("Week of Oct 12: 15 picks"). Works in any reader; no list to recruit.
42. **"What changed this week"** page from fields already in the dataset (`lastChanged`, `expiryReason`, date moves): new picks, moved dates, cancellations. Trust-building, voice-free.
43. **Shareable shortlists** `/explore?ids=a,b,c` so a group chat can pass a list around; "Export saved" to `.ics`.
44. **Explorer**: group by kind and by region; a per-day count heat strip in the rail; "Next weekend" and "This month" presets; `j`/`k`/`s`/`Enter`/`e` keys listed on `/about`.
45. **Per-event share** (Web Share API, clipboard fallback) and client-built "Add to Google/Outlook" template URLs beside the `.ics` link — no third-party script.
46. **Print stylesheet** for `/` and `/explore?when=weekend`: a one-page weekend list.
47. **OpenSearch** (`/opensearch.xml` → `/explore?q={searchTerms}`); **installable PWA** with a minimal service worker caching the last build (the staleness banner already tells the truth about age); `/llms-full.txt` with the week's picks in plain text, `/events.csv`, per-kind JSON, and the explorer's query grammar documented in `/llms.txt` so a chatbot can construct links.
48. **"Tonight" entry point**: a header line "Tonight: 23 events" → `/explore?when=today`.
49. **Free / family flags** with evidence under cite-or-drop: "free" is the filter readers ask for first; a small extraction-rules change plus one chip.

### Tests and infrastructure

50. ★ Recorded HTTP fixtures under `test/fixtures/pages/` with a `routes(table)` helper over `vi.stubGlobal("fetch")` — Node fetch is global, no MSW needed; adapter contract tests for fetcher (robots per hop, 4xx/5xx, redirects, memo), OpenRouter (canned completion; missing cost, refusal, non-JSON, strict body), Tavily. An opt-in `LIVE=1` suite hitting one tolerant URL and OpenRouter at `spendCapUsd: 0.01`, never in CI.
51. ★ A **golden three-week scenario** (3 sources, a redirect, a strike, an outage, a discovery lead, a flag) run through `WEEK_1..3` and pinned with `toMatchFileSnapshot` for both the dataset and the Markdown report, so a refactor of the 999-line `run.ts` that quietly changes ordering or a count shows as a diff.
52. Extend `committed-files.test.ts` with the unguarded invariants (one `it` each); a `runReportSchema`; property tests with `fast-check` for identity normalisation, `cleanWhyLine`, `parseQuery∘toQuery`, `toLocalDate∘fromLocal`; `CannedPage.finalUrl` so redirects are testable through `run()`.
53. Decouple data-dependent site tests from the real clock (`SITE_TODAY` defaulting to `lastSuccessfulRun`'s date for tests; one named "dataset is not stale" test); `@vitest/coverage-v8` in both packages with a CI artifact; Playwright `retries: CI ? 1 : 0`, `trace: "on-first-retry"`, replace the 300 ms sleep.

### Bigger directions (beyond the current milestone)

54. **The hub push** (PROPOSAL.md milestone two, "a thin consumer of the published JSON") is still unbuilt. With the projection published and the picks feed (41) in place, the taste-filtered Slack post is a small job over `/events.json` — and the RSS feed may make the hub push unnecessary for the "won't remember to look" problem.
55. **A second extraction pass for flagged events only**: once curation flags ~5–15 events a week, re-fetch each one's `eventUrl` and extract time, price, age restriction, and a better description under cite-or-drop. Cost is trivial at 15 pages; the front page gets the richest data where it matters.
56. **A corrections loop**: the methods page links to Issues; a `corrections.yaml` of hand overrides (title, venue, neighborhood, "not an event") applied by the job after extraction and reported, so a wrong listing can be fixed in minutes without touching a prompt — and the file doubles as a regression set for prompt edits.
57. **Prompt regression harness**: 20–30 recorded pages with hand-checked expected candidates, run against the real extraction model on demand (`LIVE=1`), diffed. Every prompt edit today is tested only by the next weekly run.
58. **Neighboring-city expansion is a config change** (geography, neighborhoods, registry, discovery `place`); the architecture already supports a `columbia-this-week` as a second config. Not a recommendation, just a note that the shape is there.

---

## Suggested sequencing

Week 1 (hardening, no product change): 4, 5, 6 (cap-strike, primaryUrl, validate+atomic+caps), 24, 25 (self-healing script + health issue), 30 (projection + headers), 15 (aggregator hosts). All small, all testable with the fakes, all close confirmed bugs.

Week 2 (trust boundary): 1, 2, 3 (discovery trust rules, publish policy ADR, verbatim check), 21, 22 (fetch policy, browser hardening), 27 (credential + ruleset + release age).

Week 3 (data quality): 7, 8, 9, 10, 11 (identity, strikes, curation, promotion skip, neighborhood table), 16–20 (registry), prompt edits from E.

Then the site items (31–37) and the extensions in whatever order reads best on the Vercel preview.

If it helps, I can turn any slice of this into `ready-for-agent` issues in the repo's triage format, or start on week 1 directly.
