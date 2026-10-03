import { z } from "zod";

const DEFAULT_MODELS = { extraction: "openai/gpt-6-luna", curation: "anthropic/claude-sonnet-5.5" };

/** The catch-all for an address that maps to nothing on the neighborhood list. */
export const ELSEWHERE_IN_THE_METRO = "Elsewhere in the metro";

export const NEIGHBORHOOD_CATCH_ALLS = ["Lawrence", ELSEWHERE_IN_THE_METRO] as const;

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

const discoverySchema = z.strictObject({
  enabled: z.boolean().default(false),
  /** The geography in the few words a search engine wants; queries are built from it. */
  place: z.string().min(1).default("Kansas City"),
  resultsPerQuery: z.number().int().positive().default(5),
  linksPerAggregatorPage: z.number().int().positive().default(10),
  aggregatorHosts: z.array(z.string().min(1)).default([...DEFAULT_AGGREGATOR_HOSTS]),
  ignoredHosts: z.array(z.string().min(1)).default([...DEFAULT_IGNORED_HOSTS]),
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
  neighborhoods: z
    .array(z.string().min(1))
    .refine((list) => NEIGHBORHOOD_CATCH_ALLS.every((c) => list.includes(c)), {
      message: `neighborhoods must include the catch-alls: ${NEIGHBORHOOD_CATCH_ALLS.join(", ")}`,
    })
    .default([...NEIGHBORHOOD_CATCH_ALLS]),
  discovery: discoverySchema.default(discoverySchema.parse({})),
});

export type RunConfig = z.infer<typeof configSchema>;

export function parseConfig(raw: unknown): RunConfig {
  return configSchema.parse(raw);
}
