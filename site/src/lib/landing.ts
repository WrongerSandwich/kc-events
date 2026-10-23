import { addDays, formatRange } from "./dates";
import { hasStartDay } from "./events";
import { groupResults, resultEvents, type ResultGroup } from "./group";
import { DEFAULT_FILTERS, EVERY_DATE, toQuery, type Filters } from "./query";
import { slugify } from "./slugs";
import type { PublishedEvent } from "./types";

/**
 * The kind and region landing pages (#138): one crawlable page per slice the explorer offers only behind a query
 * string, built with the explorer's own grouping and rendered at build with no script.
 */
export type Landing = {
  path: string;
  /** The h1, and the page's title. */
  heading: string;
  description: string;
  /** The explorer with the same filter, to narrow further. */
  explorePath: string;
  groups: ResultGroup[];
  /** Events listed, each once, though a multi-day one-off sits under each of its days. */
  count: number;
};

/** Today through the job's horizon, both inclusive: what a weekly run reads ahead. */
export function landingRange(today: string, horizonWeeks: number): { from: string; to: string } {
  return { from: today, to: addDays(today, horizonWeeks * 7) };
}

/** A kind's page, as the explorer slugs it: "theater/dance" at /k/theater-dance. */
export function kindPath(kind: string): string {
  return `/k/${slugify(kind)}`;
}

/** A region's page: "Johnson County" at /r/johnson-county. */
export function regionPath(region: string): string {
  return `/r/${slugify(region)}`;
}

/** A kind in words: "theater/dance" is "theater and dance". */
function kindWords(kind: string): string {
  return kind.replace(/\//g, " and ");
}

/** A kind as a heading's first words: "Theater and dance", and "other" as "Other events". */
export function kindName(kind: string): string {
  const words = kind === "other" ? "other events" : kindWords(kind);
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "in Johnson County", and the catch-all, "Elsewhere in the metro", as the phrase it is. */
function inRegion(region: string): string {
  return region.startsWith("Elsewhere") ? region.charAt(0).toLowerCase() + region.slice(1) : `in ${region}`;
}

/** The explorer's groups for a fixed filter, with the don't-miss picks first in each day's group. */
function landingGroups(events: PublishedEvent[], f: Partial<Filters>, today: string, range: { from: string; to: string }): ResultGroup[] {
  const groups = groupResults(events, { ...DEFAULT_FILTERS, ...f, when: range }, today, new Set());
  // sort is stable, so the time order holds within the picks and within the rest.
  return groups.map((g) => (g.key === "on-now" ? g : { ...g, events: [...g.events].sort((a, b) => Number(b.dontMiss) - Number(a.dontMiss)) }));
}

/** "31 music events", "1 event", or, for none, "No music events". */
function countLine(count: number, noun: string): string {
  if (count === 0) return `No ${noun}s`;
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function landing(path: string, heading: string, noun: string, where: string, f: Partial<Filters>, events: PublishedEvent[], today: string, range: { from: string; to: string }): Landing {
  const groups = landingGroups(events, f, today, range);
  const count = resultEvents(groups).length;
  const listed = count === 0 ? " listed" : "";
  return {
    path,
    heading,
    description: `${countLine(count, noun)}${listed} ${where}, ${formatRange(range.from, range.to)}.`,
    explorePath: `/explore?${toQuery({ ...DEFAULT_FILTERS, when: EVERY_DATE, ...f })}`,
    groups,
    count,
  };
}

/** /k/<kind>: "Music in Kansas City". */
export function kindLanding(kind: string, events: PublishedEvent[], today: string, range: { from: string; to: string }): Landing {
  const noun = kind === "other" ? "other event" : `${kindWords(kind)} event`;
  return landing(kindPath(kind), `${kindName(kind)} in Kansas City`, noun, "in Kansas City", { kinds: [kind] }, events, today, range);
}

/**
 * /r/<region>: "Things to do in Johnson County", with the region's neighborhoods from the config, less one that is only
 * the region's own name (Lawrence's is "Lawrence"), which the heading already says (#184).
 */
export function regionLanding(region: string, events: PublishedEvent[], today: string, range: { from: string; to: string }, neighborhoods: readonly string[]): Landing & { neighborhoods: readonly string[] } {
  const where = inRegion(region);
  const others = neighborhoods.filter((n) => n.toLowerCase() !== region.toLowerCase());
  return { ...landing(regionPath(region), `Things to do ${where}`, "event", where, { regions: [region] }, events, today, range), neighborhoods: others };
}

/**
 * The page's ItemList of event pages, in the order it lists them. As on the front page (frontPageJsonLd), only events
 * whose page carries Event JSON-LD: a run with no start has none. `dateModified` is the last run (#189).
 */
export function landingJsonLd(page: Landing, origin: string, lastSuccessfulRun: string): object {
  const at = (path: string) => new URL(path, origin).toString();
  const listed = resultEvents(page.groups).filter(hasStartDay);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: page.heading,
    url: at(page.path),
    dateModified: lastSuccessfulRun,
    numberOfItems: listed.length,
    itemListElement: listed.map((e, i) => ({ "@type": "ListItem", position: i + 1, url: at(`/e/${e.id}`) })),
  };
}

/** An event page's trail: Home › its kind's landing page › the event. */
export function breadcrumbJsonLd(e: PublishedEvent, origin: string): object {
  const at = (path: string) => new URL(path, origin).toString();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: at("/") },
      { "@type": "ListItem", position: 2, name: kindName(e.kind), item: at(kindPath(e.kind)) },
      { "@type": "ListItem", position: 3, name: e.title, item: at(`/e/${e.id}`) },
    ],
  };
}

/** Every landing page's path, for the sitemap. */
export function landingPaths(kinds: readonly string[], regions: readonly string[]): string[] {
  return [...kinds.map(kindPath), ...regions.map(regionPath)];
}
