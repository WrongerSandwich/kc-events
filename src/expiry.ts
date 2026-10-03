/**
 * Expiry: how an event stops being publishable. It stays in the dataset as expired, with the
 * reason: past (its last date is behind us), two-strike (re-verification failed on two
 * consecutive runs), or cancelled (its page says so). A postponement is a date change, not this.
 */
import type { Event, ExpiryReason } from "./dataset.js";

/** Consecutive failed re-verifications after which an event expires. */
const STRIKES_TO_EXPIRE = 2;

export function expire(event: Event, reason: ExpiryReason): Event {
  return { ...event, status: "expired", expiryReason: reason };
}

/**
 * Expires an event whose last date (its end, else its start) is before today's local date.
 * An undated event cannot be past, and an event already expired keeps its reason.
 */
export function expirePast(event: Event, today: string): Event {
  const lastDate = (event.end ?? event.start)?.slice(0, 10);
  if (event.status === "expired" || lastDate === undefined || lastDate >= today) return event;
  return expire(event, "past");
}

/** Records one failed re-verification; the second consecutive one expires the event. */
export function strike(event: Event): Event {
  const struck = { ...event, verificationFailures: event.verificationFailures + 1 };
  return struck.verificationFailures >= STRIKES_TO_EXPIRE ? expire(struck, "two-strike") : struck;
}
