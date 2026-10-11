import { onMount } from "svelte";
import { meta } from "../generated/meta";
import { localDate, nowIn } from "../lib/dates";

/**
 * The visitor's clock, one for every island on the page: read as each island mounts and again whenever the tab
 * comes back into view, so a page left open overnight catches up. No timer.
 */
let now = $state<string | undefined>(undefined);

function read(): void {
  now = nowIn(meta.timeZone, new Date());
}

let watchers = 0;

function watch(): () => void {
  read();
  if (watchers++ === 0) document.addEventListener("visibilitychange", read);
  return () => {
    if (--watchers === 0) document.removeEventListener("visibilitychange", read);
  };
}

/**
 * The clock as one island sees it; call during the island's setup. Until that island has mounted it is the build's
 * date and no clock, whatever an island hydrated earlier has read: its first render must equal the server's (the
 * hydration rule), and a `client:idle` island hydrates after the `client:load` ones have read the clock.
 */
export function islandClock(): { readonly now: string | undefined; readonly today: string } {
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
    return watch();
  });
  return {
    get now() {
      return mounted ? now : undefined;
    },
    get today() {
      return mounted && now !== undefined ? localDate(now) : meta.buildToday;
    },
  };
}
