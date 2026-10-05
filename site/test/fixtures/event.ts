import type { PublishedEvent } from "../../src/lib/types";

/** A valid one-off; override fields per test. */
export function event(over: Partial<PublishedEvent> = {}): PublishedEvent {
  return {
    id: "evt_000000000001",
    title: "A show",
    start: "2026-10-09T19:00:00-05:00",
    venue: "recordBar",
    neighborhood: "Crossroads",
    region: "Central KC",
    primaryUrl: "https://www.therecordbar.com/shows",
    kind: "music",
    recurrence: "one-off",
    dontMiss: false,
    lastVerified: "2026-10-03T21:47:36-05:00",
    ...over,
  };
}
