#!/usr/bin/env bash
# Vercel's ignored build step (ignoreCommand in vercel.json, which caps the command's length), run inside site/:
# exit 0 skips the build, exit 1 builds. It builds when there is no previous deployment to compare against, on a
# redeploy of the same commit (a new environment variable reaches a deployment only through a build), on a
# production deployment when the live site was last built on another Kansas City day, and when the site, the
# dataset, the venue table, or the job's code it imports changed since the last deployment.
#
# The day rule is for the daily rebuild (scripts/daily-deploy.sh, a deploy hook with no new commit): Vercel's
# previous SHA is the last successful deployment's, so after a docs-only commit the diff below would skip every
# daily build until the next change to the site. The build day comes from the dataset the live site publishes.
prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
[ -n "$prev" ] || exit 1
[ "$prev" != "${VERCEL_GIT_COMMIT_SHA:-}" ] || exit 1
if [ "${VERCEL_ENV:-}" = production ]; then
  # Unreadable, or built on another day (the job's time zone, as research.config.yaml has it): build.
  built=$(curl -fsS -m 10 -L "https://${VERCEL_PROJECT_PRODUCTION_URL:-www.kcthisweek.com}/events.json" 2>/dev/null | grep -o '"generatedAt":"[^"]*"' | head -n1 | cut -d'"' -f4) || true
  [ -n "$built" ] || exit 1
  [ "$(TZ=America/Chicago date -d "$built" +%F 2>/dev/null)" = "$(TZ=America/Chicago date +%F)" ] || exit 1
fi
git diff --quiet "$prev" HEAD -- . ../data/events.json ../data/venues.yaml ../src ../research.config.yaml ../pnpm-lock.yaml ../pnpm-workspace.yaml || exit 1
exit 0
