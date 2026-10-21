import type { APIRoute } from "astro";
import { feedResponse, feeds } from "../build/feeds";
import { WHOLE_FEED } from "../lib/feeds";

export const GET: APIRoute = () => feedResponse(feeds.find((f) => f.path === WHOLE_FEED)!);
