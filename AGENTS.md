# KC This Week

A weekly researched, ad-free list of what's worth doing in Kansas City. The idea, decisions, and first milestone are in `PROPOSAL.md`; read it before planning any work.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, driven with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default names (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root, created lazily as terms and decisions get settled. See `docs/agents/domain.md`.

## Commands

- `pnpm test`: the full vitest suite. `pnpm vitest run <file>` for one file.
- `pnpm typecheck`: `tsc --noEmit`.
- The public site is the `kc-events-site` package in `site/`: `pnpm --filter kc-events-site dev | build | size | test | test:e2e`. `pnpm -r test` and `pnpm -r typecheck` run both packages. `.github/workflows/site-ci.yml` runs typecheck, build, size, tests, and e2e on pull requests and `main`.
- `pnpm research [--horizon-weeks N] [--no-discovery]`: one run; `--no-discovery` turns the discovery lane off for it. Reads `research.config.yaml`, `prompts/extraction-rules.md`, `data/registry.yaml`, and `data/events.json`; writes `data/events.json` and `data/runs/<run date>.md` plus `.json`. Secrets come from env or a gitignored `.env` (`OPENROUTER_API_KEY`, needed as soon as the registry has an active source; `TAVILY_API_KEY`, needed unless discovery is off). Spend has two layers: `spendCapUsd` in the config stops model calls within a run (`src/spend.ts` wraps the model port), and a monthly limit on the OpenRouter key itself, set by hand through `scripts/hand-run-setup.sh`, backstops a bug in the first.

- `pnpm grade [--run YYYY-MM-DD]`: fills counts three and four of `docs/milestone-one-grading.md` from a run report (latest by default) and `data/events.json`, keeping whatever is hand-written around the marked blocks. Refuses a report whose horizon or cap is not the milestone's (3 weeks, 5 USD).
- `scripts/weekly-run.sh`: the weekly run, on a home machine's cron (ADR 0010), Mondays at 6:17 a.m. Central. It runs in a clone dedicated to the job: pulls `main`, runs `pnpm research` (pass `--no-discovery` through), and commits `data/events.json` and that run's report as "Weekly research run <run date>", then pushes. A failed run commits nothing, logs under `~/.local/state/kc-this-week/`, and opens a `needs-triage` issue with the log's tail. A run in which no active registry source can be fetched counts as failed (`run` throws before any model call), so a dead network cannot count an outage against every event. Likewise a run in which model calls were made and none succeeded (`run` throws at the end), so a model that is wholly down cannot leave every page unread; a single failed model call only costs its page or batch, reported as a problem.
- `scripts/home-run-setup.sh`: the wizard that makes the dedicated clone, puts the two keys in its `.env`, points git at `gh`'s credential for the push, and installs the cron line.
- `.github/workflows/weekly-research.yml`: the same run on GitHub Actions, by manual dispatch only (with a no-discovery switch): the fallback when the home run misses a week. Two sources refuse GitHub's addresses (#22), so a fallback run counts an outage against their events. It commits as "Weekly research run <run date> (manual run)"; a failed run commits nothing and says so in the job summary.
- `scripts/weekly-workflow-setup.sh`: the wizard that sets the two keys as Actions secrets from `.env` and offers to start and watch a first run.
- `scripts/hand-run-setup.sh`: the wizard for the hand run's human steps: OpenRouter and Tavily keys into the gitignored `.env`, and the monthly limit on the OpenRouter key.

The two editorial surfaces are plain Markdown under `prompts/`: `extraction-rules.md` goes to the extraction model with every page, and `curation-prompt.md` goes to the curation model with every batch of events it judges. A wrong date or venue in the dataset is a bug in the first document; a don't-miss flag that reads as arbitrary is a bug in the second.

The run function in `src/run.ts` is the one seam: it takes config, dataset, registry, and four ports (model, search, fetcher, clock) and does no I/O. Test behavior there with the fakes in `test/fakes/`.
