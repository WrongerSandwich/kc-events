/**
 * A venue page's title, meta description, facts line and JSON-LD (#300), from the data alone and in the site's neutral
 * voice: a search result should say the page lists the venue's events, and what is on there next.
 */
import { comingSunday, formatDay, formatShort } from "./dates";
import { clip, META_MAX } from "./event-meta";
import { firstDay, hasStartDay, samePlace } from "./events";
import { groupResults, resultEvents } from "./group";
import { landingRange } from "./landing";
import { DEFAULT_FILTERS, EVERY_DATE } from "./query";
import { kindLabel } from "./slugs";
import type { PublishedEvent, PublishedVenue } from "./types";
import { venueJsonLd } from "./venues";

/** The city a venue is in: its table row's, else Kansas City, which the site is about. */
function venueCity(v: PublishedVenue): string {
  return v.address?.locality ?? "Kansas City";
}

/** "Knuckleheads events, Kansas City"; a name that already ends with its city does not say it twice. */
export function venuePageTitle(v: PublishedVenue): string {
  const city = venueCity(v);
  return v.name.trim().toLowerCase().endsWith(city.toLowerCase()) ? `${v.name} events` : `${v.name} events, ${city}`;
}

/** Where a venue is, in a few words: its neighborhood, or its region when the neighborhood is only its own name. */
function venueWhere(v: PublishedVenue): string | undefined {
  if (v.neighborhood === undefined || samePlace(v.neighborhood, v.name)) return v.region;
  return v.neighborhood;
}

/** The page's events in the order it lists them: the explorer's groups, recurring events included. */
function listed(events: readonly PublishedEvent[], today: string): PublishedEvent[] {
  return resultEvents(groupResults([...events], { ...DEFAULT_FILTERS, when: EVERY_DATE, recurring: true }, today, new Set()));
}

/** The dated events on a day from `from` through `to`, each once. */
function datedIn(events: readonly PublishedEvent[], today: string, from: string, to: string): PublishedEvent[] {
  return resultEvents(groupResults([...events], { ...DEFAULT_FILTERS, when: { from, to } }, today, new Set()));
}

/** Fewer characters than this left for the next event's title, and the description gives the counts alone. */
const TITLE_MIN = 12;

/**
 * The meta description, under META_MAX characters. With events: the next to start (or one on now), then how many are
 * listed and where, "Next: A show, Fri Oct 9. 3 upcoming events at recordBar, Crossroads."; the title is what gets
 * clipped, never the counts. With none, the venue and where it is, and that nothing is listed, with no guess why.
 */
export function venueDescription(v: PublishedVenue, events: readonly PublishedEvent[], today: string): string {
  const where = venueWhere(v);
  const at = `${v.name}${where === undefined ? "" : `, ${where}`}`;
  if (events.length === 0) return clip(`${at}. Nothing listed right now; see what's on in Kansas City this week.`, META_MAX);

  const tail = clip(`${events.length} upcoming event${events.length === 1 ? "" : "s"} at ${at}.`, META_MAX);
  const starts = events.filter((e) => firstDay(e) !== undefined);
  const next = starts.filter((e) => firstDay(e)! >= today).sort((a, b) => firstDay(a)!.localeCompare(firstDay(b)!) || a.start!.localeCompare(b.start!))[0];
  const now = next === undefined ? starts.find((e) => firstDay(e)! < today) : undefined;
  const lead = next !== undefined ? { e: next, before: "Next: ", after: `, ${formatDay(firstDay(next)!)}.` } : now !== undefined ? { e: now, before: "On now: ", after: "." } : undefined;
  if (lead === undefined) return tail;
  const room = META_MAX - tail.length - 1 - lead.before.length - lead.after.length;
  return room < TITLE_MIN ? tail : `${lead.before}${clip(lead.e.title, room)}${lead.after} ${tail}`;
}

/** "3 events", "1 event". */
function count(n: number): string {
  return `${n} event${n === 1 ? "" : "s"}`;
}

/**
 * The facts under a venue page's header, each a short phrase, any with nothing to say left out: the kinds it hosts in
 * the horizon (recurring events included), most events first, "Music, comedy"; and how many dated events are on this
 * week and through the horizon, "2 events this week, 5 through Dec 13".
 */
export function venueFacts(events: readonly PublishedEvent[], today: string, horizonWeeks: number): string[] {
  const range = landingRange(today, horizonWeeks);
  const inHorizon = datedIn(events, today, range.from, range.to);
  const thisWeek = datedIn(events, today, today, comingSunday(today)).length;

  const kinds = new Map<string, number>();
  for (const e of [...inHorizon, ...events.filter((e) => e.recurrence === "recurring")]) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
  // "other" alone reads as a fragment in a list ("Music, other"), so it says what kindName says: other events.
  const byCount = [...kinds].sort((a, b) => b[1] - a[1]).map(([k]) => (k === "other" ? "other events" : k));

  const facts: string[] = [];
  if (byCount.length > 0) facts.push([kindLabel(byCount[0]!), ...byCount.slice(1)].join(", "));
  const through = `through ${formatShort(range.to)}`;
  if (inHorizon.length > 0) facts.push(thisWeek > 0 ? `${count(thisWeek)} this week, ${inHorizon.length} ${through}` : `${count(inHorizon.length)} ${through}`);
  return facts;
}

/**
 * The page's JSON-LD: the Place (venueJsonLd); the trail Home › Venues › the venue, as an event page's breadcrumb is
 * shaped; and, when anything coming up has a start, an ItemList of those events' pages in the order the page lists
 * them, as the kind and region pages carry (landingJsonLd). A recurring event has no Event JSON-LD, so it is not listed.
 */
export function venuePageJsonLd(v: PublishedVenue, events: readonly PublishedEvent[], opts: { origin: string; today: string }): object[] {
  const at = (path: string) => new URL(path, opts.origin).toString();
  const page = at(`/v/${v.slug}`);
  const trail = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: at("/") },
      { "@type": "ListItem", position: 2, name: "Venues", item: at("/venues") },
      { "@type": "ListItem", position: 3, name: v.name, item: page },
    ],
  };
  const items = listed(events, opts.today).filter(hasStartDay);
  const list = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Events at ${v.name}`,
    url: page,
    numberOfItems: items.length,
    itemListElement: items.map((e, i) => ({ "@type": "ListItem", position: i + 1, url: at(`/e/${e.id}`) })),
  };
  return [venueJsonLd(v, page), trail, ...(items.length > 0 ? [list] : [])];
}
