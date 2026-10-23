import { longDateLine } from "./date-line";
import { formatShort, isDateOnly, localDate } from "./dates";
import { firstDay, hasStartDay, detailsUrl, venueLine } from "./events";
import { kindName } from "./landing";
import { siteConfig } from "../site.config";
import type { PublishedEvent, PublishedVenue } from "./types";
import { geoLd, postalAddressLd } from "./venues";

/** A meta description stays under this many characters, the length a search snippet shows before it cuts. */
export const META_MAX = 160;
/** About how much of the page's description text the meta description quotes. */
const ABOUT_MAX = 110;
/** A title longer than this leaves the meta description too little room, so the kind names the event instead. */
const TITLE_MAX = 60;

/** Text cut to at most `max` characters at a word, ending in an ellipsis when it was cut. */
export function clip(text: string, max: number): string {
  const s = text.trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const atWord = cut.lastIndexOf(" ") > max / 2 ? cut.slice(0, cut.lastIndexOf(" ")) : cut;
  return `${atWord.replace(/[\s,;:.\-–—]+$/, "")}…`;
}

/** When and where, as one sentence: "Friday, October 9, 7:00 pm at recordBar."; "At recordBar." with no date line. */
export function datePlaceSentence(e: PublishedEvent, today: string): string {
  const line = longDateLine(e, today);
  return line === "" ? `At ${venueLine(e)}.` : `${line} at ${venueLine(e)}.`;
}

/**
 * The page's meta description (#189): what the event is (its title, or its kind when the title is long), when and
 * where, then the page's description text cut to about 110 characters, else the why-line; under 160 characters in all.
 * "Floating Pumpkin Patch: Sunday, October 25 at Lake Lenexa. A night paddle among lit pumpkins…"
 */
export function eventDescription(e: PublishedEvent, today: string, about?: string): string {
  const name = e.title.length <= TITLE_MAX ? e.title : kindName(e.kind);
  const sentence = datePlaceSentence(e, today);
  const head = clip(`${name}: ${sentence.startsWith("At ") ? `at${sentence.slice(2)}` : sentence}`, META_MAX - 1);
  const tail = about !== undefined && about.trim() !== "" ? clip(about, ABOUT_MAX) : e.whyLine?.trim();
  const room = META_MAX - 1 - head.length - 1;
  // A tail cut to a stub says less than none: leave it off when fewer than a few words fit.
  return tail === undefined || tail === "" || room < 24 ? head : `${head} ${clip(tail, room)}`;
}

/**
 * The event page's title: the event's, with a short date when another published event has the same title (#189), so
 * the two pages' titles differ in a search result or a tab: "Floating Pumpkin Patch, Oct 25".
 */
export function eventPageTitle(e: PublishedEvent, events: readonly PublishedEvent[]): string {
  const day = firstDay(e);
  const shared = events.some((o) => o.id !== e.id && o.title.trim().toLowerCase() === e.title.trim().toLowerCase());
  return shared && day !== undefined ? `${e.title}, ${formatShort(day)}` : e.title;
}

/**
 * The city and state an event is in: Kansas City, or a city of its own (Overland Park, Liberty), as `regionAddress`
 * in site.config.ts says of its neighborhood. The catch-all region spans both states and reaches well outside the
 * city (Powell Gardens is in Kingsville), so it states neither: a wrong city is worse than none.
 */
export function postalAddress(e: PublishedEvent): { addressLocality?: string; addressRegion?: string } {
  const region = siteConfig.regionAddress[e.region];
  if (region === undefined) return {};
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

/** schema.org's day URLs, by weekday() number (0 is Sunday). */
const SCHEMA_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d) => `https://schema.org/${d}`);

/** A host without its "www.", for comparing a page's site with the venue's. */
const bareHost = (url: string): string | undefined => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
};

/**
 * The venue as the event's organizer, when the venue is its host: its table row names its own site, and the page the
 * event was read from is on that site (a venue's own calendar). An event read from a listing elsewhere (a promoter, a
 * city calendar) has an organizer the data does not name, so it gets none.
 */
export function organizerLd(e: PublishedEvent, venue: PublishedVenue | undefined): object | undefined {
  if (venue?.url === undefined) return undefined;
  const site = bareHost(venue.url);
  const page = bareHost(e.primaryUrl);
  if (site === undefined || page === undefined || !(page === site || page.endsWith(`.${site}`))) return undefined;
  return { "@type": "Organization", name: venue.name, url: venue.url };
}

/**
 * The start and end as Event JSON-LD states them. The end only when the data has one, never a placeholder (the
 * calendar's two hours are for a calendar). A timed start with a date-only end mixes precisions: on a later day both
 * go as dates, the span being what the end says; on the same day the end goes, as the start already says it.
 */
function eventDates(e: PublishedEvent): { startDate: string; endDate?: string } {
  const start = e.start!;
  if (e.end === undefined) return { startDate: start };
  if (isDateOnly(e.end) && !isDateOnly(start)) {
    const first = localDate(start);
    return e.end > first ? { startDate: first, endDate: e.end } : { startDate: start };
  }
  return { startDate: start, endDate: e.end };
}

/** A run that plays only some weekdays (#143) as a weekly schedule over its span. */
function eventSchedule(e: PublishedEvent): object | undefined {
  if (e.days === undefined || e.days.length === 0) return undefined;
  return {
    "@type": "Schedule",
    byDay: e.days.map((n) => SCHEMA_DAYS[n]),
    startDate: localDate(e.start!),
    ...(e.end !== undefined && { endDate: localDate(e.end) }),
  };
}

/**
 * schema.org/Event, or undefined when there is no start date to state: a recurring event has none, and a run read
 * after it began has only an end date, which Event consumers read as a malformed listing, so both omit it.
 * The entity is the site's own page (`url` and `@id`, as the front and landing pages' ItemLists and the breadcrumb
 * name it); the venue's page stays as `sameAs` and the offers' `url` (#189). The description is the page's description
 * text, then the why-line, else the meta description's when-and-where sentence, so it is never empty. `image` is the
 * site's share card (no event imagery, spec section 7). The neighborhood goes in the place's name, since it is not a
 * postal locality. Offers only when the own page stated a price (eventOffers). The venue's table row (#137), when it
 * has one, gives the place its street address and position in place of the neighborhood's city, and is the organizer
 * when the event was read from its site (organizerLd).
 */
export function eventJsonLd(
  e: PublishedEvent,
  opts: { origin: string; today: string; description?: string; image: string; venue?: PublishedVenue },
): object | undefined {
  if (!hasStartDay(e)) return undefined;
  const page = new URL(`/e/${e.id}`, opts.origin).toString();
  const stated = [opts.description, e.whyLine].filter((s) => s !== undefined && s !== "").join(" ");
  const offers = eventOffers(e);
  const organizer = organizerLd(e, opts.venue);
  const schedule = eventSchedule(e);
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": page,
    name: e.title,
    ...eventDates(e),
    ...(schedule !== undefined && { eventSchedule: schedule }),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: `${e.venue}, ${e.neighborhood}`,
      address: opts.venue?.address !== undefined ? postalAddressLd(opts.venue.address) : { "@type": "PostalAddress", ...postalAddress(e), addressCountry: "US" },
      ...(opts.venue?.geo !== undefined && { geo: geoLd(opts.venue.geo) }),
    },
    image: [opts.image],
    url: page,
    sameAs: detailsUrl(e),
    description: stated !== "" ? stated : datePlaceSentence(e, opts.today),
    ...(organizer !== undefined && { organizer }),
    ...(offers !== undefined && { offers }),
  };
}

/**
 * The front page's JSON-LD: the site, with a search action into the explorer's text filter, and the picks as an
 * ItemList of their event pages, in the order the page shows them. Only picks whose page carries Event JSON-LD are
 * listed: Google reads such a list as a summary of event pages, and a run with no start has none. Both nodes carry the
 * last run as their `dateModified` (#189), the day the list last changed.
 */
export function frontPageJsonLd(picks: PublishedEvent[], origin: string, lastSuccessfulRun: string): object {
  const at = (path: string) => new URL(path, origin).toString();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: siteConfig.name,
        url: at("/"),
        dateModified: lastSuccessfulRun,
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${at("/explore")}?when=all&q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "ItemList",
        name: "Picks",
        dateModified: lastSuccessfulRun,
        itemListElement: picks.filter(hasStartDay).map((e, i) => ({ "@type": "ListItem", position: i + 1, url: at(`/e/${e.id}`) })),
      },
    ],
  };
}
