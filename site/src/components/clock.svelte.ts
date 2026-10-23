import { onMount } from "svelte";
import { meta } from "../generated/meta";
import { localDate } from "../lib/dates";
import { visitorNow } from "./header";

/**
 * The visitor's clock, one for every island on the page: read as each island mounts and again whenever the tab
 * comes back into view, so a page left open overnight catches up. No timer.
 */
let now = $state<string | undefined>(undefined);

function read(): void {
  now = visitorNow();
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
 * hydration rule), and an island that hydrates later than another (a `client:idle` or `client:visible` one) would
 * otherwise see the clock already read. The header's Saved link and staleness banner are plain script, not islands, and
 * read the same clock in header.ts (beside this file: src/lib may not read the clock).
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
