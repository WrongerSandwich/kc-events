/**
 * The backstop behind the extraction rules (#81): what the model was told to skip and listed anyway.
 * A promotion (a business's standing night, a watch party) and a non-public event (a graduation, a
 * board meeting) are skipped by their normalised title, after extraction and before storage, and
 * counted. Each pattern is narrow enough that a ticketed show with a named act does not match: the
 * symphony's "Happy Hour: Beethoven …" series and a band's "One Night Reunion" are shows.
 */
import { normalizeName } from "./identity.js";

export type SkipReason = "promotion" | "not-public";

/** Patterns on the normalised title (lower case, punctuation as spaces), each a whole-word match. */
const SKIP_RULES: readonly { reason: SkipReason; pattern: RegExp }[] = [
  ...[
    "trivia",
    "bingo",
    "karaoke",
    // At the end only: a bar's "Friday Happy Hour", not a concert series named for the hour.
    "happy hours?$",
    "watch party",
    "watch parties",
    "game day",
    "open mic",
    "brunch club",
    "speed dating",
    "pop up bar",
    "dueling pianos",
  ].map((term) => ({ reason: "promotion" as const, pattern: wholeWords(term) })),
  ...[
    "graduations?",
    "galas?",
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

/** A venue that is no place: the event happens on a screen. */
const NO_PLACE = new Set(["online", "virtual", "online event", "virtual event", "zoom"]);

function wholeWords(term: string): RegExp {
  return new RegExp(`(?:^| )${term}(?: |$)`);
}

/**
 * Whether a game is an away game: on a team's own schedule "<Team> at <place>" is played there, and
 * "vs" (or "@" before the home side) here. The page rarely names the other city's venue, so the
 * model cannot place it and would hold it unverified rather than outside the geography.
 */
export function awayGame(candidate: { title: string; kind: string }): boolean {
  return normalizeName(candidate.kind) === "sports" && wholeWords("at").test(normalizeName(candidate.title));
}

/** Why the job skips a candidate, or undefined when it is an event. */
export function skipReason(candidate: { title: string; venue?: string | null }): SkipReason | undefined {
  if (candidate.venue != null && NO_PLACE.has(normalizeName(candidate.venue))) return "not-public";
  const name = normalizeName(candidate.title);
  return SKIP_RULES.find(({ pattern }) => pattern.test(name))?.reason;
}
