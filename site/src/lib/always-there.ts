import { hostOf, isDated, venueLine } from "./events";
import { fold } from "./fold";
import type { PublishedEvent } from "./types";

/** A pick names its event by host and title words, and by venue too when the title alone would match another's night. */
export type Pick = { title: string; host: string; venue?: string };

/** Whether `text` holds `words` as whole words, once both are folded. */
function holdsWords(text: string, words: string): boolean {
  return ` ${fold(text)} `.includes(` ${fold(words)} `);
}

/** The events the picks name, in pick order, each at most once; a pick that matches nothing is skipped. */
export function pickAlwaysThere(events: readonly PublishedEvent[], picks: readonly Pick[]): PublishedEvent[] {
  const recurring = events.filter((e) => !isDated(e));
  const out: PublishedEvent[] = [];
  for (const pick of picks) {
    const hit = recurring.find(
      (e) =>
        hostOf(e.primaryUrl) === pick.host &&
        holdsWords(e.title, pick.title) &&
        (pick.venue === undefined || fold(e.venue) === fold(pick.venue)) &&
        !out.includes(e),
    );
    if (hit !== undefined) out.push(hit);
  }
  return out;
}

/**
 * One line per pick that finds no event in this week's published events, for the weekly run's report (#191: these were
 * a committed-data test, which turned main red after the data had deployed). A pick whose host publishes nothing is a
 * source that is down, which the run report's Failing sources already says; one whose host publishes events but none
 * it matches is a retitle, which only an edit to the list fixes. Neither stops a run.
 */
export function alwaysThereWarnings(events: readonly PublishedEvent[], picks: readonly Pick[]): string[] {
  const hosts = new Set(events.map((e) => hostOf(e.primaryUrl)));
  const warnings: string[] = [];
  let found = 0;
  picks.forEach((pick, i) => {
    const now = pickAlwaysThere(events, picks.slice(0, i + 1)).length;
    if (now > found) {
      found = now;
      return;
    }
    const named = `"${pick.title}" (${pick.host}${pick.venue === undefined ? "" : `, at ${pick.venue}`})`;
    warnings.push(
      hosts.has(pick.host)
        ? `Always there: ${named} matches no published recurring event, though its source publishes some: retitled? Edit site/src/always-there.ts.`
        : `Always there: ${named} is left off the front page: its source publishes no event this week (down? see Failing sources).`,
    );
  });
  return warnings;
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
