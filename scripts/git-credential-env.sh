#!/usr/bin/env bash
#
# The git credential helper of the weekly run's clone (#105): answers github.com with GH_TOKEN from
# the clone's gitignored .env, a fine-grained token for this repository alone (Contents and Issues,
# read and write). scripts/home-run-setup.sh makes it the clone's only helper, so the clone's git
# never falls through to the user's own (gh's, which reaches every repository the user can write to).
#
# git runs it as `git-credential-env.sh get|store|erase` with the request on stdin; only get answers.

set -euo pipefail

[[ "${1:-}" == get ]] || exit 0
request=$(cat)
grep -qx 'host=github.com' <<<"$request" || exit 0
env_file="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env"
token=$(sed -n 's/^GH_TOKEN=//p' "$env_file" 2>/dev/null | tail -n1 | tr -d '\r')
# Node's .env loader, which the run uses, drops one pair of surrounding quotes; so does this.
if [[ "$token" =~ ^\"(.*)\"$ || "$token" =~ ^\'(.*)\'$ ]]; then token="${BASH_REMATCH[1]}"; fi
[[ -n "$token" ]] || exit 0
printf 'username=x-access-token\npassword=%s\n' "$token"
