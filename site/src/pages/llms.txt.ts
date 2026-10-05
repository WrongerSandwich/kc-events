import type { APIRoute } from "astro";
import { origin } from "../build/origin";
import { events } from "../generated/events";
import { meta } from "../generated/meta";
import { siteConfig } from "../site.config";

export const GET: APIRoute = () =>
  new Response(
    `# ${siteConfig.name}

> ${siteConfig.tagline}

A weekly research job reads Kansas City venue and organizer pages directly and publishes an event only when its date and venue were read from the event's own page (cite-or-drop). Anything it cannot cite is held back. Every event shows when it was last verified. Don't-miss is an editorial call, made under written rules, that a one-off or limited run is worth going out of the way for; recurring events are never flagged.

Last run: ${meta.lastSuccessfulRun}. ${events.length} active events.

## Pages

- ${origin}/ : the don't-miss list by horizon, then recurring events
- ${origin}/explore : every active event, filterable by date, kind, region, don't-miss, and search (filters are in the query string)
- ${origin}/e/<id> : one event; add .ics for a calendar file
- ${origin}/about : how the site is made and where to report a wrong listing

## Data

- ${origin}/events.json : the full dataset, JSON, free to reuse with a link back
- ${origin}/sitemap.xml : every page
- ${siteConfig.repoUrl} : the code and the research rules
`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
