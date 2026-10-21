import type { APIRoute } from "astro";
import { feedResponse, feeds } from "../../build/feeds";
import type { CalendarFeed } from "../../lib/feeds";

// The picks' feed and each kind's (#136); every event's is /calendar.ics.
export function getStaticPaths() {
  return feeds.bySlug.map((feed) => ({ params: { feed: feed.slug }, props: { feed } }));
}

export const GET: APIRoute = ({ props }) => feedResponse(props.feed as CalendarFeed);
