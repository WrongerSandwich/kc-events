import { chromium, type Browser, type Page, type Request } from "playwright";
import type { FetchOptions, FetchPort, FetchResult } from "../ports.js";
import { checkSize } from "./fetch-policy.js";
import { memoized, type PlainFetcher } from "./fetcher.js";
import { USER_AGENT } from "./identity.js";

/** What the page's own script may skip loading: none of it carries listings. */
const SKIPPED_RESOURCES = new Set(["image", "media", "font"]);
/**
 * One page's deadline, from the end of its origin's pause to its HTML read: the load, then the
 * selector or the network going quiet. Longer than the plain fetcher's, since rendering a calendar
 * takes seconds the plain request does not (Screenland's, about 7).
 */
const PAGE_TIMEOUT_MS = 30_000;
/** Launching Chromium is not part of a page's timeout, but is bounded too. */
const LAUNCH_TIMEOUT_MS = 30_000;
/** How Chromium says it could not start its sandbox ("No usable sandbox!", a user namespace it could not make). */
const SANDBOX_FAILURE = /sandbox|namespace/i;
/** Nothing a calendar needs: no extensions, no background requests of the browser's own, a bounded script heap. */
export const LAUNCH_ARGS = ["--disable-extensions", "--disable-background-networking", "--js-flags=--max-old-space-size=512"];

export interface BrowserFetcher extends FetchPort {
  /** Closes the browser, if a fetch launched one. */
  close(): Promise<void>;
}

export interface BrowserFetcherOptions {
  /** An installed browser ("chrome") over Playwright's own Chromium. */
  channel?: string;
  /** Where a warning goes that the run's log should carry (the browser runs without its sandbox). */
  warn?: (message: string) => void;
}

/**
 * The browser fetcher, for registry sources whose listings are rendered by script: loads the page
 * in headless Chromium and returns the rendered DOM's HTML as the body. Its manners are the plain
 * fetcher's: that fetcher requests the URL first and walks its redirects, robots.txt and all, and the
 * browser loads the page they end on; robots.txt is asked again, through the same cache, before any
 * navigation the page's script makes, at every redirect hop of one, and for the URL the page ends on
 * (what the page itself loads, its scripts and data, is not a page the job asked for). The plain
 * fetcher's policy holds too: no request the page makes goes to a host on the machine's own network,
 * the load waits its origin's crawl delay, and a rendered page over the byte budget is refused. It
 * identifies itself with the job's user agent, not a stock browser's; one attempt within a 30 s
 * deadline of its own, twice the plain fetcher's and started once the crawl delay has passed, cached
 * by URL and selector.
 *
 * The page runs a stranger's script, so it is given little: Chromium's sandbox wherever the host can
 * provide one (a loud warning where it cannot), and a context of its own per fetch, with no
 * downloads, no service workers, and nothing kept from the page before. A popup is closed as it
 * opens and a frame's navigation is refused: neither is the page asked for, and only the main
 * frame's HTML is read. Playwright's route sees only the first URL of a redirect chain, so a hop
 * after it can only be checked once it has gone out: a hop of the page's own navigation that the
 * checks refuse fails the fetch, and one of anything the page loads is logged as a warning.
 *
 * The page is read once the network has gone quiet, or, given a selector, once that selector is on
 * the page; a page that does neither in time is a failure, not a partial reading. The browser is
 * launched on the first fetch, so a run with no browser source never starts one; a launch that fails
 * is not tried again, and every browser fetch of that run fails saying so.
 *
 * The URL it reports the page ended on drops a fragment the page's script set (a schedule that
 * writes today's date into the hash, say): that is the page's state, not where it is, and it would
 * give the same page a new URL every run.
 *
 * Build one per run, and close it when the run is done.
 */
export function createBrowserFetcher(plain: PlainFetcher, { channel, warn = console.warn }: BrowserFetcherOptions = {}): BrowserFetcher {
  const pages = new Map<string, Promise<FetchResult>>();
  let browser: Promise<Browser> | undefined;

  async function fetchPage(url: string, options: FetchOptions): Promise<FetchResult> {
    const blocked = (at: string): FetchResult => ({ url, finalUrl: at, status: 0, body: "", robotsAllowed: false });
    // The plain fetcher walks the redirects first, asking robots.txt at every hop, so the browser goes
    // straight to where they end.
    const walked = await plain.fetch(url);
    if (!walked.robotsAllowed) return blocked(walked.finalUrl);
    browser ??= launch(channel, warn);
    const context = await (await browser).newContext({ userAgent: USER_AGENT, acceptDownloads: false, serviceWorkers: "block" });
    // Set once the origin's pause is over, so waiting to be polite does not count against the page.
    let deadline = Infinity;
    const remaining = () => Math.max(1, deadline - Date.now());
    let page: Page | undefined;
    // Why the page's own navigation stopped, if a check below stopped it: a disallowed URL, or a
    // robots.txt that could not be read, or a URL the fetch policy refuses.
    let disallowed: string | undefined;
    let navigationFailure: unknown;
    const hopChecks: Promise<unknown>[] = [];
    // Waits for every hop check so far, including any started while it waited.
    const hopsChecked = async () => {
      for (let done = 0; done < hopChecks.length; ) {
        const pending = hopChecks.slice(done);
        done = hopChecks.length;
        await Promise.all(pending);
      }
    };
    // Which of the page's frames made a request. One Playwright cannot place (a navigation that opens
    // a popup, before its frame exists) is not the page's.
    const madeBy = (request: Request): "main" | "frame" | "elsewhere" => {
      try {
        const frame = request.frame();
        if (!page || frame.page() !== page) return "elsewhere";
        return frame === page.mainFrame() ? "main" : "frame";
      } catch {
        return "elsewhere";
      }
    };

    // A navigation of the main frame: the policy, then robots.txt. A refusal is recorded, not thrown.
    async function navigationAllowed(target: string): Promise<boolean> {
      try {
        await plain.policy.check(new URL(target));
        if (await plain.robotsAllows(target)) return true;
        disallowed ??= target;
      } catch (error) {
        navigationFailure ??= error;
      }
      return false;
    }

    try {
      await context.route("**/*", async (route) => {
        const request = route.request();
        const by = madeBy(request);
        let allowed: boolean;
        if (SKIPPED_RESOURCES.has(request.resourceType())) allowed = false;
        else if (by === "elsewhere") allowed = false; // a popup's, closing anyway
        else if (request.isNavigationRequest()) allowed = by === "main" && (await navigationAllowed(request.url())); // a frame's is never read
        else allowed = await subresourceAllowed(plain, request.url());
        // The page may have closed while the checks ran, and a closed page's route cannot be answered.
        await (allowed ? route.continue() : route.abort("blockedbyclient")).catch(() => undefined);
      });
      // Every redirect hop after the first, which the route above never sees and which has gone out by
      // the time it is seen here. One of the page's own navigation is held to the route's checks; one of
      // anything the page loads is only logged, since a tracker that redirects badly is not the page.
      context.on("request", (request) => {
        if (!request.redirectedFrom()) return;
        const hop = request.url();
        if (request.isNavigationRequest() && madeBy(request) === "main") hopChecks.push(navigationAllowed(hop));
        else {
          hopChecks.push(
            subresourceAllowed(plain, hop).then((allowed) => {
              if (!allowed) warn(`WARNING: a request made by ${walked.finalUrl} was redirected to ${hop}, which the fetch policy refuses`);
            }),
          );
        }
      });
      page = await context.newPage();
      const ours = page;
      context.on("page", (opened) => {
        if (opened !== ours) void opened.close().catch(() => undefined);
      });

      await plain.policy.pace(new URL(walked.finalUrl));
      deadline = Date.now() + PAGE_TIMEOUT_MS;
      const response = await page.goto(walked.finalUrl, { waitUntil: "domcontentloaded", timeout: remaining() }).catch((error: unknown) => {
        if (disallowed || navigationFailure) return null;
        throw error;
      });
      await hopsChecked();
      if (disallowed) return blocked(disallowed);
      if (navigationFailure) throw navigationFailure;
      if (!response) throw new Error(`no response loading ${url}`);
      const status = response.status();
      if (status >= 200 && status < 300) {
        if (options.waitFor) await page.waitForSelector(options.waitFor, { state: "attached", timeout: remaining() });
        else await page.waitForLoadState("networkidle", { timeout: remaining() });
      }
      // The page's script may have navigated since it loaded, so where it is now is asked again.
      const ended = page.url();
      await navigationAllowed(ended);
      const body = await page.content();
      await hopsChecked();
      if (disallowed) return blocked(disallowed);
      if (navigationFailure) throw navigationFailure;
      checkSize(body);
      return { url, finalUrl: withoutScriptFragment(ended, url), status, body, robotsAllowed: true };
    } finally {
      // A context that will not close (the browser crashed) must not hide why the fetch failed.
      await context.close().catch(() => undefined);
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

/** Whether the page may load a subresource: an http(s) URL the fetch policy allows, or one with no host to ask about (`data:`). */
async function subresourceAllowed(plain: PlainFetcher, target: string): Promise<boolean> {
  const parsed = new URL(target);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return true;
  try {
    await plain.policy.check(parsed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Chromium, sandboxed if the host allows it. A host without unprivileged user namespaces cannot give
 * it a sandbox; it then runs without one, and says so loudly, since a page's script would run as
 * the run's own user. Any other failure, or one without the sandbox too, throws, and that is the
 * reason every browser fetch of the run reports.
 */
async function launch(channel: string | undefined, warn: (message: string) => void): Promise<Browser> {
  const options = { channel, timeout: LAUNCH_TIMEOUT_MS, args: LAUNCH_ARGS };
  const didNotLaunch = (error: unknown) => new Error(`the browser did not launch: ${firstLine(error)}`, { cause: error });
  try {
    return await chromium.launch({ ...options, chromiumSandbox: true });
  } catch (sandboxed) {
    // Only the sandbox failing is a reason to go without it: a launch that timed out or crashed is not.
    if (!SANDBOX_FAILURE.test(String(sandboxed))) throw didNotLaunch(sandboxed);
    let browser: Browser;
    try {
      browser = await chromium.launch({ ...options, chromiumSandbox: false });
    } catch (error) {
      throw didNotLaunch(error);
    }
    warn(
      `WARNING: Chromium's sandbox did not start (${firstLine(sandboxed)}), so pages from fetch: browser sources ` +
        "run unsandboxed as this user. Enable unprivileged user namespaces; scripts/home-run-setup.sh checks for them.",
    );
    return browser;
  }
}

function firstLine(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split("\n")[0]!;
}

/** The URL the page ended on, less any fragment the requested URL did not carry. */
function withoutScriptFragment(finalUrl: string, requested: string): string {
  const ended = new URL(finalUrl);
  if (ended.hash !== new URL(requested).hash) ended.hash = "";
  return ended.href;
}
