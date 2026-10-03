/**
 * The discovery lane's pure parts: the search queries a run makes, which hosts are aggregators or
 * ignored, the outbound links read off an aggregator page, and which discovery hosts to suggest for
 * promotion. The lane itself, which searches and fetches through the ports, lives in the run.
 */
import type { RunConfig } from "./config.js";
import type { Dataset } from "./dataset.js";
import type { Registry } from "./registry.js";
import type { FetchResult } from "./ports.js";
import type { RunReport } from "./report.js";

const DAY_MS = 86_400_000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Runs a discovery host must have been seen in before it is suggested for promotion. */
const PROMOTION_THRESHOLD = 2;

/**
 * The run's search queries: one per kind but the "other" escape hatch, each naming the place and
 * the months the horizon covers, e.g. "music events in Kansas City, October to November 2026".
 */
export function discoveryQueries(config: RunConfig, today: string): string[] {
  const start = new Date(`${today}T00:00:00Z`);
  const end = new Date(start.getTime() + config.horizonWeeks * 7 * DAY_MS);
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

/** The URL's host without a leading "www.", lowercased; undefined when it does not parse. */
export function hostOf(url: string): string | undefined {
  try {
    return bareHost(new URL(url).hostname);
  } catch {
    return undefined;
  }
}

function bareHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/** Whether the URL is on one of the hosts or a subdomain of one. */
export function onHost(url: string, hosts: readonly string[]): boolean {
  const host = hostOf(url);
  if (host === undefined) return false;
  return hosts.map(bareHost).some((listed) => host === listed || host.endsWith(`.${listed}`));
}

/** A search result worth following: http(s) and not on an ignored host. It may still be an aggregator. */
export function isLead(url: string, config: RunConfig): boolean {
  return /^https?:/i.test(url) && !onHost(url, config.discovery.ignoredHosts);
}

/**
 * An aggregator page read as an index: the links on it that leave the aggregator for a followable
 * host, in page order, each once, up to the configured number. Nothing else on the page is read.
 */
export function outboundLinks(page: FetchResult, config: RunConfig): string[] {
  const links: string[] = [];
  for (const [, href] of page.body.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    let url: string;
    try {
      url = new URL(href!.replace(/&amp;/g, "&"), page.finalUrl).href.replace(/#.*$/, "");
    } catch {
      continue;
    }
    if (!isLead(url, config) || onHost(url, config.discovery.aggregatorHosts) || links.includes(url)) continue;
    links.push(url);
    if (links.length >= config.discovery.linksPerAggregatorPage) break;
  }
  return links;
}

/**
 * Folds this run's discovery hosts (those whose pages yielded an active event) into the state
 * carried between runs, and lists as promotion suggestions every host seen this run that has now
 * been seen in at least two runs. A host the registry already checks, or a ticketing platform that
 * is no one source, is neither counted nor suggested. Suggestions are only ever suggestions:
 * nothing here touches the registry.
 */
export function trackDiscoveryHosts(
  previous: Dataset["discoveryState"],
  seenThisRun: Map<string, string>,
  { registry, config }: { registry: Registry; config: RunConfig },
  runIso: string,
): { discoveryState: Dataset["discoveryState"]; promotionSuggestions: RunReport["promotionSuggestions"] } {
  const registryHosts = registry.sources.flatMap((s) => s.urls.map(hostOf)).filter((h): h is string => h !== undefined);
  const neverSuggested = [...registryHosts, ...config.discovery.platformHosts];
  const discoveryState = { ...previous };
  const promotionSuggestions: RunReport["promotionSuggestions"] = [];
  for (const [host, exampleUrl] of seenThisRun) {
    if (onHost(exampleUrl, neverSuggested)) continue;
    const was = discoveryState[host];
    const runsSeen = was?.lastSeen === runIso ? was.runsSeen : (was?.runsSeen ?? 0) + 1;
    discoveryState[host] = { runsSeen, lastSeen: runIso };
    if (runsSeen >= PROMOTION_THRESHOLD) promotionSuggestions.push({ host, runsSeen, exampleUrl });
  }
  return { discoveryState, promotionSuggestions };
}
