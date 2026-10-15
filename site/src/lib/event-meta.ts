import { longDateLine } from "./date-line";
import { hasStartDay, detailsUrl, venueLine } from "./events";
import { siteConfig } from "../site.config";
import type { PublishedEvent, PublishedVenue } from "./types";
import { geoLd, postalAddressLd } from "./venues";

/** The page's meta description: the date line (when there is one), the place, and the why-line. */
export function eventDescription(e: PublishedEvent, today: string): string {
  const line = longDateLine(e, today);
  const where = `${venueLine(e)}, ${e.neighborhood}.`;
  return `${line === "" ? `At ${where}` : `${line} at ${where}`}${e.whyLine ? ` ${e.whyLine}` : ""}`;
}

/**
 * The city and state an event is in: Kansas City, or a city of its own (Overland Park, Liberty), as `regionAddress`
 * in site.config.ts says of its neighborhood. The catch-all region, which spans both states, states none.
 */
export function postalAddress(e: PublishedEvent): { addressLocality: string; addressRegion?: string } {
  const region = siteConfig.regionAddress[e.region];
  if (region === undefined) return { addressLocality: "Kansas City" };
  const inKansasCity = region.kansasCity === "all" || region.kansasCity.includes(e.neighborhood);
  return { addressLocality: inKansasCity ? "Kansas City" : e.neighborhood, addressRegion: region.state };
}

/** A price stated as nothing but free: "Free", "Free admission", "FREE!"; "Free with museum admission" is not. */
const FREE = /^free(?: admission| entry| event)?[.!]?$/i;
/** A dollar amount in a stated price: "$25", "$25.50", "$1,200". */
const DOLLARS = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)(?!\d)/g;

/**
 * schema.org offers for the price the event's own page stated (#133): free as a zero price, one dollar amount as an
 * Offer, two or more as an AggregateOffer from the lowest to the highest. Undefined for no price, or one that states
 * no number ("Pay what you can", "Free with museum admission"), which an offer would have to invent.
 */
export function eventOffers(e: PublishedEvent): object | undefined {
  if (e.price === undefined) return undefined;
  const base = { priceCurrency: "USD", url: detailsUrl(e) };
  const amounts = [...e.price.matchAll(DOLLARS)].map((m) => Number(m[1]!.replace(/,/g, "")));
  if (amounts.length === 0) return FREE.test(e.price.trim()) ? { "@type": "Offer", price: 0, ...base } : undefined;
  const [low, high] = [Math.min(...amounts), Math.max(...amounts)];
  return low === high ? { "@type": "Offer", price: low, ...base } : { "@type": "AggregateOffer", lowPrice: low, highPrice: high, ...base };
}

/**
 * schema.org/Event, or undefined when there is no start date to state: a recurring event has none, and a run read
 * after it began has only an end date, which Event consumers read as a malformed listing, so both omit it.
 * The description is the page's description text, then the why-line; `image` is the site's share card (no event
 * imagery, spec section 7). The neighborhood goes in the place's name, since it is not a postal locality. Offers only
 * when the own page stated a price (eventOffers). The venue's table row (#137), when it has one, gives the place its
 * street address and position in place of the neighborhood's city.
 */
export function eventJsonLd(e: PublishedEvent, opts: { description?: string; image: string; venue?: PublishedVenue }): object | undefined {
  if (!hasStartDay(e)) return undefined;
  const description = [opts.description, e.whyLine].filter((s) => s !== undefined && s !== "").join(" ");
  const offers = eventOffers(e);
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    startDate: e.start,
    ...(e.end && { endDate: e.end }),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: `${e.venue}, ${e.neighborhood}`,
      address: opts.venue?.address !== undefined ? postalAddressLd(opts.venue.address) : { "@type": "PostalAddress", ...postalAddress(e), addressCountry: "US" },
      ...(opts.venue?.geo !== undefined && { geo: geoLd(opts.venue.geo) }),
    },
    image: [opts.image],
    url: detailsUrl(e),
    ...(description !== "" && { description }),
    ...(offers !== undefined && { offers }),
  };
}

/**
 * The front page's JSON-LD: the site, with a search action into the explorer's text filter, and the picks as an
 * ItemList of their event pages, in the order the page shows them. Only picks whose page carries Event JSON-LD are
 * listed: Google reads such a list as a summary of event pages, and a run with no start has none.
 */
export function frontPageJsonLd(picks: PublishedEvent[], origin: string): object {
  const at = (path: string) => new URL(path, origin).toString();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: siteConfig.name,
        url: at("/"),
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${at("/explore")}?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "ItemList",
        name: "Don't miss",
        itemListElement: picks.filter(hasStartDay).map((e, i) => ({ "@type": "ListItem", position: i + 1, url: at(`/e/${e.id}`) })),
      },
    ],
  };
}
