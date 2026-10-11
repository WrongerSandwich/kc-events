/** A URL-safe token for a kind or region name: lowercase, runs of anything but letters and digits become one dash. */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
