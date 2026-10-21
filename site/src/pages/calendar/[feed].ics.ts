import type { APIRoute } from "astro";
import { feedResponse, feeds } from "../../build/feeds";
import type { Feed } from "../../lib/feeds";

// The picks' feed and each kind's (#136); the whole calendar is /calendar.ics.
export function getStaticPaths() {
  return feeds.flatMap((feed) => {
    const name = /^\/calendar\/(.+)\.ics$/.exec(feed.path)?.[1];
    return name === undefined ? [] : [{ params: { feed: name }, props: { feed } }];
  });
}

export const GET: APIRoute = ({ props }) => feedResponse(props.feed as Feed);
