/**
 * Event identity (ADR 0007): an event is its primary page plus its normalized title. Ids are
 * opaque and fixed at first-seen; matching never looks at them. Fuzzy matching on title, venue,
 * and a nearby date arrives with #5.
 */

/** Case, punctuation, and whitespace do not make a different event. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export interface EventIdentity {
  primaryUrl: string;
  title: string;
}

export function sameEvent(a: EventIdentity, b: EventIdentity): boolean {
  return a.primaryUrl === b.primaryUrl && normalizeTitle(a.title) === normalizeTitle(b.title);
}
