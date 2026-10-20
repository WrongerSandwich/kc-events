import { landingPaths } from "./landing";
import type { PublishedEvent, PublishedVenue } from "./types";

/**
 * The sitemap: the site's pages (the venue directory among them), every kind and region page (#138), and every venue
 * page (#137), last modified at the run that rebuilt them, and every event page, last modified when its date and venue
 * were last verified. Both are ISO instants with an offset, which the W3C datetime format accepts.
 */
export function sitemapXml(events: PublishedEvent[], venues: PublishedVenue[], opts: { origin: string; lastSuccessfulRun: string; kinds: readonly string[]; regions: readonly string[] }): string {
  const entries = [
    ...["/", "/explore", "/changes", "/venues", "/about"].map((p) => ({ path: p, lastmod: opts.lastSuccessfulRun })),
    ...landingPaths(opts.kinds, opts.regions).map((p) => ({ path: p, lastmod: opts.lastSuccessfulRun })),
    ...venues.map((v) => ({ path: `/v/${v.slug}`, lastmod: opts.lastSuccessfulRun })),
    ...events.map((e) => ({ path: `/e/${e.id}`, lastmod: e.lastVerified })),
  ];
  const urls = entries.map((u) => `  <url><loc>${new URL(u.path, opts.origin).href}</loc><lastmod>${u.lastmod}</lastmod></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
