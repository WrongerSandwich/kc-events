import { slugify } from "./slugs";
import type { Geo, PublishedEvent, PublishedVenue, VenueAddress } from "./types";

/**
 * A venue page's slug, from the venue's display name (#137): apostrophes dropped, a leading "The" too, so "The Truman"
 * and "Truman", or "Zhou B Art Center KC" in capitals, are one page, as the job's normalizeName has them one venue.
 * Derived, never stored, so a result row links its venue without the explorer carrying a slug for every event.
 */
export function venueSlug(name: string): string {
  return slugify(name.replace(/['’]/g, "").replace(/^\s*the\s+/i, ""));
}

export function venuePath(name: string): string {
  return `/v/${venueSlug(name)}`;
}

/** The venue page a venue name is on; build-time callers only, since the browser has no venue list. */
export function venueNamed(venues: readonly PublishedVenue[], name: string): PublishedVenue | undefined {
  const slug = venueSlug(name);
  return venues.find((v) => v.slug === slug);
}

/** The heading of the venue directory's last group: the venues with a table row and nothing coming up. */
export const NOTHING_LISTED = "Nothing listed right now";

export type DirectoryGroup = { heading: string; venues: { venue: PublishedVenue; events: number }[] };

/**
 * The venue directory, /venues: every venue page, under its region in the config's order, by slug within it (so "The
 * Truman" sorts as Truman), each with how many published events it has; then the venues with none.
 */
export function venueDirectory(venues: readonly PublishedVenue[], events: readonly PublishedEvent[], regions: readonly string[]): DirectoryGroup[] {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(venueSlug(e.venue), (counts.get(venueSlug(e.venue)) ?? 0) + 1);
  const entries = [...venues].sort((a, b) => a.slug.localeCompare(b.slug)).map((venue) => ({ venue, events: counts.get(venue.slug) ?? 0 }));
  const groups = regions.map((heading) => ({ heading, venues: entries.filter((x) => x.events > 0 && x.venue.region === heading) }));
  groups.push({ heading: NOTHING_LISTED, venues: entries.filter((x) => x.events === 0) });
  return groups.filter((g) => g.venues.length > 0);
}

/** The address on one line, as the table writes it. */
export function addressLine(a: VenueAddress): string {
  return `${a.street}, ${a.locality}, ${a.region} ${a.postalCode}`;
}

/**
 * A map search for the venue; a link, never an embedded map or a third-party script. By name and address, so the map
 * opens the venue's own listing rather than a bare pin; a row with no address (a district) goes by its position.
 * Undefined for a venue with neither.
 */
export function mapUrl(v: PublishedVenue): string | undefined {
  const query = v.address !== undefined ? encodeURIComponent(`${v.name}, ${addressLine(v.address)}`) : v.geo !== undefined ? `${v.geo.lat},${v.geo.lng}` : undefined;
  return query === undefined ? undefined : `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/** schema.org PostalAddress for a table row's address. */
export function postalAddressLd(a: VenueAddress): object {
  return { "@type": "PostalAddress", streetAddress: a.street, addressLocality: a.locality, addressRegion: a.region, postalCode: a.postalCode, addressCountry: "US" };
}

/** schema.org GeoCoordinates for a table row's position. */
export function geoLd(geo: Geo): object {
  return { "@type": "GeoCoordinates", latitude: geo.lat, longitude: geo.lng };
}

/** The venue page's JSON-LD: a Place, with its address, position, and site when its table row gives them. */
export function venueJsonLd(v: PublishedVenue, pageUrl: string): object {
  return {
    "@context": "https://schema.org",
    "@type": "Place",
    name: v.name,
    "@id": pageUrl,
    ...(v.address !== undefined && { address: postalAddressLd(v.address) }),
    ...(v.geo !== undefined && { geo: geoLd(v.geo) }),
    ...(v.url !== undefined && { url: v.url }),
  };
}
