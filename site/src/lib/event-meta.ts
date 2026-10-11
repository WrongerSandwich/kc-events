import { longDateLine } from "./date-line";
import { hasStartDay, detailsUrl } from "./events";
import { siteConfig } from "../site.config";
import type { PublishedEvent } from "./types";

/** The page's meta description: the date line (when there is one), the place, and the why-line. */
export function eventDescription(e: PublishedEvent, today: string): string {
  const line = longDateLine(e, today);
  const where = `${e.venue}, ${e.neighborhood}.`;
  return `${line === "" ? `At ${where}` : `${line} at ${where}`}${e.whyLine ? ` ${e.whyLine}` : ""}`;
}

/**
 * The city and state an event is in. A neighborhood is a part of Kansas City unless its region is one of cities
 * (Overland Park, Liberty); the state comes from the region, and the catch-all region, which spans both, states none.
 */
export function postalAddress(e: PublishedEvent): { addressLocality: string; addressRegion?: string } {
  const region = siteConfig.regionAddress[e.region];
  if (region === undefined) return { addressLocality: "Kansas City" };
  const ownCity = region.cities && !siteConfig.kansasCity.includes(e.neighborhood);
  return { addressLocality: ownCity ? e.neighborhood : "Kansas City", addressRegion: region.state };
}

/**
 * schema.org/Event, or undefined when there is no start date to state: a recurring event has none, and a run read
 * after it began has only an end date, which Event consumers read as a malformed listing, so both omit it.
 * The description is the page's description text, then the why-line; `image` is the site's share card (no event
 * imagery, spec section 7). The neighborhood goes in the place's name, since it is not a postal locality.
 */
export function eventJsonLd(e: PublishedEvent, opts: { description?: string; image: string }): object | undefined {
  if (!hasStartDay(e)) return undefined;
  const description = [opts.description, e.whyLine].filter((s) => s !== undefined && s !== "").join(" ");
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
      address: { "@type": "PostalAddress", ...postalAddress(e), addressCountry: "US" },
    },
    image: [opts.image],
    url: detailsUrl(e),
    ...(description !== "" && { description }),
  };
}

/**
 * The front page's JSON-LD: the site, with a search action into the explorer's text filter, and the picks as an
 * ItemList of their event pages, in the order the page shows them.
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
        itemListElement: picks.map((e, i) => ({ "@type": "ListItem", position: i + 1, url: at(`/e/${e.id}`) })),
      },
    ],
  };
}
