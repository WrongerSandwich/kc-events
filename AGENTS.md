# KC This Week

A weekly researched, ad-free list of what's worth doing in Kansas City. The idea, decisions, and first milestone are in `PROPOSAL.md`; read it before planning any work.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, driven with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default names (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root, created lazily as terms and decisions get settled. See `docs/agents/domain.md`.

## Concurrent sessions: one worktree per ticket

More than one agent session works this repository at a time (the lanes on #102), so every session works in its own git worktree and never in the main checkout, which stays on `main` and clean. In Claude Code, call `EnterWorktree` as the first step of a ticket, named after it (`71-cap-skipped-leads`): it makes `.claude/worktrees/<name>` on a fresh branch from `origin/main` and moves the session there. Elsewhere, `git worktree add ../kc-events-<ticket> -b <ticket>-<slug> origin/main`. In the worktree, `pnpm install --frozen-lockfile` once (the store is shared, so it is quick); tests and typecheck need no secrets, and a hand run needs the gitignored `.env`, copied from the main checkout and never committed.

Landing from a worktree: a serial-lane ticket (`run.ts`, adapters) rebases on `origin/main` after review and pushes its branch straight to `main` (`git push origin HEAD:main`); a site ticket, or anything running beside another session on the same files, opens a pull request from the branch. Remove the worktree when the ticket closes (`ExitWorktree` with remove, or `git worktree remove`). The weekly cron runs in its own clone (`~/kc-this-week-run`), so no worktree can collide with it.

## Commands

- `pnpm test`: the full vitest suite. `pnpm vitest run <file>` for one file.
- `pnpm typecheck`: `tsc --noEmit`.
- The public site is the `kc-events-site` package in `site/`: `pnpm --filter kc-events-site dev | build | size | test | test:e2e`. `pnpm -r test` and `pnpm -r typecheck` run both packages. `.github/workflows/site-ci.yml` runs typecheck, build, size, tests, and e2e on pull requests and `main`.
- `pnpm research [--horizon-weeks N] [--no-discovery]`: one run; `--no-discovery` turns the discovery lane off for it. Reads `research.config.yaml`, `prompts/extraction-rules.md`, `data/registry.yaml`, and `data/events.json`; writes `data/events.json` and `data/runs/<run date>.md` plus `.json`: each to a `.tmp` beside it, flushed, and renamed into place only once all three are written, so none is ever left truncated; nothing at all is written when the new dataset does not pass `parseDataset`. Secrets come from env or a gitignored `.env` (`OPENROUTER_API_KEY`, needed as soon as the registry has an active source; `TAVILY_API_KEY`, needed unless discovery is off). Spend has two layers: `spendCapUsd` in the config stops model calls within a run (`src/spend.ts` wraps the model port), and a monthly limit on the OpenRouter key itself, set by hand through `scripts/hand-run-setup.sh`, backstops a bug in the first. A model call is one attempt, abandoned after 2 minutes for a page or 3 for a curation batch; the report's JSON twin lists every call (model, provider, generation id, cost, or the error) to reconcile a month against OpenRouter's activity page. A search gets one retry on a rate limit or server error; a spent Tavily quota stops the run's searches with one report line.

- `pnpm grade [--run YYYY-MM-DD]`: fills counts three and four of `docs/milestone-one-grading.md` from a run report (latest by default) and `data/events.json`, keeping whatever is hand-written around the marked blocks. Refuses a report whose horizon or cap is not the milestone's (3 weeks, 5 USD).
- `scripts/weekly-run.sh`: the weekly run, on a home machine's cron (ADR 0010), Mondays at 6:17 a.m. Central. It runs in a clone dedicated to the job: resets to `origin/main` (abandoning any stopped rebase or undelivered commit), refuses if `main` already has a run for today (the manual workflow makes the same check), runs `pnpm research` (pass `--no-discovery` through) under a 90-minute timeout without the lock's file descriptor, and commits `data/events.json` and that run's report as "Weekly research run <run date>", then pushes; a rebase conflict with a commit that landed meanwhile re-applies the run's three files on top of `main`. Every run comments on the one open `weekly-run-health` issue (created when missing): a line on success, the redacted log tail on a failure. A failed run, a busy lock included, commits nothing, exits 1, and logs under `~/.local/state/kc-this-week/` (kept 90 days). A run in which no active registry source can be fetched counts as failed (`run` throws before any model call), so a dead network cannot count an outage against every event. Likewise a run in which model calls were made and none succeeded (`run` throws at the end), so a model that is wholly down cannot leave every page unread; a single failed model call only costs its page or batch, reported as a problem.
- `scripts/home-run-setup.sh`: the wizard that makes the dedicated clone, installs Chromium for the browser fetch, puts the two keys in its `.env`, points git at `gh`'s credential for the push, and installs the cron line.
- `.github/workflows/weekly-research.yml`: the same run on GitHub Actions, by manual dispatch only (with a no-discovery switch): the fallback when the home run misses a week. Two sources refuse GitHub's addresses (#22), so a fallback run counts an outage against their events. It refuses to start for a date the branch already has a weekly run for, and commits as "Weekly research run <run date> (manual run)"; a failed run commits nothing and says so in the job summary.
- `scripts/weekly-workflow-setup.sh`: the wizard that sets the two keys as Actions secrets from `.env` and offers to start and watch a first run.
- `scripts/hand-run-setup.sh`: the wizard for the hand run's human steps: OpenRouter and Tavily keys into the gitignored `.env`, and the monthly limit on the OpenRouter key.

The two editorial surfaces are plain Markdown under `prompts/`: `extraction-rules.md` goes to the extraction model with every page, and `curation-prompt.md` goes to the curation model with every batch of events it judges. A wrong date or venue in the dataset is a bug in the first document; a don't-miss flag that reads as arbitrary is a bug in the second.

The run function in `src/run.ts` is the one seam: it takes config, dataset, registry, and five ports (model, search, fetcher, browser fetcher, clock) and does no I/O. Test behavior there with the fakes in `test/fakes/`.

Choosing a source's fetch: the plain fetcher is the default. Give a registry source `fetch: browser` only when its listings are rendered by script, so the plain page has none (check with a plain fetch first); the browser fetcher (`src/adapters/browser-fetcher.ts`) walks the URL's redirects through the plain fetcher (robots.txt at every hop), loads where they end in headless Chromium with the same user agent and 15 s timeout, and returns the rendered HTML. It reads the page once the network goes quiet; a page that never does (ads, live scores) or that fills its list after going quiet needs `waitFor`, a CSS selector for one rendered listing. A re-verification of an event from that source goes through the browser too; discovery is always plain. Each fetch gets its own context (no downloads, no service workers, popups closed, frame navigations and requests to private hosts aborted). A redirect hop after a request's first URL can only be checked once it has gone out: a refused hop of the page's own navigation fails the fetch, and one of anything the page loads is a `WARNING` line in the log. Chromium runs in its sandbox, which needs unprivileged user namespaces: where the host has none it runs without, and the log says so in a `WARNING` line. The home run installs Chromium (`playwright install --only-shell chromium`, in `scripts/weekly-run.sh` and the setup wizard); the fallback workflow sets `BROWSER_CHANNEL=chrome` to use the runner's Chrome.

Both fetchers go through one fetch policy (`src/adapters/fetch-policy.ts`), checked at every redirect hop: http(s) only, no literal IPs, dotless, `.local`, `.internal` or `.localhost` hosts, or hosts resolving to a private address; a body budget of 5 MB; a content-type allow-list; the declared charset; and a pause per origin (robots.txt `Crawl-delay`, capped at 10 s, else 1 s). A refusal throws `FetchRefused`, which the run counts as an outage.
