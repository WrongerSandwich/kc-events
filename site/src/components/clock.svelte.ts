import { meta } from "../generated/meta";
import { localDate, nowIn } from "../lib/dates";

/**
 * The visitor's clock, one for every island on the page. Server-rendered with the build's date and no clock; it is read
 * when the first island mounts (the hydration rule) and again whenever the tab comes back into view, so a page left
 * open overnight catches up. No timer.
 */
let now = $state<string | undefined>(undefined);

export const clock = {
  /** The wall clock in the site's zone, "2026-10-09T19:30"; undefined until an island has mounted. */
  get now(): string | undefined {
    return now;
  },
  /** The visitor's date once mounted, the build's before. */
  get today(): string {
    return now === undefined ? meta.buildToday : localDate(now);
  },
};

function read(): void {
  now = nowIn(meta.timeZone, new Date());
}

let watchers = 0;

/**
 * For an island's onMount: reads the clock and keeps it current until the returned function is called. The last
 * island to let go puts the build's date back (islands never unmount on a real page; a test mounts one after another).
 */
export function watchClock(): () => void {
  read();
  if (watchers++ === 0) document.addEventListener("visibilitychange", read);
  return () => {
    if (--watchers > 0) return;
    document.removeEventListener("visibilitychange", read);
    now = undefined;
  };
}
