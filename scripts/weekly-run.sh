#!/usr/bin/env bash
#
# The weekly research run, from a home machine on cron (ADR 0010). The GitHub workflow in
# .github/workflows/weekly-research.yml does the same steps and is the manual fallback.
#
# Runs in the clone this script lives in, which should be one dedicated to the job (set up by
# scripts/home-run-setup.sh): it resets to origin/main, installs, runs `pnpm research`, and commits
# data/events.json, the run's report, and any archive file under data/archive as "Weekly research
# run <run date>", then pushes. A failed
# run commits nothing, so the last committed dataset stands. It also installs the Chromium that
# registry sources with `fetch: browser` are loaded in. Each run's output goes to a log under
# $XDG_STATE_HOME/kc-this-week (default ~/.local/state/kc-this-week), kept for 90 days.
#
# Nobody watches a cron job's terminal, so every run reports to one open GitHub issue labelled
# weekly-run-health (created the first time it is needed): a line on success, the log's tail on a
# failure. Every abnormal ending, a busy lock included, exits 1.
#
#   scripts/weekly-run.sh [--no-discovery]
#
# Secrets come from the clone's gitignored .env (OPENROUTER_API_KEY, TAVILY_API_KEY, and GH_TOKEN, a
# fine-grained token for this repository alone that the push and the health issue use: #105).

# No errtrace (-E): the ERR trap would run inside every $(...) as well, and report one failure twice.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
LOG_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/kc-this-week"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/run-$(date +%Y-%m-%dT%H-%M).log"
exec > >(tee -a "$LOG") 2>&1

cd "$ROOT"

HEALTH_LABEL=weekly-run-health
# The fine-grained token the push uses too (through scripts/git-credential-env.sh), read once here.
GH_TOKEN_FROM_ENV=$(sed -n 's/^GH_TOKEN=//p' .env 2>/dev/null | tail -n1 | tr -d '\r' || true)
# The CLI dates a run in the config's timezone; the check for an earlier run today uses the same day.
TODAY=$(TZ=America/Chicago date +%F)

# The run's one issue: found by its label, opened the first time. A network that is down takes gh
# with it, so a report that cannot be posted is logged and otherwise ignored.
report() {
  command -v gh >/dev/null 2>&1 || { echo "gh is not installed; not reporting"; return 0; }
  # gh gets the clone's token for this repository alone (#105), not the user's own sign-in; it is
  # exported for this function's gh calls only.
  if [[ -n "$GH_TOKEN_FROM_ENV" ]]; then local -x GH_TOKEN="$GH_TOKEN_FROM_ENV"; fi
  local issue
  issue=$(gh issue list --label "$HEALTH_LABEL" --state open --limit 1 --json number --jq '.[0].number // empty') || {
    echo "could not reach GitHub to report; see the log"
    return 0
  }
  if [[ -z "$issue" ]]; then
    gh label create "$HEALTH_LABEL" --color 0e8a16 --force \
      --description "The home weekly run's record: one line per success, the log's tail per failure" >/dev/null || true
    # gh prints the new issue's URL, which ends in its number.
    issue=$(gh issue create --label "$HEALTH_LABEL" --title "Weekly run health" \
      --body "Each run of scripts/weekly-run.sh on the home machine comments here: one line on success, the end of its log on a failure. #64 is where notifications go; this is the record. Keep this issue open, or the next run opens another.") \
      || { echo "could not open the health issue; see the log"; return 0; }
    issue=${issue##*/}
  fi
  gh issue comment "$issue" --body "$1" >/dev/null || echo "could not comment on the health issue; see the log"
}

# The issue is public: the home directory and anything shaped like an OpenRouter, Tavily, or GitHub
# key are taken out of what goes there.
redact() {
  local text=${1//"$HOME"/\~}
  sed -E 's/sk-or-[A-Za-z0-9_-]*/sk-or-[redacted]/g; s/tvly-[A-Za-z0-9_-]*/tvly-[redacted]/g;
    s/github_pat_[A-Za-z0-9_]*/github_pat_[redacted]/g; s/gh[pousr]_[A-Za-z0-9]*/gh_[redacted]/g' <<<"$text"
}

fail() {
  trap - ERR TERM HUP INT
  local why=$1
  echo "weekly run failed: $why"
  # tee is still writing the log; give it a moment so the tail holds the error.
  sleep 1
  sync
  # shellcheck disable=SC2016 # the backticks are Markdown
  report "$(redact "$(printf '**%s: failed.** %s\n\nNothing was committed unless the push itself failed; the next run starts from origin/main either way. Last lines of `%s`:\n\n```\n%s\n```\n' \
    "$TODAY" "$why" "$LOG" "$(tail -n 40 "$LOG")")")"
  exit 1
}
trap 'fail "line $LINENO exited $?"' ERR
trap 'fail "the script was stopped by a signal"' TERM HUP INT

# Two runs at once would race to commit the same files; a second one gives up rather than wait, and
# says so, since a lock that stays busy for a week means something is stuck holding it.
exec 9>"$LOG_DIR/run.lock"
if ! flock -n 9; then
  fail "another weekly run holds the lock ($LOG_DIR/run.lock)"
fi

echo "weekly run starting $(date --iso-8601=seconds) in $ROOT"
find "$LOG_DIR" -maxdepth 1 -name 'run-*.log' -mtime +90 -delete

# This clone only ever holds data commits, so it starts each run exactly at origin/main: a rebase a
# past run left stopped is abandoned, and a commit a past push never delivered is dropped, since
# this run reads the dataset afresh. Only data/ is cleaned; .env and node_modules are ignored files.
if [[ -d "$(git rev-parse --git-path rebase-merge)" || -d "$(git rev-parse --git-path rebase-apply)" ]]; then
  echo "abandoning a rebase a past run left stopped"
  git rebase --abort
fi
git fetch --quiet origin main
git checkout --quiet --force -B main origin/main
git clean --quiet -fd -- data

# The manual workflow refuses on the same check, so neither starts for a date the other has
# committed. Two started within the same run time can still both commit; the later one wins.
recent=$(git log --format=%s -n 100 origin/main)
if grep -q -E "^Weekly research run $TODAY( |$)" <<<"$recent"; then
  fail "origin/main already has a weekly research run for $TODAY"
fi

pnpm install --frozen-lockfile --silent
# The browser fetch's Chromium, in step with the Playwright the lockfile pins; a no-op once it is there.
# A failed download does not stop the run: the browser sources count an outage, the rest are read.
pnpm exec playwright install --only-shell chromium 9>&- || echo "could not install Chromium; sources with fetch: browser will fail this run"

# The run gets none of the lock, so nothing it leaves behind (a headless Chromium orphaned by the
# timeout's kill) can hold it into next week, and a session of its own, so whatever stays in that
# session is killed when it ends. Playwright starts Chromium in a session of its own and closes it
# on the SIGTERM the timeout sends first; only the KILL two minutes later can orphan it.
setsid timeout -k 2m 90m pnpm research "$@" 9>&- &
run_pid=$!
run_status=0
wait "$run_pid" || run_status=$?
pkill -KILL -s "$run_pid" 2>/dev/null || true
if ((run_status != 0)); then
  if ((run_status == 124 || run_status == 137)); then fail "pnpm research ran past 90 minutes and was stopped"; fi
  fail "pnpm research exited $run_status"
fi

git add data/events.json data/runs
# Expired records a run moves out of events.json go to data/archive (#82), which exists once one has.
if [[ -d data/archive ]]; then git add data/archive; fi
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
message="Weekly research run $run_date"
git commit --quiet -m "$message"

# Someone may have pushed while the run was going. The run touches only its own files (the dataset,
# its report's two, and any archive file it added to), so they go on top of whatever main has now; if
# a rebase cannot do that (a manual run's events.json landed in between), main's data/ is taken and
# this run's files are written over it.
git fetch --quiet origin main
if ! git rebase --quiet origin/main; then
  echo "rebase onto origin/main conflicted; re-applying this run's files on top of it"
  git rebase --abort
  run_files=(data/events.json "data/runs/$run_date.json" "data/runs/$run_date.md")
  mapfile -t archive_files < <(git diff --name-only HEAD~1 HEAD -- data/archive)
  run_files+=("${archive_files[@]}")
  saved=$(mktemp -d)
  for f in "${run_files[@]}"; do
    mkdir -p "$saved/$(dirname "$f")"
    git show "HEAD:$f" >"$saved/$f"
  done
  git reset --quiet --hard origin/main
  cp -R "$saved/data" .
  rm -rf "$saved"
  git add "${run_files[@]}"
  git commit --quiet -m "$message"
fi
if ! git merge-base --is-ancestor origin/main HEAD; then
  echo "HEAD does not sit on origin/main after the rebase; not pushing" >&2
  false
fi
git push --quiet origin HEAD:main
# The run is delivered; nothing after this can make it a failure.
trap - ERR TERM HUP INT

# shellcheck disable=SC2016 # the ${} are JavaScript's
summary=$(node -e '
  const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const c = r.counts;
  const expired = Object.values(c.expired).reduce((a, b) => a + b, 0);
  console.log(`${c.found} found, ${c.new} new, ${c.updated} updated, ${c.reverified} re-verified, ${expired} expired; ` +
    `spend $${r.spend.totalUsd.toFixed(2)} of $${r.spend.capUsd}${r.spend.capHit ? " (cap hit)" : ""}`);
' "data/runs/$run_date.json") || summary="(could not read the run report)"
echo "weekly run $run_date committed and pushed $(date --iso-8601=seconds): $summary"
report "$(redact "$(printf '%s: ok, %s (%s)' "$run_date" "$summary" "$(git rev-parse --short HEAD)")")"
