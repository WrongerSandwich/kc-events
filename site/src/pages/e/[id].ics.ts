import type { APIRoute } from "astro";
import { events } from "../../generated/events";
import { meta } from "../../generated/meta";
import { venues } from "../../generated/venues";
import { isDated } from "../../lib/events";
import { toIcs } from "../../lib/ics";
import type { PublishedEvent } from "../../lib/types";
import { addressLine, venueSlug } from "../../lib/venues";
import { siteConfig } from "../../site.config";

export function getStaticPaths() {
  return events.filter(isDated).map((event) => ({ params: { id: event.id }, props: { event } }));
}

export const GET: APIRoute = ({ props }) => {
  const event = props.event as PublishedEvent;
  // The venue table's street address and position (#137), when the venue has a row.
  const venue = venues.find((v) => v.slug === venueSlug(event.venue));
  const located = { ...event, ...(venue?.address && { address: addressLine(venue.address) }), ...(venue?.geo && { geo: venue.geo }) };
  const body = toIcs([located], { siteName: siteConfig.name, stamp: meta.lastSuccessfulRun });
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8" } });
};
