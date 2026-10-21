import type { APIRoute } from "astro";
import { feedResponse, feeds } from "../build/feeds";

export const GET: APIRoute = () => feedResponse(feeds.allEvents);
