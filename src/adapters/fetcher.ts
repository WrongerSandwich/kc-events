import { createRequire } from "node:module";
import type { FetchPort, FetchResult } from "../ports.js";
import { checkContentType, createFetchPolicy, decodeBody, readCapped, type FetchPolicy, type FetchPolicyOptions } from "./fetch-policy.js";
import { PRODUCT, USER_AGENT } from "./identity.js";

const MAX_REDIRECTS = 5;
/** How long one page may take, for either fetcher. */
export const TIMEOUT_MS = 15_000;

interface Robots {
  isAllowed(url: string, userAgent?: string): boolean | undefined;
  getCrawlDelay(userAgent?: string): number | undefined;
}
// robots-parser is CommonJS with a default-export typing that NodeNext resolution misreads.
const robotsParser = createRequire(import.meta.url)("robots-parser") as (url: string, body: string) => Robots;

/**
 * The real fetcher. Reads and honors robots.txt per host (including on every redirect hop),
 * identifies itself, times out, and caches by URL so each page is requested at most once per
 * run. One attempt only: a failure is cached too, and the next run is the retry. Every request,
 * robots.txt and redirect hops included, goes through the fetch policy (`fetch-policy.ts`): it is
 * refused unless its host is public, it waits its origin's crawl delay, and a page's body is read
 * within a byte budget, in a readable content type, and in its own charset.
 *
 * Build one per run; the cache lives as long as the fetcher. The browser fetcher asks this one
 * whether robots.txt allows a URL, so both share one robots.txt cache, and uses its policy, so both
 * share one per-origin pace.
 */
export function createFetcher(options: FetchPolicyOptions = {}): PlainFetcher {
  const policy = createFetchPolicy(options);
  const pages = new Map<string, Promise<FetchResult>>();
  const robotsByOrigin = new Map<string, Promise<Robots>>();

  async function request(url: string): Promise<Response> {
    const target = new URL(url);
    await policy.check(target);
    await policy.pace(target);
    try {
      return await fetch(url, {
        redirect: "manual",
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
  const robotsAllows = async (url: URL) => (await robotsFor(url)).isAllowed(url.href, PRODUCT) === true;

  // RFC 9309: a 4xx robots.txt means no rules; a 5xx or unreachable one means do not crawl.
  // We report the latter as a fetch failure rather than a block, since it is usually transient.
  // Its redirects are followed (five, as the RFC asks) through the policy, like a page's.
  async function loadRobots(origin: string): Promise<Robots> {
    const robotsUrl = `${origin}/robots.txt`;
    let current = robotsUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const response = await request(current);
      const next = redirectOf(response, current);
      if (next) {
        await response.body?.cancel();
        current = next;
        continue;
      }
      if (response.status >= 500) {
        await response.body?.cancel();
        throw new Error(`robots.txt unreachable (HTTP ${response.status})`);
      }
      let body = "";
      if (response.ok) body = new TextDecoder("utf-8").decode(await readCapped(response));
      else await response.body?.cancel();
      const robots = robotsParser(robotsUrl, body);
      policy.setCrawlDelay(origin, robots.getCrawlDelay(PRODUCT));
      return robots;
    }
    throw new Error(`robots.txt unreachable (more than ${MAX_REDIRECTS} redirects)`);
  }

  async function fetchPage(url: string): Promise<FetchResult> {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const target = new URL(current);
      // The policy before robots.txt: a refused host's robots.txt is not requested either.
      await policy.check(target);
      if (!(await robotsAllows(target))) {
        return { url, finalUrl: current, status: 0, body: "", robotsAllowed: false };
      }
      const response = await request(current);
      const next = redirectOf(response, current);
      if (next) {
        await response.body?.cancel();
        current = next;
        continue;
      }
      // A failing status is the whole reading; nothing reads its body, so it is not downloaded.
      if (!response.ok) {
        await response.body?.cancel();
        return { url, finalUrl: current, status: response.status, body: "", robotsAllowed: true };
      }
      try {
        checkContentType(response);
      } catch (error) {
        await response.body?.cancel();
        throw error;
      }
      const body = decodeBody(await readCapped(response),response.headers.get("content-type"));
      return { url, finalUrl: current, status: response.status, body, robotsAllowed: true };
    }
    throw new Error(`more than ${MAX_REDIRECTS} redirects`);
  }

  return {
    fetch: (url) => memoized(pages, url, fetchPage),
    robotsAllows: (url) => robotsAllows(new URL(url)),
    policy,
  };
}

/** Where a 3xx sends the request, or nothing for any other response. */
function redirectOf(response: Response, from: string): string | undefined {
  const location = response.headers.get("location");
  return response.status >= 300 && response.status < 400 && location ? new URL(location, from).href : undefined;
}

export interface PlainFetcher extends FetchPort {
  /** Whether robots.txt lets the job fetch this URL; throws when robots.txt cannot be reached. */
  robotsAllows(url: string): Promise<boolean>;
  /** The run's fetch policy, for the browser fetcher's own requests. */
  policy: FetchPolicy;
}

/** Get-or-start: the first caller's promise, result or failure, is what every later caller gets. */
export function memoized<T>(cache: Map<string, Promise<T>>, key: string, load: (key: string) => Promise<T>): Promise<T> {
  let value = cache.get(key);
  if (!value) {
    value = load(key);
    cache.set(key, value);
  }
  return value;
}
