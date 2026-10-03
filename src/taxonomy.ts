/**
 * The controlled lists an event's kind and neighborhood come from. What the model says is matched
 * against the list ignoring case and punctuation and replaced by the list's own spelling; anything
 * else falls to the list's escape hatch.
 */
import { NEIGHBORHOOD_CATCH_ALLS, type RunConfig } from "./config.js";
import { normalizeName } from "./identity.js";
import type { Registry } from "./registry.js";

/** The catch-all for an address that maps to nothing on the neighborhood list. */
export const ELSEWHERE_IN_THE_METRO: (typeof NEIGHBORHOOD_CATCH_ALLS)[number] = "Elsewhere in the metro";

/** The list's own spelling of a value, or undefined when it is not on the list. */
function fromList(value: string | null, list: readonly string[]): string | undefined {
  if (value === null || normalizeName(value) === "") return undefined;
  return list.find((item) => normalizeName(item) === normalizeName(value));
}

/** A kind from the taxonomy; anything not on it is "other". */
export function toKind(value: string | null, kinds: readonly string[]): string {
  return fromList(value, kinds) ?? "other";
}

/**
 * The controlled neighborhood list: the config's list, catch-alls included, plus every
 * registry source's neighborhood, so a source never names a neighborhood the list lacks.
 */
export function neighborhoodList(config: RunConfig, registry: Registry): string[] {
  const list = [...config.neighborhoods];
  for (const { neighborhood } of registry.sources) if (fromList(neighborhood, list) === undefined) list.push(neighborhood);
  return list;
}

/** Where an address landed: a neighborhood on the list, or the catch-all with what the extractor proposed instead. */
export type Placement = { neighborhood: string } | { neighborhood: typeof ELSEWHERE_IN_THE_METRO; unmappable: { proposed?: string } };

/**
 * The neighborhood the extractor proposed, from the list; anything off it, or nothing at all,
 * lands in the elsewhere-in-the-metro catch-all and is marked unmappable so the report flags it.
 */
export function toNeighborhood(proposed: string | null, list: readonly string[]): Placement {
  const listed = fromList(proposed, list);
  if (listed !== undefined && listed !== ELSEWHERE_IN_THE_METRO) return { neighborhood: listed };
  const offList = proposed !== null && listed === undefined && normalizeName(proposed) !== "";
  return { neighborhood: ELSEWHERE_IN_THE_METRO, unmappable: offList ? { proposed: proposed.trim() } : {} };
}
