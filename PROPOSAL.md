# KC Events — "Regret List" scout + site

**Status:** decision-complete
**Sessions:** 2026-09-05
**Build context:** two build targets. (1) **Fresh public repo** — the research job, dataset, and static site; standalone from all personal infra (In-Theaters-Radar precedent). (2) **A small module of `~/dev/assistant`** — the weekly taste-filtered push; build against `HubRouter`/the transport interface (read `docs/ROADMAP.md` and the project memory index first). Build (1) first; (2) is a thin consumer of (1)'s published JSON.
**Fable stages:** two — the research agent's extraction/honesty rules (a confidently wrong date on a public site is the trust-killer, and the failure is silent) and the curation prompt (the "regret-if-missed" call is editorial judgment that drifts week to week if written carelessly). Registry building, the tool loop, the site, and the hub push are build-model work.

## Problem & motivation

Evan wants to do more things with friends in Kansas City and doesn't know what there is to do. The incident shape is *not* "I knew about an event and missed it" — it's the absence of a picture. His friends discover events through social media (which he doesn't use and won't) or word of mouth; the events all have a web presence, so they're findable, but he isn't consistent about looking. The sites that would give him the picture — the local listing aggregators — are ad-laden and miserable to read, so he doesn't.

What he wants is a **clear, forward-looking glimpse of what's worth doing**, so that proposing something to friends starts from options instead of from a blank. Two surfaces fell out of the session:

- **Pull:** a simple ad-free public website — a clean picture he can open when planning, and share with coworkers. Pull-shaped by the 2026-07-11 distribution gate (no subscribers to recruit); same category as Radar.
- **Push:** a weekly post to him from the assistant hub with his own taste applied, because "not good about consistently looking" means a pull-only surface would reproduce the problem.

Why build rather than use an existing aggregator: the aggregators' business model *is* the thing that makes them unreadable (ads, undifferentiated volume), and none of them publish the one structural thing this site is built around — which events you'd regret missing versus which are always there.

## Shape of the solution

Two products over one dataset, split exactly as Radar split: the public product is standalone and never touches personal infrastructure; the personal product consumes the public product's published data.

```
weekly scheduled run (GitHub Actions, public repo)
  → research agent (tool-calling loop; model via OpenRouter; Tavily search + own page fetcher)
      lane 1: source registry — KC venues/institutions/organizers, checked every run
      lane 2: discovery — web search; aggregators read as an INDEX only, every lead followed to a primary page
  → extraction with cite-or-drop: date + venue read from the fetched primary page, or the item doesn't publish
  → incremental dataset (events.json): add / update / re-verify / expire
  → curation: recurrence class (deterministic-from-evidence) → regret-if-missed flag + one-line why (LLM, re-judged only on change)
  → static site build + deploy (free static hosting), publishes events.json alongside the HTML

weekly hub job (~/dev/assistant, scheduler primitive)
  → fetch events.json from the site
  → apply taste config (gitignored, prose)
  → post a handful of picks for the next ~2 weeks to Evan in Slack
```

**The site.** The top of the page is the **regret list** — one-offs and limited runs flagged regret-if-missed — grouped by horizon: *this weekend* / *next two weeks* / *further out*. Filters are date (the "just this weekend" case) and kind. Each item shows title, date, venue/neighborhood, the site's own one-line why, a link to the primary page, and a plain **last-verified** date. Recurring things (trivia nights, markets, First Fridays) live in a small "always there" section below. A methods page says how the site is made and where to report a wrong listing. No ads, no accounts, no tracking; chatbot-legible (clean semantic HTML, `llms.txt`, a stable "what's on in KC" URL) as in Radar.

**The dataset.** One event per record, roughly: id, title, start (and end for runs/exhibitions), venue, neighborhood, primary URL, kind, recurrence class (`one-off` / `limited-run` / `recurring`), regret flag + why, first-seen, last-verified, status (`active` / `unverified` / `expired`), and the lead that found it. Deduplication is by fuzzy (title, date, venue). This JSON is the interface between the research job, the site, and the hub push — the same file-as-interface shape Life Timeline and Sanity Coach use.

**The push.** A small hub module on the existing scheduler primitive. Weekly, early in the week (Tuesday morning is the working default so the weekend is plannable). Reads the published JSON, applies a taste file, posts a short list with links. That's the whole v1 of the personal side.

## Decisions made

- **Two surfaces, one dataset: standalone public site + hub push that consumes it** — *Why:* Evan wants both pull (a shareable picture) and push (he won't remember to look). Coupling a public product to the personal hub was rejected for the same reasons as Radar: the public thing shouldn't gate on or expose personal infra, and GitHub Actions is free and sufficient for a weekly job. The hub side reduces to "fetch JSON, filter, post," which is the shape of jobs the hub already runs (monthly digest, weekend rundown, news digest).

- **Claude-driven research from primary pages, not scraping the aggregators** — *Why:* Evan's explicit call, for two reasons. Legally: the ad-laden listing sites monetize the listings; republishing their descriptions and images is the exposed posture, while link-out with own-written summaries drawn from the event's own page is the defensible one (this is what search engines do). Practically: primary pages (venue calendars, promoter pages) are stable where aggregator layouts churn. Cost is higher than scraping and accepted knowingly. The aggregators are still *read* — as an index of leads, never as a source of published text.

- **Source registry as the primary lane; open search as the discovery lane** — *Why:* open web search for "KC events" lands on the aggregators anyway and re-discovers the same things each run. KC has on the order of 40–60 venues, institutions, and organizers that generate most of what's worth knowing (concert rooms, theaters, museums, First Fridays, ballpark, festival organizers). Checking them directly is mostly deterministic, bounds cost, and makes coverage explainable. Search covers what's outside the registry; a source that discovery finds twice gets promoted into the registry. The registry is a committed file in the repo — Evan can edit it by hand.

- **Cite-or-drop extraction** — every published item carries a primary URL, and the date and venue must have been read from that fetched page — not from a search snippet, not from an aggregator, not from model memory. An item that can't meet that is held as `unverified` and never rendered. *Why:* a confidently wrong date on a public site is this product's trust-killer (Radar's fake-precision lesson; Life Timeline's dig-skill honesty rules). This rule is the core of the first Fable stage.

- **Incremental dataset with re-verification and expiry** — runs add, update, re-verify, and expire rather than rebuilding from nothing. An active item that fails re-verification on two consecutive runs drops off the site (stays in the dataset as `unverified`). Past-dated items expire deterministically. *Why:* events persist for weeks; re-researching everything weekly is wasted spend and makes the page unstable. Two-strike expiry absorbs a transient fetch failure without keeping a dead listing alive.

- **Curation spine = scarcity of occurrence ("would you regret missing it?")** — each item gets a recurrence class from page evidence; the LLM then flags which one-offs and limited runs are regret-if-missed, with a stated one-line reason. Recurring items are never on the regret list. *Why:* "most interesting and notable" on a taste-neutral public site needs a structure that isn't the model's vibes, or the page reads as arbitrary and drifts between runs. Radar's spine was scarcity of *time*; this one's is scarcity of *occurrence* — a touring act, a festival, a closing exhibition are regret-shaped; weekly trivia is not. Evan confirmed this is the right cut. The model's judgment lives inside that structure (which one-offs are notable, and why), not over it. Alternative rejected: a blended "interest score" — opaque and unstable, same reasoning as Radar's rejection of a blended number.

- **Re-judge on change only** — the regret flag and the why-line are regenerated only when an item's underlying facts change (date, venue, status), never on every run. *Why:* page stability week to week, and cost bounding — the Radar blurb pattern.

- **Model-agnostic, OpenRouter-compatible, with Tavily for search** — the research agent is a hand-rolled (or thin-framework) tool-calling loop against an OpenAI-compatible chat endpoint, with tools for Tavily search and an own page fetcher; model IDs for research and curation are config values, and the two may differ (cheaper model for extraction, stronger for curation). No dependency on Anthropic's built-in web search or on Evan's Claude subscription/OAuth limits. *Why:* Evan's explicit constraint — this job must run for years without being hostage to one vendor's rate limits or one subscription's quota, and he already has a Tavily account to repurpose. The cost is that the research loop is more work to build than a provider-native search tool would be; that's build-model work and accepted.

- **Hard spend cap per run** — *Why:* an agentic research loop with search and fetch can wander; a public site that quietly costs $200 one month is the flash-in-the-pan death by another route. The cap is a config value; when hit, the run publishes what it verified and logs the shortfall.

- **Honest degradation, visible staleness** — every item shows last-verified; the site header shows the last successful run; a failed run leaves last-good data up with a staleness banner rather than a broken page. *Why:* a site shared with coworkers that silently shows stale or wrong listings is a public-facing failure, which is Evan's shame category ([[evan-neurotype-design-profile]]). This is the Data Stories "maintained resource, priced up front" call, made explicitly: the site is a **maintained resource**, not a one-shot artifact, and the maintenance tail is bounded by the registry (stable sources) and the spend cap.

- **Push to Evan only in v1** — the weekly hub post goes to him, in Slack. *Why:* asked directly, Evan chose "me only" for the initial build. The shared friends' Discord feed (the news digest already posts there; a communal "what's on" feed would let a friend's "I'm in" replace Evan having to draft a proposal) is a **named later expansion**, not a v1 surface — and whether a bot posting picks into the friends' channel reads as a feed or as performing him is a question to ask him at that boundary, not to assume.

- **Taste lives in a prose config file on the box, gitignored** — likes, dislikes, hard excludes, in plain language; the push job hands it to the model with the candidate list. *Why:* taste-matching was the backlog's "interesting bit," but the public/personal split makes it trivial — the public site is taste-neutral (the reader brings taste, the site brings the structure), and the personal filter is one prompt over a short list. No preference-learning, no feedback loop in v1.

- **Defaults Evan can veto at build time:** research window ~8 weeks ahead (touring shows appear while tickets exist); geography = the KC metro on both sides of the state line, plus Lawrence for concerts; weekly cadence for both the run and the push.

- **Standalone from row 8's "shared harness"** — this instance is Radar-shaped (public product + own clock), not a hub-harness instance. *Why:* the harness doesn't exist, and the events instance turned out to have a public half that shouldn't live on the hub. What row 8's remaining instances (friend-slop, civic tripwire) inherit is the *pattern* — registry + research loop + incremental dataset with cite-or-drop + thin hub push — not code or clock.

## Explicitly open

- **Name and domain.** "Regret List" is a session nickname, not a decision. Keep the register plain and friendly; the site is a utility, not a bit.
- **Kinds taxonomy.** Working set: music, theater/dance, comedy, art/exhibitions, festivals/markets, food/drink, sports, film, talks/readings, outdoors/community, other. Adjust from what the registry actually produces. Film overlaps with Radar's territory — fine to list one-off screenings; don't try to be Radar for KC.
- **Registry seed.** The build should assemble the initial 40–60 sources from Evan plus one discovery pass, and commit it as a plain file (name, URL(s) to check, kind, neighborhood, check hints). Which pages per source to fetch (calendar page vs. ICS/RSS feed where one exists) is a per-source detail; prefer structured feeds when a source offers one.
- **Fetcher politeness and robots.** Identify honestly, cache, one pass per source per run. Whether to honor `robots.txt` strictly for registry sources Evan has hand-added is the builder's call; the discovery lane should honor it.
- **Research loop framework.** Hand-rolled loop vs. a thin agent framework — anything OpenAI-compatible. Structured-output extraction (JSON schema) is strongly preferred over free-text parsing.
- **Model choices.** Any capable models at build time, one for extraction and one for curation; check current pricing then. The acceptance test (below) is what picks them: cheapest pair that passes.
- **Horizon boundaries and tier language.** "This weekend / next two weeks / further out" is the working shape; the build may find a fourth bucket reads better. Keep language honest.
- **Site stack and hosting.** Static generator, Pages vs. Cloudflare vs. Vercel — none load-bearing. Design pass should aim for calm density: many items readable at a glance, which is the exact thing the aggregators fail at.
- **Push post shape.** How many picks, how much text per pick, whether to include an "always there" line. Start with ~5 picks, links, one line each.
- **Corrections channel.** A GitHub issue link on the methods page is enough for v1.

## Risks & unknowns

- **Research coverage might be too thin or too noisy at acceptable cost.** The whole product assumes an agentic loop over a registry plus search finds the notable stuff a friend would have heard about, with few wrong dates, for a monthly cost Evan will pay indefinitely. This is the riskiest assumption and the first milestone targets it directly. If coverage is bad, the fix is usually the registry (add sources), not the model; if cost is bad, the fix is the cap and the re-verify cadence.
- **Wrong-date leakage despite cite-or-drop.** Extraction from a fetched page can still misread (a "doors 7 / show 8" page, a multi-date run, a rescheduled event whose old date is still cached). Mitigation: structured extraction with the evidence snippet stored alongside the value, re-verification every run, and the visible last-verified stamp. Treat any wrong date found in the milestone as a rules-file bug to fix, not noise to accept.
- **Registry rot.** Venues change calendar URLs. The two-strike unverified rule and a per-source failure count in the run log surface this; a source that fails three runs gets flagged in the run summary for Evan.
- **Curation drift.** "Regret-if-missed" is judgment; a careless prompt makes the list feel arbitrary or drift toward whatever's loudest. The re-judge-on-change rule bounds week-to-week drift; the prompt itself is a Fable stage.
- **Legal exposure is low but nonzero.** Facts (title, date, venue) aren't protectable; the site's summaries are its own; links go to primary pages. The exposed surface would be copying descriptions or images — the build must not do either. If a source objects, drop the source.
- **Discord expansion crosses near the authorship line.** Named, deferred, and gated on asking Evan at the time.

## First milestone

**Run the research job once, by hand, over a three-week window — before any site exists.** Assemble the seed registry, run the loop with the cap set, and grade the output on four counts: (1) what it found that Evan didn't know about and would consider proposing; (2) what it missed that friends knew was coming (ask them — word of mouth is the ground truth here); (3) wrong or unverifiable dates/venues (target: zero published wrong dates); (4) cost per run, extrapolated to a monthly figure Evan is willing to pay for years. Grading (2) and (3) against the rules file is the Fable-stage acceptance test.

Pass means the site is worth building; milestone two is the site plus the hub push. The lived acceptance test after that: **Evan proposes one thing to friends that he found through this and wouldn't have found otherwise.**
