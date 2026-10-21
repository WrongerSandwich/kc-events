#!/usr/bin/env bash
# Vercel's ignored build step (ignoreCommand in vercel.json, which caps the command's length), run inside site/:
# exit 0 skips the build, exit 1 builds. It builds when there is no previous deployment to compare against, on a
# redeploy of the same commit (a new environment variable reaches a deployment only through a build), and when
# the site, the dataset, the venue table, or the job's code it imports changed since the last deployment.
prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
[ -n "$prev" ] || exit 1
[ "$prev" != "${VERCEL_GIT_COMMIT_SHA:-}" ] || exit 1
git diff --quiet "$prev" HEAD -- . ../data/events.json ../data/venues.yaml ../src ../research.config.yaml ../pnpm-lock.yaml ../pnpm-workspace.yaml || exit 1
exit 0
