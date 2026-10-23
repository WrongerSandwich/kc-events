/**
 * The header's two live parts, the Saved link's count and the staleness banner, as plain script rather than Svelte
 * islands, so a page with no island of its own loads no Svelte runtime (#195; audit 2026-10-21, A18). The server
 * renders each as the build's day has it; these bring them to the visitor's, and again whenever the tab comes back
 * into view, so a page left open overnight catches up. No timer.
 */
import { meta } from "../generated/meta";
import { siteConfig } from "../site.config";
import { addDays, localDate, nowIn } from "../lib/dates";
import { type Saves, upcomingCount } from "../lib/saves";

/** The first day the list counts as out of date: staleAfterDays after the last successful run. */
export function staleFrom(): string {
  return addDays(localDate(meta.lastSuccessfulRun), siteConfig.staleAfterDays + 1);
}

function visitorToday(): string {
  return localDate(nowIn(meta.timeZone, new Date()));
}

/** Calls fn now and whenever the tab comes back into view; returns a stop. */
function onEachLook(fn: () => void): () => void {
  fn();
  document.addEventListener("visibilitychange", fn);
  return () => document.removeEventListener("visibilitychange", fn);
}

/**
 * Shows the banner from the day the list goes stale, by the visitor's clock. The server renders it hidden unless the
 * build's own day is already stale.
 */
export function showWhenStale(banner: HTMLElement): () => void {
  return onEachLook(() => {
    banner.hidden = visitorToday() < staleFrom();
  });
}

/**
 * Keeps the Saved link's count of saves still to come, after the word: none, and it is the plain link the server
 * rendered. The badge is inline-block, which browsers pad with a space when they compute the name, so the name is set.
 */
export function showSavedCount(link: HTMLAnchorElement, saves: Saves): () => void {
  let saved: Parameters<typeof upcomingCount>[0] | undefined;
  const render = () => {
    if (saved === undefined) return;
    const count = upcomingCount(saved, visitorToday());
    link.querySelector(".count")?.remove();
    if (count === 0) {
      link.removeAttribute("aria-label");
      return;
    }
    const badge = link.appendChild(document.createElement("span"));
    badge.className = "count";
    badge.textContent = ` ${count}`;
    link.setAttribute("aria-label", `Saved, ${count}`);
  };
  const unsubscribe = saves.subscribe((s) => {
    saved = s;
    render();
  });
  const stopLooking = onEachLook(render);
  return () => {
    unsubscribe();
    stopLooking();
  };
}
