import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchRefused } from "../src/adapters/fetch-policy.js";
import { createFetcher, TIMEOUT_MS } from "../src/adapters/fetcher.js";
import { USER_AGENT } from "../src/adapters/identity.js";
import { readPage } from "../src/extraction.js";
import { cannedFetcher, type CannedPage } from "./fakes/ports.js";
import { testConfig } from "./fakes/config.js";
import { html, NO_ROBOTS, recordedBody, recordedPage, recordedRobots, redirect, robots, routes, status, type Routes } from "./fakes/network.js";

// The plain fetcher against a stubbed network: robots.txt, redirects, its cache, and how it fails.

const CALENDAR = "https://venue.test/calendar";
const VENUE_ROBOTS = "https://venue.test/robots.txt";

/** The real fetcher over a public fake DNS and no pauses, so only robots.txt and redirects decide. */
const fetcher = () => createFetcher({ lookup: async () => [{ address: "93.184.215.14", family: 4 }], sleep: async () => undefined });

/** The venue's calendar behind this robots.txt. */
const venue = (robotsRoute: Routes[string], page: Routes[string] = html("<p>Shows</p>")): Routes => ({ [VENUE_ROBOTS]: robotsRoute, [CALENDAR]: page });

afterEach(() => vi.unstubAllGlobals());

describe("plain fetcher: robots.txt", () => {
  it("does not request a page its robots.txt disallows, and says so", async () => {
    const { urls } = routes(venue(recordedRobots("disallows-us")));

    expect(await fetcher().fetch(CALENDAR)).toEqual({ url: CALENDAR, finalUrl: CALENDAR, status: 0, body: "", robotsAllowed: false });
    expect(urls).toEqual([VENUE_ROBOTS]);
  });

  it("fetches a page a robots.txt disallows only to other crawlers", async () => {
    routes(venue(recordedRobots("disallows-others")));
    expect(await fetcher().fetch(CALENDAR)).toMatchObject({ status: 200, body: "<p>Shows</p>", robotsAllowed: true });
  });

  it("reads a 404 robots.txt as no rules, and fetches the page", async () => {
    const { urls } = routes(venue(NO_ROBOTS));

    expect(await fetcher().fetch(CALENDAR)).toMatchObject({ status: 200, robotsAllowed: true });
    expect(urls).toEqual([VENUE_ROBOTS, CALENDAR]);
  });

  it("rejects, without requesting the page, when robots.txt answers with a server error", async () => {
    const { urls } = routes(venue(status(503)));

    await expect(fetcher().fetch(CALENDAR)).rejects.toThrow("robots.txt unreachable (HTTP 503)");
    expect(urls).toEqual([VENUE_ROBOTS]);
  });

  it("asks a redirect's new origin for its own robots.txt, and stops where that one disallows", async () => {
    const moved = "https://tickets.test/calendar";
    const { urls } = routes({
      [VENUE_ROBOTS]: NO_ROBOTS,
      [CALENDAR]: redirect(moved),
      "https://tickets.test/robots.txt": robots("User-agent: *\nDisallow: /calendar\n"),
    });

    expect(await fetcher().fetch(CALENDAR)).toEqual({ url: CALENDAR, finalUrl: moved, status: 0, body: "", robotsAllowed: false });
    expect(urls).toEqual([VENUE_ROBOTS, CALENDAR, "https://tickets.test/robots.txt"]);
  });

  it("waits robots.txt's crawl delay between two requests to its origin", async () => {
    routes({ ...venue(recordedRobots("crawl-delay")), "https://venue.test/about": html("<p>About</p>") });
    const slept: number[] = [];
    let clock = 0;
    const plain = createFetcher({
      lookup: async () => [{ address: "93.184.215.14", family: 4 }],
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    });

    await plain.fetch(CALENDAR);
    await plain.fetch("https://venue.test/about");

    // The page waits the default second after robots.txt, read before its delay was known.
    expect(slept).toEqual([1_000, 3_000]);
  });

  it("asks each origin for robots.txt once a run", async () => {
    const { urls } = routes({ ...venue(NO_ROBOTS), "https://venue.test/about": html("<p>About</p>") });
    const plain = fetcher();

    await plain.fetch(CALENDAR);
    await plain.fetch("https://venue.test/about");
    expect(await plain.robotsAllows("https://venue.test/members")).toBe(true);
    expect(urls.filter((u) => u === VENUE_ROBOTS)).toHaveLength(1);
  });
});

describe("plain fetcher: redirects", () => {
  it("follows a relative Location against the URL that sent it", async () => {
    const { urls } = routes({ ...venue(NO_ROBOTS, redirect("events/?view=list", 302)), "https://venue.test/events/?view=list": html("<p>List</p>") });

    expect(await fetcher().fetch(CALENDAR)).toEqual({
      url: CALENDAR,
      finalUrl: "https://venue.test/events/?view=list",
      status: 200,
      body: "<p>List</p>",
      robotsAllowed: true,
    });
    expect(urls).toEqual([VENUE_ROBOTS, CALENDAR, "https://venue.test/events/?view=list"]);
  });

  it("follows five redirects and rejects the sixth", async () => {
    const hop = (n: number) => `https://venue.test/hop/${n}`;
    const chain = (length: number): Routes => ({
      [VENUE_ROBOTS]: NO_ROBOTS,
      ...Object.fromEntries(Array.from({ length }, (_, n) => [hop(n), redirect(hop(n + 1))])),
      [hop(length)]: html("<p>End</p>"),
    });

    routes(chain(5));
    expect(await fetcher().fetch(hop(0))).toMatchObject({ finalUrl: hop(5), status: 200 });

    routes(chain(6));
    await expect(fetcher().fetch(hop(0))).rejects.toThrow("more than 5 redirects");
  });

  it("reports a 3xx with no Location as the page's status", async () => {
    routes(venue(NO_ROBOTS, () => new Response(null, { status: 304 })));
    expect(await fetcher().fetch(CALENDAR)).toEqual({ url: CALENDAR, finalUrl: CALENDAR, status: 304, body: "", robotsAllowed: true });
  });
});

describe("plain fetcher: requests and the cache", () => {
  it("names itself in the user agent and times out after 15 seconds", async () => {
    const timeouts = vi.spyOn(AbortSignal, "timeout");
    const { requests } = routes(venue(NO_ROBOTS));

    await fetcher().fetch(CALENDAR);

    expect(requests.map((r) => r.headers.get("user-agent"))).toEqual([USER_AGENT, USER_AGENT]);
    expect(timeouts).toHaveBeenCalledWith(TIMEOUT_MS);
    expect(TIMEOUT_MS).toBe(15_000);
  });

  it("requests a page once a run, however often it is fetched", async () => {
    const { urls } = routes(venue(NO_ROBOTS));
    const plain = fetcher();

    const [first, second] = await Promise.all([plain.fetch(CALENDAR), plain.fetch(CALENDAR)]);
    const third = await plain.fetch(CALENDAR);

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(urls.filter((u) => u === CALENDAR)).toHaveLength(1);
  });

  it("caches a failure too: the next run is the retry", async () => {
    const { urls } = routes({ [VENUE_ROBOTS]: NO_ROBOTS });
    const plain = fetcher();

    await expect(plain.fetch(CALENDAR)).rejects.toThrow();
    await expect(plain.fetch(CALENDAR)).rejects.toThrow();
    expect(urls.filter((u) => u === CALENDAR)).toHaveLength(1);
  });

  it("says why a connection failed, not only that the fetch did", async () => {
    routes({ [VENUE_ROBOTS]: NO_ROBOTS });
    await expect(fetcher().fetch(CALENDAR)).rejects.toThrow(`ECONNREFUSED fetching ${CALENDAR}`);
  });

  it("rethrows a failure that carries no cause as it came", async () => {
    routes({ [VENUE_ROBOTS]: NO_ROBOTS, [CALENDAR]: () => new DOMException("The operation was aborted due to timeout", "TimeoutError") });
    await expect(fetcher().fetch(CALENDAR)).rejects.toThrow("aborted due to timeout");
  });
});

describe("plain fetcher: recorded pages", () => {
  it.each([
    ["recordbar", "https://www.therecordbar.com/shows", "Brother Ali"],
    ["folly", "https://follytheater.org/events/", "Calvin Arsenia"],
  ])("reads the recorded %s page byte for byte, under its own robots.txt, into text the model can cite", async (name, url, act) => {
    const origin = new URL(url).origin;
    routes({ [`${origin}/robots.txt`]: recordedRobots(name), [url]: recordedPage(name) });

    const page = await fetcher().fetch(url);

    expect(page).toMatchObject({ url, finalUrl: url, status: 200, robotsAllowed: true });
    expect(page.body).toBe(recordedBody(name));
    const reading = readPage(page, testConfig());
    expect(reading.text).toContain(act);
    expect(reading.links.every((link) => link.startsWith("http"))).toBe(true);
  });
});

/**
 * The fake every run test fetches through must answer as the real fetcher does, or the run tests
 * prove nothing about a real run. Each canned shape against the network that produces it.
 */
describe("the canned fetcher matches the real one", () => {
  const MOVED = "https://venue.test/events";
  it.each<[string, CannedPage, Routes]>([
    ["a page", { status: 200, body: "<p>Shows</p>" }, venue(NO_ROBOTS)],
    ["a redirected page", { status: 200, body: "<p>Shows</p>", finalUrl: MOVED }, { ...venue(NO_ROBOTS, redirect(MOVED)), [MOVED]: html("<p>Shows</p>") }],
    ["a page that is gone", "gone", venue(NO_ROBOTS, status(404, "Not Found"))],
    ["a page robots.txt disallows", "robots-blocked", venue(recordedRobots("disallows-us"))],
  ])("%s", async (_, canned, network) => {
    routes(network);
    expect(await cannedFetcher({ [CALENDAR]: canned }).fetch(CALENDAR)).toEqual(await fetcher().fetch(CALENDAR));
  });

  it("a robots.txt that cannot be reached", async () => {
    routes(venue(status(503)));
    const real = await fetcher().fetch(CALENDAR).catch((error: unknown) => error);
    const fake = await cannedFetcher({ [CALENDAR]: "robots-unreachable" }).fetch(CALENDAR).catch((error: unknown) => error);

    expect(fake).toBeInstanceOf(Error);
    expect(fake).toEqual(real);
  });

  it("a page the fetch policy refuses", async () => {
    routes(venue(NO_ROBOTS, () => new Response("%PDF-1.7", { headers: { "content-type": "application/pdf" } })));
    const real = await fetcher().fetch(CALENDAR).catch((error: unknown) => error);
    const fake = await cannedFetcher({ [CALENDAR]: "refused" }).fetch(CALENDAR).catch((error: unknown) => error);

    expect(real).toBeInstanceOf(FetchRefused);
    expect(fake).toBeInstanceOf(FetchRefused);
    expect(fake).toEqual(real);
  });
});
