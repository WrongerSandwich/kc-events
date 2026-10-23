# shellcheck shell=bash
#
# What scripts/weekly-run.sh asks about the site's deploy (#191), sourced by it and tested in
# test/deploy-checks.test.ts. A failed Vercel build of the weekly commit used to tell no one: the site
# kept last week's deploy, and only the header stamp, then the staleness banner ten days on, said so.

# vercel_state SHA polls the commit's "Vercel" status (gh api, so GH_TOKEN as the caller sets it, and
# the repository from the clone's remote) every VERCEL_POLL_SECONDS (30) for up to VERCEL_WAIT_SECONDS
# (900: Vercel's build takes about three minutes), and prints three lines: the state, a description,
# and the deployment's link (maybe empty). The state is Vercel's own once it leaves pending (success,
# failure, error); "timeout" when it is still pending or missing at the deadline; "unreadable" after
# three failed reads in a row, with gh's last error as the description (a token without Commit
# statuses: Read-only, or the network). It always prints and returns 0; the caller judges.
vercel_state() {
  local sha=$1 deadline=$((SECONDS + ${VERCEL_WAIT_SECONDS:-900})) errors=0 out state seen=
  while :; do
    if out=$(gh api "repos/{owner}/{repo}/commits/$sha/status" \
      --jq '.statuses[] | select(.context == "Vercel") | .state, (.description // ""), (.target_url // "")' 2>&1); then
      errors=0
      state=$(sed -n 1p <<<"$out")
      case $state in
        success | failure | error)
          printf '%s\n%s\n%s\n' "$state" "$(sed -n 2p <<<"$out")" "$(sed -n 3p <<<"$out")"
          return 0
          ;;
        "") seen="no Vercel status on the commit" ;;
        *) seen="$state: $(sed -n 2p <<<"$out")" ;;
      esac
    else
      errors=$((errors + 1))
      if ((errors >= 3)); then
        printf 'unreadable\n%s\n\n' "$(tail -n1 <<<"$out")"
        return 0
      fi
    fi
    if ((SECONDS >= deadline)); then
      printf 'timeout\n%s\n\n' "${seen:-no Vercel status on the commit}"
      return 0
    fi
    sleep "${VERCEL_POLL_SECONDS:-30}"
  done
}

# deploy_failures LOG [DAYS] prints the lines of scripts/daily-deploy.sh's log (one per night, each
# opening on its minute, YYYY-MM-DDTHH:MM) from the last DAYS (7) days that are not a 2xx answer from
# the deploy hook: the nights the site was not rebuilt, which that script tells no one about.
deploy_failures() {
  local log=$1 since
  [[ -f $log ]] || return 0
  since=$(date -d "${2:-7} days ago" +%Y-%m-%dT%H:%M)
  awk -v since="$since" '$1 >= since && $0 !~ / deploy hook answered 2[0-9][0-9]$/' "$log"
}
