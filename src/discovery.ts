/**
 * The discovery lane's pure parts: the search queries a run makes, which pages are index pages and
 * which hosts are ignored, the outbound links read off an index page, and which discovery hosts to
 * suggest for promotion. The lane itself, which searches and fetches through the ports, lives in the
 * run; which host and site a URL is on is `hosts.ts`. Which links a reader could follow
 * (`linkTarget`) is decided here once, for index pages and for the links extraction numbers on a
 * primary page.
 */
import type { RunConfig } from "./config.js";
import type { Dataset, Event } from "./dataset.js";
import type { ExcludedSource, Registry, Source } from "./registry.js";
import type { FetchResult } from "./ports.js";
import type { RunReport } from "./report.js";
import { hostOf, onHost } from "./hosts.js";
import { horizonEnd } from "./time.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Runs a discovery host must have been seen in before it is suggested for promotion. */
const PROMOTION_THRESHOLD = 2;

/** A URL path ending in one of these is a stylesheet, script, font, image or file, never an event page. */
const STATIC_ASSET_PATH = /\.(css|m?js|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|ico|avif|pdf|xml|json|zip|mp3|mp4)$/i;

/**
 * An anchor's href, read attribute by attribute so a quoted value holding ">" or "href=" cannot
 * mislead it. The value is in group 1, 2 or 3 as it was double-quoted, single-quoted or bare.
 */
const ANCHOR_HREF = /<a(?:\s+(?!href\b)[^\s<>"'=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s<>"']+))?)*\s+href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;

/**
 * The run's search queries: one per kind but the "other" escape hatch, each naming the place and
 * the months the horizon covers, e.g. "music events in Kansas City, October to November 2026".
 */
export function discoveryQueries(config: RunConfig, today: string): string[] {
  const start = new Date(`${today}T00:00:00Z`);
  const end = new Date(`${horizonEnd(today, config.horizonWeeks)}T00:00:00Z`);
  const months = monthSpan(start, end);
  return config.kinds.filter((kind) => kind !== "other").map((kind) => `${kind.replace(/\//g, " and ")} events in ${config.discovery.place}, ${months}`);
}

/** "October 2026", "October to November 2026", or "December 2026 to January 2027". */
function monthSpan(start: Date, end: Date): string {
  const [startMonth, startYear] = [MONTHS[start.getUTCMonth()]!, start.getUTCFullYear()];
  const [endMonth, endYear] = [MONTHS[end.getUTCMonth()]!, end.getUTCFullYear()];
  if (startYear !== endYear) return `${startMonth} ${startYear} to ${endMonth} ${endYear}`;
  if (startMonth === endMonth) return `${startMonth} ${startYear}`;
  return `${startMonth} to ${endMonth} ${startYear}`;
}

/**
 * An index page: read only for its links to events, never as a primary page. Every page on an
 * aggregator host is one, and so is a platform page whose path is under one of that host's index
 * prefixes. Discovery and the expiry pass both decide by this, so they cannot drift.
 */
export function isIndexPage(url: string, config: RunConfig): boolean {
  if (onHost(url, config.discovery.aggregatorHosts)) return true;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  return Object.entries(config.discovery.platformIndexPaths).some(
    ([host, prefixes]) => onHost(url, [host]) && prefixes.some((prefix) => underPrefix(path, prefix)),
  );
}

/** Whether the path is the prefix or under it, at a segment boundary: "/search" covers "/search/kc" but not "/searching". */
function underPrefix(path: string, prefix: string): boolean {
  const base = prefix.replace(/\/+$/, "");
  return path === base || path.startsWith(`${base}/`);
}

/** A search result worth following: http(s) and not on an ignored host. It may still be an index page. */
export function isLead(url: string, config: RunConfig): boolean {
  return /^https?:/i.test(url) && !onHost(url, config.discovery.ignoredHosts);
}

/**
 * Where an anchor's href on the page leads, if a reader could usefully follow it: an http(s) URL,
 * resolved against the page and without its fragment, that is not a static asset, not on an
 * ignored host, and not an index page. Undefined otherwise.
 */
export function linkTarget(href: string, page: FetchResult, config: RunConfig): string | undefined {
  let url: URL;
  try {
    url = new URL(href.replace(/&amp;/g, "&"), page.finalUrl);
  } catch {
    return undefined;
  }
  url.hash = "";
  if (STATIC_ASSET_PATH.test(url.pathname)) return undefined;
  const link = url.href;
  return isLead(link, config) && !isIndexPage(link, config) ? link : undefined;
}

/**
 * An index page read for its leads: the anchors on it a person could click that go to a followable
 * page other than another index page and are not a static asset, in page order, each once, up to
 * the configured number. Nothing else on the page is read.
 */
export function outboundLinks(page: FetchResult, config: RunConfig): string[] {
  const links: string[] = [];
  for (const [, doubleQuoted, singleQuoted, bare] of page.body.matchAll(ANCHOR_HREF)) {
    const link = linkTarget(doubleQuoted || singleQuoted || bare || "", page, config);
    if (link === undefined || links.includes(link)) continue;
    links.push(link);
    if (links.length >= config.discovery.linksPerAggregatorPage) break;
  }
  return links;
}

/** The hosts these sources are on; a URL that does not parse is on none. */
function hostsOf(sources: readonly Source[]): string[] {
  return sources.flatMap((s) => s.urls.map(hostOf)).filter((h): h is string => h !== undefined);
}

/**
 * Whether a page is on a host a person has admitted (ADR 0012): an active registry source's host, a
 * subdomain of one, or a ticketing platform the config lists, whose event pages are primary pages
 * though the host is no one source. Promoting a host is adding a registry source whose URL is on it,
 * so this is also what releases the events held from it. An excluded source's host is no one's
 * admission: a person looked and said no.
 */
export function onAdmittedHost(url: string, registry: Registry, config: RunConfig): boolean {
  return onHost(url, hostsOf(registry.sources.filter((s) => s.status === "active"))) || onHost(url, config.discovery.platformHosts);
}

/**
 * The excluded registry source whose host a URL is on, or on a subdomain of, if any. Discovery never
 * follows such a lead (ADR 0012): the exclusion was a decision about the host, not about one lane.
 */
export function excludedSourceOnHost(url: string, registry: Registry): ExcludedSource | undefined {
  return registry.sources.find((s): s is ExcludedSource => s.status === "excluded" && onHost(url, hostsOf([s])));
}

/**
 * Folds this run's discovery hosts (those whose pages yielded a verified sighting, held or not) into the state
 * carried between runs, and lists as promotion suggestions every host seen this run that has now
 * been seen in at least two runs, each with how many events held for promotion (ADR 0012) promoting
 * it would release. A host the registry already checks, or a ticketing platform that
 * is no one source, is neither counted nor suggested. Suggestions are only ever suggestions:
 * nothing here touches the registry.
 */
export function trackDiscoveryHosts(
  previous: Dataset["discoveryState"],
  seenThisRun: Map<string, string>,
  { registry, config }: { registry: Registry; config: RunConfig },
  runIso: string,
  events: readonly Event[],
): { discoveryState: Dataset["discoveryState"]; promotionSuggestions: RunReport["promotionSuggestions"] } {
  const neverSuggested = [...hostsOf(registry.sources), ...config.discovery.platformHosts];
  const discoveryState = { ...previous };
  const promotionSuggestions: RunReport["promotionSuggestions"] = [];
  for (const [host, exampleUrl] of seenThisRun) {
    if (onHost(exampleUrl, neverSuggested)) continue;
    const was = discoveryState[host];
    const runsSeen = was?.lastSeen === runIso ? was.runsSeen : (was?.runsSeen ?? 0) + 1;
    discoveryState[host] = { runsSeen, lastSeen: runIso };
    if (runsSeen < PROMOTION_THRESHOLD) continue;
    const heldEvents = events.filter((e) => e.heldForPromotion && onHost(e.primaryUrl, [host])).length;
    promotionSuggestions.push({ host, runsSeen, exampleUrl, heldEvents });
  }
  return { discoveryState, promotionSuggestions };
}
