#!/usr/bin/env bash
#
# The weekly research run, from a home machine on cron (ADR 0010). The GitHub workflow in
# .github/workflows/weekly-research.yml does the same steps and is the manual fallback.
#
# Runs in the clone this script lives in, which should be one dedicated to the job (set up by
# scripts/home-run-setup.sh): it pulls main, installs, runs `pnpm research`, and commits
# data/events.json and the run's report as "Weekly research run <run date>", then pushes. A failed
# run commits nothing, so the last committed dataset stands. It also installs the Chromium that
# registry sources with `fetch: browser` are loaded in. Each run's output goes to a log under
# $XDG_STATE_HOME/kc-this-week (default ~/.local/state/kc-this-week), and a failure opens a GitHub
# issue carrying the log's tail, since nobody is watching a cron job's terminal.
#
#   scripts/weekly-run.sh [--no-discovery]
#
# Secrets come from the clone's gitignored .env (OPENROUTER_API_KEY, TAVILY_API_KEY).

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
LOG_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/kc-this-week"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/run-$(date +%Y-%m-%dT%H-%M).log"
exec > >(tee -a "$LOG") 2>&1

cd "$ROOT"

# Two runs at once would race to commit the same files; a second one gives up rather than wait.
exec 9>"$LOG_DIR/run.lock"
if ! flock -n 9; then
  echo "another weekly run is in progress (lock $LOG_DIR/run.lock); nothing done"
  exit 0
fi

# Nothing is committed until the run has finished, so a failure before then leaves the dataset as of
# the last successful run. A failure after the commit (a push that cannot reach GitHub) leaves the
# commit here; the next run rebases it onto main and pushes both.
on_failure() {
  local status=$?
  echo "weekly run failed (exit $status); log at $LOG"
  if command -v gh >/dev/null 2>&1; then
    gh issue create \
      --title "Weekly research run failed on $(date +%Y-%m-%d)" \
      --label needs-triage \
      --body "$(printf 'The home-machine weekly run (scripts/weekly-run.sh) exited %s. Nothing was committed unless the push itself failed, in which case the commit is still on the home machine and the next run pushes it.\n\nLast lines of the log (`%s`):\n\n```\n%s\n```\n' "$status" "$LOG" "$(tail -n 40 "$LOG")")" \
      || echo "could not open the failure issue; see the log"
  fi
  exit "$status"
}
trap on_failure ERR

echo "weekly run starting $(date --iso-8601=seconds) in $ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "the working tree is not clean; this clone is for the job alone, so stopping rather than commit over it" >&2
  false
fi
git switch --quiet main
git pull --quiet --rebase origin main
pnpm install --frozen-lockfile --silent
# The browser fetch's Chromium, in step with the Playwright the lockfile pins; a no-op once it is there.
# A failed download does not stop the run: the browser sources count an outage, the rest are read.
pnpm exec playwright install --only-shell chromium || echo "could not install Chromium; sources with fetch: browser will fail this run"

timeout 90m pnpm research "$@"

git add data/events.json data/runs
if git diff --cached --quiet; then
  echo "the run finished but changed nothing under data/; every run should at least restamp the dataset" >&2
  false
fi
# The report written this run names the run date the CLI used, which is the one to commit under.
run_date=$(git diff --cached --name-only -- data/runs | sed -n -E 's%^data/runs/(.*)\.(json|md)$%\1%p' | head -n1)
if [[ -z "$run_date" ]]; then
  echo "the run finished but its report under data/runs did not change" >&2
  false
fi
git commit --quiet -m "Weekly research run $run_date"
# Someone may have pushed while the run was going; the run touches only data files, so rebase onto them.
git pull --quiet --rebase origin main
git push --quiet origin HEAD:main
echo "weekly run $run_date committed and pushed $(date --iso-8601=seconds)"
