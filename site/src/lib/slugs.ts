/** A URL-safe token for a kind or region name: lowercase, runs of anything but letters and digits become one dash. */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function slugTable(names: readonly string[]): { toSlug(name: string): string; fromSlug(slug: string): string | undefined } {
  const back = new Map(names.map((n) => [slugify(n), n]));
  return { toSlug: slugify, fromSlug: (slug) => back.get(slug) };
}
