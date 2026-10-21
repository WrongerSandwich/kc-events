import { about } from "../generated/about";
import { events } from "../generated/events";
import { meta } from "../generated/meta";
import { venues } from "../generated/venues";
import { calendarFeeds, feedIcs, type Feed } from "../lib/feeds";
import { siteConfig } from "../site.config";
import { origin } from "./origin";

/** The build's calendar feeds (#136), for /calendar.ics and /calendar/<feed>.ics. */
export const feeds: Feed[] = calendarFeeds(events, { kinds: meta.kinds, today: meta.buildToday, horizonWeeks: about.horizonWeeks, siteName: siteConfig.name });

export function feedResponse(feed: Feed): Response {
  const body = feedIcs(feed, { siteName: siteConfig.name, stamp: meta.lastSuccessfulRun, origin, venues });
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8" } });
}
