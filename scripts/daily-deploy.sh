#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# The daily rebuild of the site. The site is built only when a commit lands, so from Tuesday on every
# page was Monday's: the server HTML carried Monday's "today", hydration swapped whole sections in place
# (CLS up to 0.49 by the weekend), and the script-free kind, region and venue pages listed past events
# (the 2026-10-21 audit, E1 and B2). A POST to the project's Vercel Deploy Hook builds main again at
# the real day; scripts/ignore-build.sh builds a same-commit redeploy for that reason.
#
# Runs from the dedicated clone by the home machine's cron at 12:05 a.m. local (scripts/home-run-setup.sh
# installs the line), reading DEPLOY_HOOK_URL from the clone's gitignored .env. Anyone with the hook's URL
# can start a deploy, so it is never printed. One line per day goes to
# $XDG_STATE_HOME/kc-this-week/deploy.log (default ~/.local/state/kc-this-week); a missing hook or an
# answer that is not 2xx exits 1 with a line on stderr and in the log, and nothing else is told at the
# time: the next weekly run deploys regardless, and its health-issue comment lists the week's failed
# nights from this log (#191); the healthchecks.io check (#64) watches that run, not this.
# ──────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
LOG_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/kc-this-week"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/deploy.log"
STAMP=$(date +%Y-%m-%dT%H:%M)

cd "$ROOT"
HOOK=$(sed -n 's/^DEPLOY_HOOK_URL=//p' .env 2>/dev/null | tail -n1 | tr -d '\r' || true)
if [[ "$HOOK" =~ ^\"(.*)\"$ || "$HOOK" =~ ^\'(.*)\'$ ]]; then HOOK="${BASH_REMATCH[1]}"; fi
if [[ -z "$HOOK" ]]; then
  echo "$STAMP no DEPLOY_HOOK_URL in .env; nothing deployed (re-run scripts/home-run-setup.sh)" | tee -a "$LOG" >&2
  exit 1
fi

# Vercel answers 201 with the job it queued; anything else is a failed day. The hook is a bare POST.
STATUS=$(curl -sS -o /dev/null -w '%{http_code}' -X POST --max-time 30 "$HOOK" 2>/dev/null || true)
if [[ "$STATUS" == 2* ]]; then
  echo "$STAMP deploy hook answered $STATUS" >> "$LOG"
else
  echo "$STAMP deploy hook failed: ${STATUS:-no answer}" | tee -a "$LOG" >&2
  exit 1
fi
