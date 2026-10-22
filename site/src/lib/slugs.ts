import { fold } from "./fold";

/**
 * A URL-safe token for a kind, region, or venue name: the name folded as search folds it (lowercase, accents dropped),
 * its words joined by dashes. "Salón La Villa" → "salon-la-villa".
 */
export function slugify(name: string): string {
  return fold(name).replace(/ /g, "-");
}

export function slugTable(names: readonly string[]): { toSlug(name: string): string; fromSlug(slug: string): string | undefined } {
  const back = new Map(names.map((n) => [slugify(n), n]));
  return { toSlug: slugify, fromSlug: (slug) => back.get(slug) };
}

/** The element id a location hash names, "#pick-a" → "pick-a"; a malformed escape ("#%E0") is taken as written. */
export function hashId(hash: string): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
