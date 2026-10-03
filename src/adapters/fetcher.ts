import { createRequire } from "node:module";
import type { FetchPort, FetchResult } from "../ports.js";

const PRODUCT = "kc-events-research";
const REPO_URL = "https://github.com/WrongerSandwich/kc-events";
/** Named user agent carrying the repo URL, so a source owner can reach the maintainer or opt out. */
export const USER_AGENT = `${PRODUCT}/0.1 (+${REPO_URL})`;

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 15_000;

interface Robots {
  isAllowed(url: string, userAgent?: string): boolean | undefined;
}
// robots-parser is CommonJS with a default-export typing that NodeNext resolution misreads.
const robotsParser = createRequire(import.meta.url)("robots-parser") as (url: string, body: string) => Robots;

/**
 * The real fetcher. Reads and honors robots.txt per host (including on every redirect hop),
 * identifies itself, times out, and caches by URL so each page is requested at most once per
 * run. One attempt only: a failure is cached too, and the next run is the retry.
 *
 * Build one per run; the cache lives as long as the fetcher.
 */
export function createFetcher(): FetchPort {
  const pages = new Map<string, Promise<FetchResult>>();
  const robotsByOrigin = new Map<string, Promise<Robots>>();

  async function request(url: string, redirect: RequestRedirect): Promise<Response> {
    try {
      return await fetch(url, {
        redirect,
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,text/calendar,application/rss+xml,*/*;q=0.8" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      // Undici reports "fetch failed" and hides the useful part (ENOTFOUND, ECONNREFUSED) in the cause.
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause : undefined;
      if (cause) throw new Error(`${(cause as NodeJS.ErrnoException).code ?? cause.message} fetching ${url}`, { cause: error });
      throw error;
    }
  }

  const robotsFor = (url: URL) => memoized(robotsByOrigin, url.origin, loadRobots);

  // RFC 9309: a 4xx robots.txt means no rules; a 5xx or unreachable one means do not crawl.
  // We report the latter as a fetch failure rather than a block, since it is usually transient.
  async function loadRobots(origin: string): Promise<Robots> {
    const robotsUrl = `${origin}/robots.txt`;
    const response = await request(robotsUrl, "follow");
    if (response.status >= 500) throw new Error(`robots.txt unreachable (HTTP ${response.status})`);
    if (!response.ok) await response.body?.cancel();
    const body = response.ok ? await response.text() : "";
    return robotsParser(robotsUrl, body);
  }

  async function fetchPage(url: string): Promise<FetchResult> {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const target = new URL(current);
      const robots = await robotsFor(target);
      if (robots.isAllowed(target.href, PRODUCT) !== true) {
        return { url, finalUrl: current, status: 0, body: "", robotsAllowed: false };
      }
      const response = await request(current, "manual");
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel();
        current = new URL(location, current).href;
        continue;
      }
      return { url, finalUrl: current, status: response.status, body: await response.text(), robotsAllowed: true };
    }
    throw new Error(`more than ${MAX_REDIRECTS} redirects`);
  }

  return { fetch: (url) => memoized(pages, url, fetchPage) };
}

/** Get-or-start: the first caller's promise, result or failure, is what every later caller gets. */
function memoized<T>(cache: Map<string, Promise<T>>, key: string, load: (key: string) => Promise<T>): Promise<T> {
  let value = cache.get(key);
  if (!value) {
    value = load(key);
    cache.set(key, value);
  }
  return value;
}
