import { firstDay, isDated, isPast } from "./events";
import { toIcs } from "./ics";
import { kindName, landingRange } from "./landing";
import { slugify } from "./slugs";
import type { PublishedEvent, PublishedVenue } from "./types";
import { locatedForCalendar } from "./venues";

/**
 * The calendar feeds a reader subscribes to (#136): static files every build rewrites, so a calendar app that
 * refreshes one gets the latest run's dates. The events keep their UIDs, so a moved date updates in place and an
 * expired event drops out.
 */
export type Feed = { path: string; calendarName: string; events: PublishedEvent[] };

export const DONT_MISS_FEED = "/calendar/dont-miss.ics";
export const WHOLE_FEED = "/calendar.ics";

/** A kind's feed, by the explorer's slug: "theater/dance" at /calendar/theater-dance.ics. */
export function kindFeedPath(kind: string): string {
  return `/calendar/${slugify(kind)}.ics`;
}

/**
 * The picks from today through the horizon, then every dated event, then each kind's. A kind with nothing listed
 * still has its (empty) feed, so a subscription to it never starts failing.
 */
export function calendarFeeds(events: PublishedEvent[], opts: { kinds: readonly string[]; today: string; horizonWeeks: number; siteName: string }): Feed[] {
  const { to } = landingRange(opts.today, opts.horizonWeeks);
  const dated = events.filter(isDated);
  // A run already open is in from today, as the front page has it.
  const picks = dated.filter((e) => e.dontMiss && !isPast(e, opts.today) && (firstDay(e) ?? opts.today) <= to);
  return [
    { path: DONT_MISS_FEED, calendarName: `${opts.siteName} · Don't miss`, events: picks },
    { path: WHOLE_FEED, calendarName: opts.siteName, events: dated },
    ...opts.kinds.map((kind) => ({ path: kindFeedPath(kind), calendarName: `${opts.siteName} · ${kindName(kind)}`, events: dated.filter((e) => e.kind === kind) })),
  ];
}

/**
 * A feed as a calendar file: named, asking to be refreshed daily (RFC 7986's REFRESH-INTERVAL, and Microsoft's older
 * X-PUBLISHED-TTL, which Outlook reads), each event at its venue's address and linking its page on `origin`, which
 * follows the event from run to run. Here, not in toIcs, so the explorer's export does not carry it.
 */
export function feedIcs(feed: Feed, opts: { siteName: string; stamp: string; origin: string; venues: readonly PublishedVenue[] }): string {
  const events = feed.events.map((e) => ({ ...locatedForCalendar(opts.venues, e), pageUrl: new URL(`/e/${e.id}`, opts.origin).toString() }));
  return toIcs(events, {
    siteName: opts.siteName,
    stamp: opts.stamp,
    calendarName: feed.calendarName,
    properties: ["REFRESH-INTERVAL;VALUE=DURATION:P1D", "X-PUBLISHED-TTL:P1D"],
  });
}

/** The address a calendar app opens to subscribe: the feed's, with the webcal scheme. */
export function webcalUrl(origin: string, path: string): string {
  return new URL(path, origin).toString().replace(/^https?:/, "webcal:");
}
