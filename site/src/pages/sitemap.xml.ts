import type { APIRoute } from "astro";
import { origin } from "../build/origin";
import { events } from "../generated/events";
import { meta } from "../generated/meta";
import { venues } from "../generated/venues";
import { sitemapXml } from "../lib/sitemap";

export const GET: APIRoute = () =>
  new Response(sitemapXml(events, venues, { origin, lastSuccessfulRun: meta.lastSuccessfulRun }), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
