import { longDateLine } from "./date-line";
import { hasStartDay } from "./events";
import type { PublishedEvent } from "./types";

/** The page's meta description: the date line (when there is one), the place, and the why-line. */
export function eventDescription(e: PublishedEvent, today: string): string {
  const line = longDateLine(e, today);
  const where = `${e.venue}, ${e.neighborhood}.`;
  return `${line === "" ? `At ${where}` : `${line} at ${where}`}${e.whyLine ? ` ${e.whyLine}` : ""}`;
}

/**
 * schema.org/Event, or undefined when there is no start date to state: a recurring event has none, and a run read
 * after it began has only an end date, which Event consumers read as a malformed listing, so both omit it.
 * Venues span Missouri and Kansas, so no addressRegion: name and locality only (spec section 7).
 */
export function eventJsonLd(e: PublishedEvent): object | undefined {
  if (!hasStartDay(e)) return undefined;
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    startDate: e.start,
    ...(e.end && { endDate: e.end }),
    location: { "@type": "Place", name: e.venue, address: { "@type": "PostalAddress", addressLocality: e.neighborhood } },
    url: e.primaryUrl,
    ...(e.whyLine && { description: e.whyLine }),
  };
}
