import type { APIRoute } from "astro";
import { calendarResponse } from "../../build/feeds";
import { events } from "../../generated/events";
import { meta } from "../../generated/meta";
import { venues } from "../../generated/venues";
import { isDated } from "../../lib/events";
import { locatedForCalendar, toIcs } from "../../lib/ics";
import type { PublishedEvent } from "../../lib/types";
import { siteConfig } from "../../site.config";

export function getStaticPaths() {
  return events.filter(isDated).map((event) => ({ params: { id: event.id }, props: { event } }));
}

// The venue table's street address and position (#137), when the venue has a row.
export const GET: APIRoute = ({ props }) =>
  calendarResponse(toIcs([locatedForCalendar(venues, props.event as PublishedEvent)], { siteName: siteConfig.name, stamp: meta.lastSuccessfulRun }));
