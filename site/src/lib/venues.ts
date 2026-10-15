import { slugify } from "./slugs";
import type { Geo, PublishedVenue, VenueAddress } from "./types";

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

/** The address on one line, as the table writes it. */
export function addressLine(a: VenueAddress): string {
  return `${a.street}, ${a.locality}, ${a.region} ${a.postalCode}`;
}

/** A map search for the venue's position; a link, never an embedded map or a third-party script. */
export function mapUrl(geo: Geo): string {
  return `https://www.google.com/maps/search/?api=1&query=${geo.lat},${geo.lng}`;
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
