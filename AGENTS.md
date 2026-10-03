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
- `pnpm research [--horizon-weeks N]`: one run. Reads `research.config.yaml`, `prompts/extraction-rules.md`, `data/registry.yaml`, and `data/events.json`; writes `data/events.json` and `data/runs/<run date>.md` plus `.json`. Secrets come from env or a gitignored `.env` (`OPENROUTER_API_KEY`; needed as soon as the registry has an active source).

The two editorial surfaces are plain Markdown under `prompts/`: `extraction-rules.md` goes to the extraction model with every page. A wrong date or venue in the dataset is a bug in that document first.

The run function in `src/run.ts` is the one seam: it takes config, dataset, registry, and four ports (model, search, fetcher, clock) and does no I/O. Test behavior there with the fakes in `test/fakes/`.
