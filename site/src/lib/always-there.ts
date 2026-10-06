import { hostOf, isDated } from "./events";
import type { PublishedEvent } from "./types";

export type Pick = { title: string; host: string };

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

/** The events the picks name, in pick order, each at most once; a pick that matches nothing is skipped. */
export function pickAlwaysThere(events: readonly PublishedEvent[], picks: readonly Pick[]): PublishedEvent[] {
  const recurring = events.filter((e) => !isDated(e));
  const out: PublishedEvent[] = [];
  for (const pick of picks) {
    const title = fold(pick.title);
    const hit = recurring.find((e) => hostOf(e.primaryUrl) === pick.host && ` ${fold(e.title)} `.includes(` ${title} `) && !out.includes(e));
    if (hit !== undefined) out.push(hit);
  }
  return out;
}
