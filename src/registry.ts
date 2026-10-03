import { z } from "zod";

const sourceFields = {
  name: z.string().min(1),
  urls: z.array(z.url()).min(1),
  kind: z.string().min(1),
  neighborhood: z.string().min(1),
  checkHints: z.string().optional(),
  notes: z.string().optional(),
};

/** A source the job checks on every run, or one it knows about and deliberately does not fetch. */
export const sourceSchema = z.discriminatedUnion("status", [
  z.strictObject({ ...sourceFields, status: z.literal("active") }),
  z.strictObject({ ...sourceFields, status: z.literal("excluded"), reason: z.string().min(1) }),
]);

export const registrySchema = z
  .strictObject({ sources: z.array(sourceSchema).default([]) })
  .refine((r) => new Set(r.sources.map((s) => s.name)).size === r.sources.length, {
    message: "source names must be unique",
  });

export type Source = z.infer<typeof sourceSchema>;
export type Registry = z.infer<typeof registrySchema>;

export function parseRegistry(raw: unknown): Registry {
  // An empty YAML file parses to null; treat it as an empty registry.
  return registrySchema.parse(raw ?? {});
}
