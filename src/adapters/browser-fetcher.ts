import { chromium, type Browser, type BrowserContext } from "playwright";
import type { FetchOptions, FetchPort, FetchResult } from "../ports.js";
import { memoized, TIMEOUT_MS, type PlainFetcher } from "./fetcher.js";
import { USER_AGENT } from "./identity.js";

/** What the page's own script may skip loading: none of it carries listings. */
const SKIPPED_RESOURCES = new Set(["image", "media", "font"]);
/** Launching Chromium is not part of a page's timeout, but is bounded too. */
const LAUNCH_TIMEOUT_MS = 30_000;

export interface BrowserFetcher extends FetchPort {
  /** Closes the browser, if a fetch launched one. */
  close(): Promise<void>;
}

/**
 * The browser fetcher, for registry sources whose listings are rendered by script: loads the page
 * in headless Chromium and returns the rendered DOM's HTML as the body. Its manners are the plain
 * fetcher's: that fetcher requests the URL first and walks its redirects, robots.txt and all, and the
 * browser loads the page they end on; robots.txt is asked again, through the same cache, before any
 * navigation the page's script makes and for the URL the page ends on (what the page itself loads,
 * its scripts and data, is not a page the job asked for). It identifies itself with the job's user
 * agent, not a stock browser's; one attempt within the same timeout, cached by URL and selector.
 *
 * The page is read once the network has gone quiet, or, given a selector, once that selector is on
 * the page; a page that does neither in time is a failure, not a partial reading. The browser is
 * launched on the first fetch, so a run with no browser source never starts one. `channel` picks
 * an installed browser ("chrome") over Playwright's own Chromium.
 *
 * The URL it reports the page ended on drops a fragment the page's script set (a schedule that
 * writes today's date into the hash, say): that is the page's state, not where it is, and it would
 * give the same page a new URL every run.
 *
 * Build one per run, and close it when the run is done.
 */
export function createBrowserFetcher(plain: PlainFetcher, { channel }: { channel?: string } = {}): BrowserFetcher {
  const pages = new Map<string, Promise<FetchResult>>();
  let context: Promise<BrowserContext> | undefined;
  let browser: Promise<Browser> | undefined;

  const contextFor = () =>
    (context ??= (async () => {
      browser = chromium.launch({ channel, timeout: LAUNCH_TIMEOUT_MS });
      return (await browser).newContext({ userAgent: USER_AGENT });
    })());

  async function fetchPage(url: string, options: FetchOptions): Promise<FetchResult> {
    const blocked = (at: string): FetchResult => ({ url, finalUrl: at, status: 0, body: "", robotsAllowed: false });
    // The plain fetcher walks the redirects first, asking robots.txt at every hop, so the browser goes
    // straight to where they end: a browser follows a redirect without letting anyone check the hop.
    const walked = await plain.fetch(url);
    if (!walked.robotsAllowed) return blocked(walked.finalUrl);
    const page = await (await contextFor()).newPage();
    const deadline = Date.now() + TIMEOUT_MS;
    const remaining = () => Math.max(1, deadline - Date.now());
    // Why the page's own navigation stopped, if the route below stopped it: a disallowed URL, or a robots.txt that could not be read.
    let disallowed: string | undefined;
    let robotsFailure: unknown;
    try {
      await page.route("**/*", async (route) => {
        const request = route.request();
        if (SKIPPED_RESOURCES.has(request.resourceType())) return route.abort();
        if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) return route.continue();
        try {
          if (await plain.robotsAllows(request.url())) return route.continue();
          disallowed ??= request.url();
          return route.abort("blockedbyclient");
        } catch (error) {
          robotsFailure ??= error;
          return route.abort("failed");
        }
      });
      const response = await page.goto(walked.finalUrl, { waitUntil: "domcontentloaded", timeout: remaining() }).catch((error: unknown) => {
        if (disallowed || robotsFailure) return null;
        throw error;
      });
      if (disallowed) return blocked(disallowed);
      if (robotsFailure) throw robotsFailure;
      if (!response) throw new Error(`no response loading ${url}`);
      const status = response.status();
      if (status >= 200 && status < 300) {
        if (options.waitFor) await page.waitForSelector(options.waitFor, { state: "attached", timeout: remaining() });
        else await page.waitForLoadState("networkidle", { timeout: remaining() });
      }
      if (disallowed) return blocked(disallowed);
      if (robotsFailure) throw robotsFailure;
      return { url, finalUrl: withoutScriptFragment(page.url(), url), status, body: await page.content(), robotsAllowed: true };
    } finally {
      // A page that will not close (the browser crashed) must not hide why the fetch failed.
      await page.close().catch(() => undefined);
    }
  }

  return {
    fetch: (url, options = {}) => memoized(pages, JSON.stringify([url, options.waitFor]), () => fetchPage(url, options)),
    async close() {
      // A launch that failed has nothing to close; every fetch already reported why.
      const launched = await browser?.catch(() => undefined);
      await launched?.close();
    },
  };
}

/** The URL the page ended on, less any fragment the requested URL did not carry. */
function withoutScriptFragment(finalUrl: string, requested: string): string {
  const ended = new URL(finalUrl);
  if (ended.hash !== new URL(requested).hash) ended.hash = "";
  return ended.href;
}
