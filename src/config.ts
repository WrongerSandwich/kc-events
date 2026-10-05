import { z } from "zod";
import { normalizeName } from "./identity.js";

const DEFAULT_MODELS = { extraction: "openai/gpt-6-luna", curation: "anthropic/claude-sonnet-5.5" };

/** The catch-all for an address that maps to nothing on the neighborhood list; it is in no region. */
export const ELSEWHERE_IN_THE_METRO = "Elsewhere in the metro";

const DEFAULT_NEIGHBORHOODS: Record<string, string[]> = { Lawrence: ["Lawrence"] };

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
      const regionOf = new Map<string, string>();
      for (const [region, neighborhoods] of Object.entries(regions)) {
        for (const neighborhood of neighborhoods) {
          const key = normalizeName(neighborhood);
          if (key === normalizeName(ELSEWHERE_IN_THE_METRO)) {
            ctx.addIssue({ code: "custom", message: `"${neighborhood}" is the catch-all and belongs to no region, but ${region} lists it` });
          } else if (regionOf.has(key)) {
            ctx.addIssue({ code: "custom", message: `"${neighborhood}" is listed under both ${regionOf.get(key)} and ${region}` });
          } else regionOf.set(key, region);
        }
      }
    })
    .default(() => structuredClone(DEFAULT_NEIGHBORHOODS)),
  discovery: discoverySchema.default(discoverySchema.parse({})),
  /**
   * Venue aliases (ADR 0007): a venue's display name to the other names it goes by, a room inside it
   * or a program that runs there. Event identity treats them all as one venue. Hand-kept.
   */
  venueAliases: z.record(z.string().min(1), z.array(z.string().min(1))).default({}),
});

export type RunConfig = z.infer<typeof configSchema>;

export function parseConfig(raw: unknown): RunConfig {
  return configSchema.parse(raw);
}
