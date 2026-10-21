import type { APIRoute } from "astro";
import { events } from "../../generated/events";
import { meta } from "../../generated/meta";
import { venues } from "../../generated/venues";
import { isDated } from "../../lib/events";
import { toIcs } from "../../lib/ics";
import type { PublishedEvent } from "../../lib/types";
import { locatedForCalendar } from "../../lib/venues";
import { siteConfig } from "../../site.config";

export function getStaticPaths() {
  return events.filter(isDated).map((event) => ({ params: { id: event.id }, props: { event } }));
}

export const GET: APIRoute = ({ props }) => {
  const body = toIcs([locatedForCalendar(venues, props.event as PublishedEvent)], { siteName: siteConfig.name, stamp: meta.lastSuccessfulRun });
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8" } });
};
