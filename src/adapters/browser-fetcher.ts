import { chromium, type Browser, type BrowserContext } from "playwright";
import type { FetchOptions, FetchPort, FetchResult } from "../ports.js";
import { memoized, TIMEOUT_MS, type PlainFetcher } from "./fetcher.js";
import { USER_AGENT } from "./identity.js";

/** What the page's own script may skip loading: none of it carries listings. */
const SKIPPED_RESOURCES = new Set(["image", "media", "font"]);

export interface BrowserFetcher extends FetchPort {
  /** Closes the browser, if a fetch launched one. */
  close(): Promise<void>;
}

/**
 * The browser fetcher, for registry sources whose listings are rendered by script: loads the page
 * in headless Chromium and returns the rendered DOM's HTML as the body. Its manners are the plain
 * fetcher's: robots.txt is asked of that fetcher, through its cache, for the URL before anything is
 * loaded, for every page navigation the page's script makes, and for the URL the page ends on (an
 * HTTP redirect hop in between is followed without a check, as a browser does); it identifies itself
 * with the job's user agent, not a stock browser's; one attempt within the same timeout, cached by URL.
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
      browser = chromium.launch({ channel });
      return (await browser).newContext({ userAgent: USER_AGENT });
    })());

  async function fetchPage(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    if (!(await plain.robotsAllows(url))) return { url, finalUrl: url, status: 0, body: "", robotsAllowed: false };
    const deadline = Date.now() + TIMEOUT_MS;
    const remaining = () => Math.max(1, deadline - Date.now());
    const page = await (await contextFor()).newPage();
    let disallowed: string | undefined;
    try {
      await page.route("**/*", async (route) => {
        const request = route.request();
        if (SKIPPED_RESOURCES.has(request.resourceType())) return route.abort();
        if (request.isNavigationRequest() && request.frame() === page.mainFrame() && !(await plain.robotsAllows(request.url()))) {
          disallowed ??= request.url();
          return route.abort("blockedbyclient");
        }
        return route.continue();
      });
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: remaining() }).catch((error: unknown) => {
        if (disallowed) return null;
        throw error;
      });
      if (disallowed) return { url, finalUrl: disallowed, status: 0, body: "", robotsAllowed: false };
      if (!response) throw new Error(`no response loading ${url}`);
      const status = response.status();
      if (status >= 200 && status < 300) {
        if (options.waitFor) await page.waitForSelector(options.waitFor, { state: "attached", timeout: remaining() });
        else await page.waitForLoadState("networkidle", { timeout: remaining() });
      }
      const finalUrl = withoutScriptFragment(page.url(), url);
      if (disallowed || !(await plain.robotsAllows(finalUrl))) {
        return { url, finalUrl: disallowed ?? finalUrl, status: 0, body: "", robotsAllowed: false };
      }
      return { url, finalUrl, status, body: await page.content(), robotsAllowed: true };
    } finally {
      await page.close();
    }
  }

  return {
    fetch: (url, options) => memoized(pages, url, () => fetchPage(url, options)),
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
