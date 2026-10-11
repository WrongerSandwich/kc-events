import type { APIRoute } from "astro";
import { origin } from "../build/origin";
import { events } from "../generated/events";
import { meta } from "../generated/meta";
import { sitemapXml } from "../lib/sitemap";

export const GET: APIRoute = () =>
  new Response(sitemapXml(events, { origin, lastSuccessfulRun: meta.lastSuccessfulRun }), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
