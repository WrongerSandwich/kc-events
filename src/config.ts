import { z } from "zod";
import { normalizeName, venueAndRoom } from "./identity.js";

const DEFAULT_MODELS = { extraction: "openai/gpt-6-luna", curation: "anthropic/claude-sonnet-5.5" };

/** The catch-all for an address that maps to nothing on the neighborhood list; it is in no region. */
export const ELSEWHERE_IN_THE_METRO = "Elsewhere in the metro";

/** Anywhere in Lawrence, Kansas (the extraction rules say so); some region must list it. */
const LAWRENCE = "Lawrence";

const DEFAULT_NEIGHBORHOODS: Record<string, string[]> = { Lawrence: [LAWRENCE] };

export const DEFAULT_KINDS = [
  "music",
  "theater/dance",
  "comedy",
  "art/exhibitions",
  "festivals/markets",
  "food/drink",
  "sports",
  "film",
  "talks/readings",
  "outdoors/community",
  "other",
] as const;

/**
 * Third-party listing sites: read only as an index of leads, never extracted from (ADR 0001).
 * A host matches itself and its subdomains.
 */
export const DEFAULT_AGGREGATOR_HOSTS = [
  "do816.com",
  "visitkc.com",
  "thepitchkc.com",
  "kansascity.com",
  "kcparent.com",
  "allevents.in",
  "songkick.com",
  "bandsintown.com",
  "patch.com",
  "feverup.com",
] as const;

/** Hosts never followed as leads: social media and the like, which need a login or carry no primary page. */
export const DEFAULT_IGNORED_HOSTS = [
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "youtube.com",
  "linkedin.com",
  "pinterest.com",
  "reddit.com",
  "google.com",
  "apple.com",
] as const;

/**
 * Ticketing and event platforms many organizers sell through: their event pages are primary pages,
 * but the host is no one source, so it is never suggested for promotion.
 */
export const DEFAULT_PLATFORM_HOSTS = [
  "eventbrite.com",
  "ticketmaster.com",
  "livenation.com",
  "axs.com",
  "dice.fm",
  "etix.com",
  "seetickets.us",
  "tixr.com",
  "universe.com",
  "simpletix.com",
  "ovationtix.com",
] as const;

/**
 * A ticketing platform's listing pages (search, browse, category): index pages like an aggregator's,
 * while the platform's event pages stay primary pages. Host to path prefixes; a host matches itself
 * and its subdomains, and a prefix matches the URL path at a segment boundary.
 */
export const DEFAULT_PLATFORM_INDEX_PATHS: Record<string, string[]> = {
  "ticketmaster.com": ["/discover/", "/search"],
  "eventbrite.com": ["/d/", "/b/"],
};

const discoverySchema = z.strictObject({
  enabled: z.boolean().default(false),
  /** The geography in the few words a search engine wants; queries are built from it. */
  place: z.string().min(1).default("Kansas City"),
  resultsPerQuery: z.number().int().positive().default(5),
  linksPerAggregatorPage: z.number().int().positive().default(10),
  aggregatorHosts: z.array(z.string().min(1)).default([...DEFAULT_AGGREGATOR_HOSTS]),
  ignoredHosts: z.array(z.string().min(1)).default([...DEFAULT_IGNORED_HOSTS]),
  platformHosts: z.array(z.string().min(1)).default([...DEFAULT_PLATFORM_HOSTS]),
  platformIndexPaths: z
    .record(z.string().min(1), z.array(z.string().startsWith("/")).min(1))
    .default(() => structuredClone(DEFAULT_PLATFORM_INDEX_PATHS)),
  /**
   * Ticketing platforms whose pages are rendered by script (#143), each with a CSS selector for one rendered listing:
   * a page of performances on one, followed from an event's own page, is fetched through the browser, waiting for it.
   */
  platformWaitFor: z.record(z.string().min(1), z.string().min(1)).default({}),
});

/**
 * The run config: a typed object loaded from the committed config file.
 * Strict, so a secret pasted into the file is rejected; secrets come from env only.
 */
export const configSchema = z.strictObject({
  horizonWeeks: z.number().int().positive().default(8),
  timezone: z.string().default("America/Chicago"),
  geography: z
    .string()
    .min(1)
    .default("Kansas City metro on both sides of the state line, plus Lawrence"),
  spendCapUsd: z.number().positive().default(5),
  /**
   * How many times each registry page is read with the extraction model (#224): at 2, both reads start
   * together and the first's sightings merge ahead of the second's. Discovery, re-verification and own
   * pages are read once either way.
   */
  extractionReads: z.union([z.literal(1), z.literal(2)]).default(2),
  /**
   * How many pages each stage reads at once (#252): registry pages, discovery leads, re-verified pages
   * and own pages. A registry page's two reads count as one page. Their model calls go out in page
   * order, each checked against the spend cap, so up to about two calls for each page in flight can
   * end past the cap. At 1, one page at a time.
   */
  concurrency: z.number().int().positive().default(4),
  models: z
    .strictObject({
      extraction: z.string().min(1).default(DEFAULT_MODELS.extraction),
      curation: z.string().min(1).default(DEFAULT_MODELS.curation),
    })
    .default(DEFAULT_MODELS),
  kinds: z
    .array(z.string().min(1))
    .min(1)
    .refine((kinds) => kinds.includes("other"), { message: 'kinds must include "other" as the escape hatch' })
    .default([...DEFAULT_KINDS]),
  /** Region to its neighborhoods; the extractor picks from all of them plus the catch-all. */
  neighborhoods: z
    .record(z.string().min(1), z.array(z.string().min(1)).min(1))
    .superRefine((regions, ctx) => {
      const regionByName = new Map<string, string>();
      for (const [region, neighborhoods] of Object.entries(regions)) {
        for (const neighborhood of neighborhoods) {
          const key = normalizeName(neighborhood);
          if (key === normalizeName(ELSEWHERE_IN_THE_METRO)) {
            ctx.addIssue({ code: "custom", message: `"${neighborhood}" is the catch-all and belongs to no region, but ${region} lists it` });
          } else if (regionByName.has(key)) {
            ctx.addIssue({ code: "custom", message: `"${neighborhood}" is listed under both ${regionByName.get(key)} and ${region}` });
          } else regionByName.set(key, region);
        }
      }
      if (!regionByName.has(normalizeName(LAWRENCE))) ctx.addIssue({ code: "custom", message: `some region must list "${LAWRENCE}"` });
    })
    .default(() => structuredClone(DEFAULT_NEIGHBORHOODS)),
  discovery: discoverySchema.default(discoverySchema.parse({})),
  /**
   * Venue aliases (ADR 0007): a venue's display name to the other names it goes by, a room inside it
   * or a program that runs there. Event identity treats them all as one venue. Hand-kept.
   */
  venueAliases: z.record(z.string().min(1), z.array(z.string().min(1))).default({}),
  /**
   * Venue neighborhoods (#150): a venue's display name (a venueAliases key, or the name as pages give it)
   * to the neighborhood every event at it not expired is placed in, whatever its page says. Hand-kept.
   */
  venueNeighborhoods: z.record(z.string().min(1), z.string().min(1)).default({}),
}).superRefine((config, ctx) => {
  const listed = new Set(Object.values(config.neighborhoods).flat().map(normalizeName));
  for (const [venue, neighborhood] of Object.entries(config.venueNeighborhoods)) {
    const key = venueAndRoom(venue, config.venueAliases).venue;
    if (key !== venue) ctx.addIssue({ code: "custom", message: `venueNeighborhoods "${venue}" is a name venueAliases files under "${key}"; key the entry on "${key}"` });
    if (normalizeName(neighborhood) === normalizeName(ELSEWHERE_IN_THE_METRO)) {
      ctx.addIssue({ code: "custom", message: `venueNeighborhoods "${venue}" names the catch-all; map a venue only to a neighborhood a region lists` });
    } else if (!listed.has(normalizeName(neighborhood))) {
      ctx.addIssue({ code: "custom", message: `venueNeighborhoods "${venue}" names "${neighborhood}", which no region lists` });
    }
  }
});

export type RunConfig = z.infer<typeof configSchema>;

export function parseConfig(raw: unknown): RunConfig {
  return configSchema.parse(raw);
}
