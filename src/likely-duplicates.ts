/**
 * Likely duplicates (#228): two records no identity rule joins that a person should look at, as a
 * check after the duplicate fold. Nothing here merges, expires or changes a record, and no model is
 * asked: the pairs go to the run report for a person (or the weekly audit) to judge.
 */

import { comparable } from "./extraction.js";
import { samePage } from "./hosts.js";
import { calendarDate, sameMoment, sameVenue, type EventIdentity, type VenueAliases } from "./identity.js";
import { hasTime } from "./time.js";

/**
 * Two records are likely one event when they share a primary page or a venue (aliases applied) and
 * either start on the same calendar day (or are both recurring) under titles one of which contains
 * the other as whole words, the titles not equal ("Artist Market @ Rooms We Carry Opening Reception" and "Rooms We
 * Carry Opening Reception"), or have equal titles and one's span, start through end, covers the
 * other's first day (a run on the venue's events page and a month of it on the homepage; a one-off
 * night inside a run of the same name). Titles are compared as quotes are (`comparable`); an empty
 * one never counts. Two shows of one night under different names are not a pair, nor two nights of
 * one play stored one by one.
 *
 * They are a pair too when both start at one moment, day and clock time, under titles sharing a
 * phrase of two or more whole words not all filler (#260): "Jennifer Lynn Barnes, Dangerous Impulses"
 * and "Meet the Author: Jennifer Lynn Barnes and Sarah Henning". Reported only, never folded: a
 * double feature's two films ("Double Feature: Alien", "Double Feature: Aliens") are two events.
 */
export function likelyDuplicate(a: EventIdentity, b: EventIdentity, aliases: VenueAliases): boolean {
  const [x, y] = [comparable(a.title), comparable(b.title)];
  if (x === "" || y === "") return false;
  const shared = samePage(a.primaryUrl, b.primaryUrl) || (a.venue !== undefined && b.venue !== undefined && sameVenue(a.venue, b.venue, aliases));
  if (!shared) return false;
  if (x === y) return covers(a, b) || covers(b, a);
  if (sameDay(a, b) && (containsWords(x, y) || containsWords(y, x))) return true;
  return sameTimedStart(a, b) && sharePhrase(x, y);
}

/**
 * Words that make no phrase on their own: "A Night at the Opera" and "A Night at the Museum" share
 * nothing. "night" counts as filler because so many titles name one ("Comedy Night", "A Night of Jazz").
 */
const FILLER = new Set(["a", "an", "the", "of", "and", "&", "at", "in", "on", "with", "for", "to", "from", "by", "or", "night"]);

/** Whether two titles have two consecutive words in common, one of them not filler. */
function sharePhrase(x: string, y: string): boolean {
  const pairs = new Set(wordPairs(x));
  return wordPairs(y).some((pair) => pairs.has(pair) && pair.split(" ").some((word) => !FILLER.has(word)));
}

/**
 * A title's consecutive words two by two, split at anything not a letter, digit, ampersand or
 * apostrophe, a word's apostrophe at either end dropped ("Beggars' Bazaar" is "beggars bazaar").
 */
function wordPairs(title: string): string[] {
  const words = title
    .split(/[^\p{L}\p{N}&']+/u)
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter((word) => word !== "");
  return words.slice(1).map((word, i) => `${words[i]} ${word}`);
}

/** Both dated with a time, on the same day at the same minute; a recurring record never is. */
function sameTimedStart(a: EventIdentity, b: EventIdentity): boolean {
  return a.recurrence !== "recurring" && b.recurrence !== "recurring" && hasTime(a.start) && hasTime(b.start) && sameMoment(a.start, b.start);
}

/** Whether a title holds another as whole words: "endrid, poets mortis" holds "endrid", "smart party" does not hold "art". */
function containsWords(title: string, part: string): boolean {
  const at = (i: number) => i < 0 || i >= title.length || !/[\p{L}\p{N}]/u.test(title[i]!);
  for (let i = title.indexOf(part); i !== -1; i = title.indexOf(part, i + 1)) if (at(i - 1) && at(i + part.length)) return true;
  return false;
}

/** Every likely pair among the records, each once, in the order the records come. */
export function likelyDuplicatePairs<T extends EventIdentity>(events: readonly T[], aliases: VenueAliases): [T, T][] {
  return events.flatMap((a, i) => events.slice(i + 1).filter((b) => likelyDuplicate(a, b, aliases)).map((b): [T, T] => [a, b]));
}

/** Both recurring, or both dated and starting on one calendar day. */
function sameDay(a: EventIdentity, b: EventIdentity): boolean {
  if (a.recurrence === "recurring" || b.recurrence === "recurring") return a.recurrence === b.recurrence;
  const day = calendarDate(a.start);
  return day !== undefined && day === calendarDate(b.start);
}

/** Whether one record's first day through its last takes in the other's first day. */
function covers(span: EventIdentity, other: EventIdentity): boolean {
  const [first, last, day] = [calendarDate(span.start), calendarDate(span.end ?? span.start), calendarDate(other.start)];
  return first !== undefined && last !== undefined && day !== undefined && first <= day && day <= last;
}
