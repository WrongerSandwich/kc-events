/**
 * The controlled lists an event's kind and neighborhood come from. What the model says is matched
 * against the list ignoring case and punctuation and replaced by the list's own spelling; anything
 * else falls to the list's escape hatch.
 */
import { ELSEWHERE_IN_THE_METRO, type RunConfig } from "./config.js";
import { normalizeName } from "./identity.js";
import type { Registry } from "./registry.js";

/** The list's own spelling of a value, or undefined when it is not on the list. */
function fromList(value: string | null, list: readonly string[]): string | undefined {
  if (value === null || normalizeName(value) === "") return undefined;
  return list.find((item) => normalizeName(item) === normalizeName(value));
}

/** A kind from the taxonomy; anything not on it is "other". */
export function toKind(value: string | null, kinds: readonly string[]): string {
  return fromList(value, kinds) ?? "other";
}

/** The region that lists this neighborhood, in any spelling; undefined for the catch-all or anything unlisted. */
export function regionOf(neighborhood: string, config: RunConfig): string | undefined {
  const regions = Object.entries(config.neighborhoods);
  return regions.find(([, neighborhoods]) => fromList(neighborhood, neighborhoods) !== undefined)?.[0];
}

/**
 * The controlled neighborhood list: every region's neighborhoods, then the catch-all. A registry
 * source naming a neighborhood no region lists is a config error, not a new neighborhood.
 */
export function neighborhoodList(config: RunConfig, registry: Registry): string[] {
  const list = [...Object.values(config.neighborhoods).flat(), ELSEWHERE_IN_THE_METRO];
  const offList = registry.sources.filter(({ neighborhood }) => fromList(neighborhood, list) === undefined);
  if (offList.length > 0) {
    const named = offList.map((s) => `${s.name} names "${s.neighborhood}"`).join("; ");
    throw new Error(`registry sources name neighborhoods no region lists in the config: ${named}`);
  }
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

/**
 * A stored neighborhood placed against today's list: the list's own spelling, or the catch-all for
 * anything off it, such as a region name written before neighborhoods were grouped under regions.
 */
export function placeStored(neighborhood: string, list: readonly string[]): string {
  return fromList(neighborhood, list) ?? ELSEWHERE_IN_THE_METRO;
}
