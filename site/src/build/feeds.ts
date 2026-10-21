import { about } from "../generated/about";
import { events } from "../generated/events";
import { meta } from "../generated/meta";
import { venues } from "../generated/venues";
import { calendarFeeds, feedIcs, type CalendarFeed } from "../lib/feeds";
import { siteConfig } from "../site.config";
import { origin } from "./origin";

/** The build's calendar feeds (#136): /calendar.ics, and /calendar/<slug>.ics by slug. */
export const feeds = calendarFeeds(events, { kinds: meta.kinds, today: meta.buildToday, horizonWeeks: about.horizonWeeks, siteName: siteConfig.name });

/** A calendar file as an endpoint serves it: an event's, or a feed's. */
export function calendarResponse(body: string): Response {
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8" } });
}

export function feedResponse(feed: CalendarFeed): Response {
  return calendarResponse(feedIcs(feed, { siteName: siteConfig.name, stamp: meta.lastSuccessfulRun, origin, venues }));
}
