# KC Events

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
- `pnpm research [--horizon-weeks N] [--no-discovery]`: one run; `--no-discovery` turns the discovery lane off for it. Reads `research.config.yaml`, `prompts/extraction-rules.md`, `data/registry.yaml`, and `data/events.json`; writes `data/events.json` and `data/runs/<run date>.md` plus `.json`. Secrets come from env or a gitignored `.env` (`OPENROUTER_API_KEY`, needed as soon as the registry has an active source; `TAVILY_API_KEY`, needed unless discovery is off). Spend has two layers: `spendCapUsd` in the config stops model calls within a run (`src/spend.ts` wraps the model port), and a monthly limit on the OpenRouter key itself, set by hand through `scripts/hand-run-setup.sh`, backstops a bug in the first.

- `pnpm grade [--run YYYY-MM-DD]`: fills counts three and four of `docs/milestone-one-grading.md` from a run report (latest by default) and `data/events.json`, keeping whatever is hand-written around the marked blocks. Refuses a report whose horizon or cap is not the milestone's (3 weeks, 5 USD).
- `.github/workflows/weekly-research.yml`: the weekly run on GitHub Actions, Mondays at 11:17 UTC, plus manual dispatch (with a no-discovery switch) for re-runs. It runs `pnpm research` and commits `data/events.json` and that run's report as "Weekly research run <run date>". A failed run commits nothing and says so in the job summary; a run in which no active registry source can be fetched counts as failed (`run` throws before any model call), so a blocked runner cannot count an outage against every event.
- `scripts/weekly-workflow-setup.sh`: the wizard that sets the two keys as Actions secrets from `.env` and offers to start and watch a first run.
- `scripts/hand-run-setup.sh`: the wizard for the hand run's human steps: OpenRouter and Tavily keys into the gitignored `.env`, and the monthly limit on the OpenRouter key.

The two editorial surfaces are plain Markdown under `prompts/`: `extraction-rules.md` goes to the extraction model with every page, and `curation-prompt.md` goes to the curation model with every batch of events it judges. A wrong date or venue in the dataset is a bug in the first document; a don't-miss flag that reads as arbitrary is a bug in the second.

The run function in `src/run.ts` is the one seam: it takes config, dataset, registry, and four ports (model, search, fetcher, clock) and does no I/O. Test behavior there with the fakes in `test/fakes/`.
