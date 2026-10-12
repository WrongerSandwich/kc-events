import { hostOf, isDated, venueLine } from "./events";
import { fold } from "./fold";
import type { PublishedEvent } from "./types";

export type Pick = { title: string; host: string };

/** Whether `text` holds `words` as whole words, once both are folded. */
function holdsWords(text: string, words: string): boolean {
  return ` ${fold(text)} `.includes(` ${fold(words)} `);
}

/** The events the picks name, in pick order, each at most once; a pick that matches nothing is skipped. */
export function pickAlwaysThere(events: readonly PublishedEvent[], picks: readonly Pick[]): PublishedEvent[] {
  const recurring = events.filter((e) => !isDated(e));
  const out: PublishedEvent[] = [];
  for (const pick of picks) {
    const hit = recurring.find((e) => hostOf(e.primaryUrl) === pick.host && holdsWords(e.title, pick.title) && !out.includes(e));
    if (hit !== undefined) out.push(hit);
  }
  return out;
}

/**
 * A row's line under its title: the schedule, then the venue. A schedule that adds nothing to the title, being equal to
 * it or held in it as whole words once folded ("First Friday" for "First Friday"), is left out, as is a missing one.
 */
export function alwaysThereDetail(e: PublishedEvent): string {
  const schedule = e.schedule ?? "";
  // An empty schedule needs its own test: holdsWords would look for a double space and say no.
  const addsNothing = fold(schedule) === "" || holdsWords(e.title, schedule);
  return addsNothing ? venueLine(e) : `${schedule} · ${venueLine(e)}`;
}
