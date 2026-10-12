import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserFetcher, LAUNCH_ARGS } from "../src/adapters/browser-fetcher.js";
import { createFetchPolicy } from "../src/adapters/fetch-policy.js";
import type { PlainFetcher } from "../src/adapters/fetcher.js";

// The browser fetcher against a fake Chromium: what it asks Playwright for, and what it lets a page do.

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock("playwright", () => ({ chromium: { launch } }));

const CALENDAR = "https://venue.test/calendar";
/** A hostname the fake DNS puts on the home network. */
const LAN_HOST = "printer.lan.test";

type Outcome = "continue" | "abort";

interface FakeRequest {
  url(): string;
  resourceType(): string;
  isNavigationRequest(): boolean;
  frame(): { page(): FakePage };
  redirectedFrom(): FakeRequest | null;
}

/** What a page's script does once its document has loaded, given the means to do it. */
type Script = (page: FakePage) => Promise<void>;

class FakePage {
  closed = false;
  current = "about:blank";
  /** How long after its document loads the page's script renders what a selector waits for; never, by default. */
  renderedAfterMs = Infinity;
  private readonly main = { page: () => this };
  constructor(
    readonly context: FakeContext,
    private readonly script: Script = async () => undefined,
  ) {}
  mainFrame() {
    return this.main;
  }
  url() {
    return this.current;
  }
  /** The page asks for a URL: through the context's route, as Chromium would. */
  async request(url: string, { type = "fetch", navigation = false, frame = "main" as "main" | "child" | "unborn" } = {}): Promise<Outcome> {
    const page = this;
    const request: FakeRequest = {
      url: () => url,
      resourceType: () => type,
      isNavigationRequest: () => navigation,
      frame: () => {
        // As Playwright does for a navigation issued before its frame exists.
        if (frame === "unborn") throw new Error("Frame for this navigation request is not available");
        return frame === "main" ? page.main : { page: () => page };
      },
      redirectedFrom: () => null,
    };
    this.context.emit("request", request);
    return this.context.routeRequest(request);
  }
  /** A redirect hop after the first: Chromium follows it without asking the route. */
  redirect(from: string, to: string, { navigation = false } = {}) {
    const page = this;
    const previous: FakeRequest = { url: () => from, resourceType: () => "document", isNavigationRequest: () => navigation, frame: () => page.main, redirectedFrom: () => null };
    this.context.emit("request", { ...previous, url: () => to, redirectedFrom: () => previous });
    if (navigation) this.current = to;
  }
  async popup(): Promise<FakePage> {
    const opened = new FakePage(this.context);
    this.context.pages.push(opened);
    this.context.emit("page", opened);
    await opened.request("https://ads.test/", { navigation: true });
    return opened;
  }
  async goto(url: string) {
    if ((await this.request(url, { type: "document", navigation: true })) === "abort") throw new Error("net::ERR_BLOCKED_BY_CLIENT");
    this.current = url;
    await this.script(this);
    return { status: () => 200 };
  }
  async waitForLoadState() {}
  /** As Playwright does: the selector within the timeout, or a timeout error once it has passed, on the faked clock. */
  async waitForSelector(_selector: string, { timeout }: { timeout: number }) {
    if (!vi.isFakeTimers()) return;
    if (this.renderedAfterMs <= timeout) return void vi.setSystemTime(Date.now() + this.renderedAfterMs);
    vi.setSystemTime(Date.now() + timeout);
    throw new Error(`page.waitForSelector: Timeout ${timeout}ms exceeded.`);
  }
  async content() {
    return "<html><body>Big Show</body></html>";
  }
  async close() {
    this.closed = true;
  }
}

class FakeContext {
  closed = false;
  readonly pages: FakePage[] = [];
  readonly outcomes = new Map<string, Outcome>();
  private handler?: (route: unknown) => Promise<void>;
  private readonly listeners = new Map<string, ((value: never) => void)[]>();
  constructor(
    readonly options: unknown,
    private readonly script: Script | undefined,
    private readonly answer: (outcome: Outcome) => Promise<void>,
  ) {}
  async route(_pattern: string, handler: (route: unknown) => Promise<void>) {
    this.handler = handler;
  }
  on(event: string, listener: (value: never) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }
  emit(event: string, value: unknown) {
    for (const listener of this.listeners.get(event) ?? []) listener(value as never);
  }
  async routeRequest(request: FakeRequest): Promise<Outcome> {
    let outcome: Outcome | undefined;
    await this.handler!({
      request: () => request,
      continue: async () => this.answer((outcome = "continue")),
      abort: async () => this.answer((outcome = "abort")),
    });
    this.outcomes.set(request.url(), outcome!);
    return outcome!;
  }
  async newPage() {
    const page = new FakePage(this, this.script);
    this.pages.push(page);
    this.emit("page", page);
    return page;
  }
  async close() {
    this.closed = true;
  }
}

class FakeBrowser {
  readonly contexts: FakeContext[] = [];
  closed = false;
  constructor(
    private readonly script?: Script,
    private readonly answer: (outcome: Outcome) => Promise<void> = async () => undefined,
  ) {}
  async newContext(options: unknown) {
    const context = new FakeContext(options, this.script, this.answer);
    this.contexts.push(context);
    return context;
  }
  async close() {
    this.closed = true;
  }
}

/** A plain fetcher whose walk ends where it starts, with the real policy over a fake DNS; its pauses move the faked clock, when one is on. */
function plainFetcher({ disallowed = [] as string[] } = {}): PlainFetcher {
  const policy = createFetchPolicy({
    lookup: async (hostname) => [{ address: hostname === LAN_HOST ? "192.168.1.20" : "93.184.216.34", family: 4 }],
    sleep: async (ms) => void (vi.isFakeTimers() && vi.setSystemTime(Date.now() + ms)),
  });
  const robotsAllows = async (url: string) => !disallowed.includes(url);
  return {
    fetch: async (url) => ({ url, finalUrl: url, status: 200, body: "", robotsAllowed: await robotsAllows(url) }),
    robotsAllows,
    policy,
  };
}

function browserRunning(script?: Script, answer?: (outcome: Outcome) => Promise<void>): FakeBrowser {
  const browser = new FakeBrowser(script, answer);
  launch.mockResolvedValue(browser);
  return browser;
}

beforeEach(() => {
  launch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("browser fetcher", () => {
  it("never launches the browser for a page whose plain walk robots.txt disallows", async () => {
    const fetcher = createBrowserFetcher(plainFetcher({ disallowed: [CALENDAR] }));

    expect(await fetcher.fetch(CALENDAR)).toMatchObject({ robotsAllowed: false, finalUrl: CALENDAR });
    expect(launch).not.toHaveBeenCalled();
  });

  it("launches Chromium sandboxed and lean, and reads each page in a context of its own, closed after", async () => {
    const browser = browserRunning();
    const fetcher = createBrowserFetcher(plainFetcher());

    expect(await fetcher.fetch(CALENDAR)).toMatchObject({ status: 200, robotsAllowed: true, body: expect.stringContaining("Big Show") });
    await fetcher.fetch("https://venue.test/films");

    expect(launch).toHaveBeenCalledOnce();
    expect(launch).toHaveBeenCalledWith(expect.objectContaining({ chromiumSandbox: true, args: LAUNCH_ARGS }));
    expect(browser.contexts).toHaveLength(2);
    for (const context of browser.contexts) {
      expect(context.options).toMatchObject({ acceptDownloads: false, serviceWorkers: "block" });
      expect(context.closed).toBe(true);
    }
  });

  it("closes without launching when no page needed the browser", async () => {
    const fetcher = createBrowserFetcher(plainFetcher());

    await expect(fetcher.close()).resolves.toBeUndefined();
    expect(launch).not.toHaveBeenCalled();
  });

  it("closes the browser it launched", async () => {
    const browser = browserRunning();
    const fetcher = createBrowserFetcher(plainFetcher());

    await fetcher.fetch(CALENDAR);
    await fetcher.close();

    expect(browser.closed).toBe(true);
  });

  it("loads a page once a run for each selector it is waited on by, and once with none", async () => {
    const browser = browserRunning();
    const fetcher = createBrowserFetcher(plainFetcher());

    await fetcher.fetch(CALENDAR);
    await fetcher.fetch(CALENDAR);
    await fetcher.fetch(CALENDAR, { waitFor: ".event" });
    await fetcher.fetch(CALENDAR, { waitFor: ".event" });
    await fetcher.fetch(CALENDAR, { waitFor: ".show" });

    expect(browser.contexts).toHaveLength(3);
  });

  it("reads a page whose listings render more than 15 s after it loads, within its own 30 s deadline", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    browserRunning(async (page) => void (page.renderedAfterMs = 25_000));
    const fetcher = createBrowserFetcher(plainFetcher());

    expect(await fetcher.fetch(CALENDAR, { waitFor: ".event" })).toMatchObject({ status: 200, body: expect.stringContaining("Big Show") });
  });

  it("fails a page whose listings never render, after 30 s, naming the timeout", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    browserRunning();
    const fetcher = createBrowserFetcher(plainFetcher());
    const started = Date.now();

    await expect(fetcher.fetch(CALENDAR, { waitFor: ".event" })).rejects.toThrow("Timeout 30000ms exceeded");
    expect(Date.now() - started).toBe(30_000);
  });

  it("starts the page's deadline once its origin's crawl delay has passed, not before", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    browserRunning(async (page) => void (page.renderedAfterMs = 25_000));
    const plain = plainFetcher();
    // The plain walk of the same URL has just booked the origin, which asks for 10 s between requests.
    plain.policy.setCrawlDelay(new URL(CALENDAR).origin, 10);
    await plain.policy.pace(new URL(CALENDAR));
    const fetcher = createBrowserFetcher(plain);
    const started = Date.now();

    expect(await fetcher.fetch(CALENDAR, { waitFor: ".event" })).toMatchObject({ status: 200 });
    expect(Date.now() - started).toBe(35_000);
  });

  it("closes a popup the page opens and loads nothing for it", async () => {
    let popup: FakePage | undefined;
    const browser = browserRunning(async (page) => {
      popup = await page.popup();
    });

    await createBrowserFetcher(plainFetcher()).fetch(CALENDAR);

    expect(popup!.closed).toBe(true);
    expect(browser.contexts[0]!.outcomes.get("https://ads.test/")).toBe("abort");
    expect(browser.contexts[0]!.pages[0]!.closed).toBe(false); // the page asked for is read, not closed as a popup
  });

  it("aborts a request to a private host, a literal IP or a frame's navigation, and lets the page's public requests through", async () => {
    const browser = browserRunning(async (page) => {
      await page.request(`http://${LAN_HOST}/status`);
      await page.request("http://192.168.1.1/");
      await page.request("http://router.local/");
      await page.request("https://widgets.test/frame", { navigation: true, frame: "child" });
      await page.request("https://api.venue.test/events.json");
    });

    expect(await createBrowserFetcher(plainFetcher()).fetch(CALENDAR)).toMatchObject({ status: 200 });

    expect(Object.fromEntries(browser.contexts[0]!.outcomes)).toEqual({
      [CALENDAR]: "continue",
      [`http://${LAN_HOST}/status`]: "abort",
      "http://192.168.1.1/": "abort",
      "http://router.local/": "abort",
      "https://widgets.test/frame": "abort",
      "https://api.venue.test/events.json": "continue",
    });
  });

  it("aborts a navigation Playwright cannot place in a frame yet, and still answers its route", async () => {
    const browser = browserRunning(async (page) => {
      await page.request("https://ads.test/opened", { navigation: true, frame: "unborn" });
    });

    expect(await createBrowserFetcher(plainFetcher()).fetch(CALENDAR)).toMatchObject({ status: 200 });
    expect(browser.contexts[0]!.outcomes.get("https://ads.test/opened")).toBe("abort");
  });

  it("fails the fetch when the page's own navigation redirects to a private address", async () => {
    browserRunning(async (page) => {
      page.redirect(CALENDAR, "http://192.168.1.1/admin", { navigation: true });
    });

    await expect(createBrowserFetcher(plainFetcher()).fetch(CALENDAR)).rejects.toThrow(/192\.168\.1\.1/);
  });

  it("warns, and still reads the page, when something the page loads redirects to a private address", async () => {
    browserRunning(async (page) => {
      page.redirect("https://cdn.test/pixel", "http://192.168.1.1/admin");
    });
    const warn = vi.fn();

    expect(await createBrowserFetcher(plainFetcher(), { warn }).fetch(CALENDAR)).toMatchObject({ status: 200, robotsAllowed: true });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^WARNING: .* redirected to http:\/\/192\.168\.1\.1\/admin/));
  });

  it("blocks a page whose own navigation redirects to a URL robots.txt disallows", async () => {
    browserRunning(async (page) => {
      page.redirect(CALENDAR, "https://venue.test/private", { navigation: true });
    });

    expect(await createBrowserFetcher(plainFetcher({ disallowed: ["https://venue.test/private"] })).fetch(CALENDAR)).toMatchObject({
      robotsAllowed: false,
      finalUrl: "https://venue.test/private",
    });
  });

  it("blocks a page whose script has navigated, after it loaded, to a URL robots.txt disallows", async () => {
    browserRunning(async (page) => {
      page.current = "https://venue.test/members";
    });

    expect(await createBrowserFetcher(plainFetcher({ disallowed: ["https://venue.test/members"] })).fetch(CALENDAR)).toMatchObject({
      robotsAllowed: false,
      finalUrl: "https://venue.test/members",
    });
  });

  it("reads the page even when a route cannot be answered because its page closed meanwhile", async () => {
    browserRunning(
      async (page) => {
        await page.request("https://api.venue.test/late.json");
      },
      async (outcome) => {
        if (outcome === "continue") throw new Error("Target page, context or browser has been closed");
      },
    );

    expect(await createBrowserFetcher(plainFetcher()).fetch(CALENDAR)).toMatchObject({ status: 200, robotsAllowed: true });
  });

  it("runs without the sandbox, warning loudly, on a host that cannot give it one", async () => {
    const browser = new FakeBrowser();
    launch.mockRejectedValueOnce(new Error("No usable sandbox!\nmore detail")).mockResolvedValueOnce(browser);
    const warn = vi.fn();

    expect(await createBrowserFetcher(plainFetcher(), { warn }).fetch(CALENDAR)).toMatchObject({ status: 200 });

    expect(launch).toHaveBeenLastCalledWith(expect.objectContaining({ chromiumSandbox: false }));
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^WARNING: Chromium's sandbox did not start \(No usable sandbox!\)/));
  });

  it("fails every browser fetch of the run, saying the browser did not launch, when it cannot launch at all", async () => {
    launch.mockImplementation(async () => {
      throw new Error("Executable doesn't exist at /home/x/.cache/ms-playwright\nRun playwright install");
    });
    const fetcher = createBrowserFetcher(plainFetcher(), { warn: () => undefined });
    await expect(fetcher.fetch(CALENDAR)).rejects.toThrow("the browser did not launch: Executable doesn't exist at /home/x/.cache/ms-playwright");
    await expect(fetcher.fetch("https://venue.test/films")).rejects.toThrow("the browser did not launch");
    expect(launch).toHaveBeenCalledOnce(); // not without the sandbox, which was not what failed; and once for the run
  });

  it("fails, saying the browser did not launch, when it launches neither in its sandbox nor out of it", async () => {
    launch.mockRejectedValueOnce(new Error("No usable sandbox!")).mockRejectedValueOnce(new Error("Missing libnss3.so"));

    await expect(createBrowserFetcher(plainFetcher(), { warn: () => undefined }).fetch(CALENDAR)).rejects.toThrow(
      "the browser did not launch: Missing libnss3.so",
    );
  });
});
