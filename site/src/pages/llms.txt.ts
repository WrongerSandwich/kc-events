import type { APIRoute } from "astro";
import { origin } from "../build/origin";
import { about } from "../generated/about";
import { events } from "../generated/events";
import { meta } from "../generated/meta";
import { venues } from "../generated/venues";
import { llmsTxt } from "../lib/llms";
import { PUBLISHED_SCHEMA_VERSION } from "../lib/schema-version";
import { siteConfig } from "../site.config";

export const GET: APIRoute = () =>
  new Response(
    llmsTxt({
      origin,
      siteName: siteConfig.name,
      tagline: siteConfig.tagline,
      repoUrl: siteConfig.repoUrl,
      lastSuccessfulRun: meta.lastSuccessfulRun,
      today: meta.buildToday,
      horizonWeeks: about.horizonWeeks,
      kinds: meta.kinds,
      regions: meta.regions,
      neighborhoods: about.neighborhoods,
      venueCount: venues.length,
      schemaVersion: PUBLISHED_SCHEMA_VERSION,
      events,
    }),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
