/**
 * Expiry: how an event stops being publishable. It stays in the dataset as expired, with the
 * reason: past (its last date is behind us), two-strike (two consecutive strikes), cancelled
 * (its page says so), index-page (its primary page is an index page, which is never read), or
 * duplicate (another record is the same event and was seen first; see foldDuplicates in run). A
 * postponement is a date change, not this. An outage never expires an event; enough of them in a
 * row make it unverified.
 */
import type { RunConfig } from "./config.js";
import type { Event, ExpiryReason } from "./dataset.js";
import { isIndexPage } from "./discovery.js";

/** Consecutive strikes after which an event expires. */
const STRIKES_TO_EXPIRE = 2;

/** Consecutive outages after which an active event becomes unverified (ADR 0008). */
const OUTAGES_TO_UNVERIFY = 3;

export function expire(event: Event, reason: ExpiryReason): Event {
  return { ...event, status: "expired", expiryReason: reason };
}

/** Whether an event's last date (its end, else its start) is before today's local date. An undated event cannot be past. */
export function isPast(event: Event, today: string): boolean {
  const lastDate = (event.end ?? event.start)?.slice(0, 10);
  return lastDate !== undefined && lastDate < today;
}

/** Expires a past event; an event already expired keeps its reason. */
export function expirePast(event: Event, today: string): Event {
  return event.status !== "expired" && isPast(event, today) ? expire(event, "past") : event;
}

/**
 * Expires an event citing an index page as its primary page: the page is never read, so it can
 * never verify the event. That covers events read before the page counted as one, such as when a
 * host is added to the aggregator list. An event already expired keeps its reason.
 */
export function expireIndexCited(event: Event, config: RunConfig): Event {
  return event.status !== "expired" && isIndexPage(event.primaryUrl, config) ? expire(event, "index-page") : event;
}

/**
 * Records one strike: the primary page loaded and no longer lists the event, is gone, or may no
 * longer be read. The page loaded, so the run of outages ends. The second consecutive strike
 * expires the event; outages between two strikes do not break the run.
 */
export function strike(event: Event): Event {
  const struck = { ...event, verificationFailures: event.verificationFailures + 1, consecutiveOutages: 0 };
  return struck.verificationFailures >= STRIKES_TO_EXPIRE ? expire(struck, "two-strike") : struck;
}

/**
 * Records one outage: the primary page could not be loaded, which says nothing about the event, so
 * its strikes are left as they are. An active event is held as it was until its third consecutive
 * outage, which makes it unverified with its reading and curation kept.
 */
export function outage(event: Event): Event {
  const out = { ...event, consecutiveOutages: event.consecutiveOutages + 1 };
  return out.status === "active" && out.consecutiveOutages >= OUTAGES_TO_UNVERIFY ? { ...out, status: "unverified" } : out;
}

/**
 * Whether an event was verified once and has been hidden since: the outage limit (ADR 0008) or an
 * uncitable re-reading of a page that still lists it made it unverified, not a reading that never
 * met cite-or-drop. Those are the only paths from active to unverified, so it is the unverified
 * event with a last-verified date; a strike since, which zeroes the outage count, does not change it.
 * Re-verification re-checks these each run, so the event can come back.
 */
export function hiddenSinceVerified(event: Event): boolean {
  return event.status === "unverified" && event.lastVerified !== undefined;
}
