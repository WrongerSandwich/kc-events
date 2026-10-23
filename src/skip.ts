/**
 * The backstop behind the extraction rules (#81): what the model was told to skip and listed anyway.
 * A promotion (a business's standing night, a watch party) and a non-public event (a graduation, a
 * board meeting, anything online) are skipped by their normalised title or their venue, after
 * extraction and before storage, and counted; and an away game on a team's schedule is counted
 * outside the geography. Each pattern is narrow enough that a ticketed show with a named act does not
 * match: the symphony's "Happy Hour: Beethoven …" series, a band's "One Night Reunion", an "Opening
 * Night Gala with" a soloist, and a drag bingo are shows.
 */
import { normalizeName } from "./identity.js";

export const SKIP_REASONS = ["promotion", "not-public"] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

/**
 * Patterns on the normalised title (lower case, punctuation as spaces), each a whole-word match. A
 * colon is gone by then, so a series titled "Happy Hour: <program>" is told apart on the raw title.
 */
const SKIP_RULES: readonly { reason: SkipReason; pattern: RegExp }[] = [
  ...[
    "trivia",
    "(?<!drag )bingo",
    "karaoke",
    "happy hours?",
    "watch party",
    "watch parties",
    "(?<!board )game day",
    "open mic",
    "brunch club",
    "speed dating",
    "pop up bar",
    "dueling pianos",
  ].map((term) => ({ reason: "promotion" as const, pattern: wholeWords(term) })),
  ...[
    "graduations?",
    // A benefit's gala, not one billed with a named performer or guest.
    "galas?(?!.* with )",
    "annual meetings?",
    "annual dinners?",
    // A class's reunion, not a band's "Reunion Tour".
    "(?:class|alumni|\\d+ years?) reunions?",
    "class of (?:19|20)\\d\\d",
    // A person's memorial, not Memorial Day or the WWI Museum and Memorial.
    "memorial (?:service|for)",
    "celebration of life",
    "board meetings?",
    "professional development",
  ].map((term) => ({ reason: "not-public" as const, pattern: wholeWords(term) })),
];

/** A title naming a series after the hour it plays in: "Happy Hour: Beethoven, Brahms …". */
const HOUR_SERIES = /^\s*happy hours?\s*:/i;

/** A venue that is no place, on the normalised venue: the event happens on a screen ("Online via Zoom"). */
const NO_PLACE = /^(?:online|virtual|zoom|livestream|live stream)(?: |$)/;

function wholeWords(term: string): RegExp {
  return new RegExp(`(?:^| )${term}(?: |$)`);
}

/** Why the job skips a candidate, or undefined when it is an event. */
export function skipReason(candidate: { title: string; venue?: string | null }): SkipReason | undefined {
  if (candidate.venue != null && NO_PLACE.test(normalizeName(candidate.venue))) return "not-public";
  if (HOUR_SERIES.test(candidate.title)) return undefined;
  const name = normalizeName(candidate.title);
  return SKIP_RULES.find(({ pattern }) => pattern.test(name))?.reason;
}

/**
 * Whether a candidate is an away game: on a team's own schedule "<Team> at <place>" is played there,
 * and the page rarely names the other city's venue, so the model cannot place it and would hold it
 * unverified rather than outside the geography. A game the page gives a venue for is placed by it.
 */
export function awayGame(candidate: { title: string; kind: string; venue: string | null }): boolean {
  return candidate.venue === null && normalizeName(candidate.kind) === "sports" && wholeWords("at").test(normalizeName(candidate.title));
}
