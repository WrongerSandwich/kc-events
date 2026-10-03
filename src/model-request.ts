/**
 * What every model call shares, whichever editorial surface it carries: a strict response format
 * built from a Zod schema, and the lines that tell the model about this run.
 */
import type { z } from "zod";
import type { RunConfig } from "./config.js";
import type { CompletionRequest } from "./ports.js";

/** A strict JSON-schema response format from a Zod schema. Zod emits a `$schema` declaration that strict mode does not accept. */
export function strictResponseFormat(name: string, schema: z.ZodType): CompletionRequest["responseFormat"] {
  const { $schema: _, ...rest } = schema.toJSONSchema();
  return { name, schema: rest };
}

/** The opening of the "This run" section of a system message: the date and horizon every call needs. */
export function thisRunLines(config: RunConfig, today: string): string[] {
  return ["## This run", "", `- Today: ${today} (${config.timezone})`, `- Horizon: the next ${config.horizonWeeks} weeks`];
}
