import { z } from "zod";

const DEFAULT_MODELS = { extraction: "openai/gpt-6-luna", curation: "anthropic/claude-sonnet-5.5" };

export const NEIGHBORHOOD_CATCH_ALLS = ["Lawrence", "Elsewhere in the metro"] as const;

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
});

export type RunConfig = z.infer<typeof configSchema>;

export function parseConfig(raw: unknown): RunConfig {
  return configSchema.parse(raw);
}
