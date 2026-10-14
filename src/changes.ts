import type { Event } from "./dataset.js";
import { calendarDate, sameMoment } from "./identity.js";
import { GONE_REASONS, type ChangeRef, type RunChanges } from "./report.js";

/**
 * What changed on the site this run (#135), from the events the run started with to the ones it ends with: new picks
 * (active and flagged, and not flagged before), moves (active before and now, the start on another day or at another
 * time, by the test curation re-judges on, from a start not yet passed on the run's day: one that had passed giving way
 * to a later one is a series' next date being read), and the events that were active and expired for one of
 * GONE_REASONS. `comparedWith` is the run the starting dataset came from.
 */
export function runChanges(previous: Event[], events: Event[], comparedWith: string | null, today: string): RunChanges {
  const before = new Map(previous.map((e) => [e.id, e]));
  const changes: RunChanges = { comparedWith, newPicks: [], moved: [], gone: [] };
  for (const event of events) {
    const was = before.get(event.id);
    if (event.status === "active" && event.dontMiss && !was?.dontMiss) changes.newPicks.push(changeRef(event));
    if (was?.status !== "active") continue;
    if (event.status === "active" && was.start !== undefined && event.start !== undefined && calendarDate(was.start)! >= today && !sameMoment(was.start, event.start)) {
      changes.moved.push({ ...changeRef(event), from: was.start });
    }
    const reason = GONE_REASONS.find((r) => r === event.expiryReason);
    if (event.status === "expired" && reason !== undefined) changes.gone.push({ ...changeRef(event), reason });
  }
  return changes;
}

function changeRef(event: Event): ChangeRef {
  return { id: event.id, title: event.title, primaryUrl: event.primaryUrl };
}
