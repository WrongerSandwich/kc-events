import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFetchPolicy, FetchRefused, MAX_BODY_BYTES, type Lookup } from "../src/adapters/fetch-policy.js";
import { createFetcher } from "../src/adapters/fetcher.js";

/** A response for each URL the stubbed network knows; a fresh one per request, as a server's would be. */
type Routes = Record<string, () => Response>;

const html = (body: string | Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}) => () =>
  new Response(body, { headers: { "content-type": "text/html", ...headers } });
const robots = (body: string) => () => new Response(body, { headers: { "content-type": "text/plain" } });
const redirect = (location: string) => () => new Response(null, { status: 301, headers: { location } });
const NO_ROBOTS = () => new Response("", { status: 404 });

/** Every hostname resolves to a public address unless listed. */
const resolvesTo =
  (addresses: Record<string, string> = {}): Lookup =>
  async (hostname) => {
    const address = addresses[hostname] ?? "93.184.215.14";
    return [{ address, family: address.includes(":") ? 6 : 4 }];
  };

let requested: string[];
let slept: number[];
let clock: number;

function stubNetwork(routes: Routes) {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    requested.push(url);
    const route = routes[url];
    if (!route) throw new Error(`no route for ${url}`);
    return route();
  });
}

function fetcher(addresses: Record<string, string> = {}) {
  const lookups: string[] = [];
  const lookup = resolvesTo(addresses);
  const plain = createFetcher({
    lookup: (hostname) => {
      lookups.push(hostname);
      return lookup(hostname);
    },
    now: () => clock,
    sleep: async (ms) => {
      slept.push(ms);
      clock += ms;
    },
  });
  return { plain, lookups };
}

beforeEach(() => {
  requested = [];
  slept = [];
  clock = 1_000_000;
});
afterEach(() => vi.unstubAllGlobals());

describe("fetch policy: hosts", () => {
  it.each([
    ["a literal IPv4 address", "http://192.168.1.1/"],
    ["a loopback address in another notation", "http://0x7f.1/"],
    ["a literal IPv6 address", "http://[::1]:8080/"],
    ["a hostname without a dot", "http://homeserver/"],
    ["a hostname without a dot, written with a trailing one", "http://localhost./"],
    ["a .local host", "http://homeserver.local:8080/"],
    ["an .internal host", "http://metadata.google.internal/"],
    ["a non-http scheme", "ftp://venue.test/calendar"],
  ])("refuses %s without a request or a lookup", async (_, url) => {
    stubNetwork({});
    const { plain, lookups } = fetcher();

    await expect(plain.fetch(url)).rejects.toThrow(FetchRefused);
    expect(requested).toEqual([]);
    expect(lookups).toEqual([]);
  });

  it.each([
    ["loopback", "127.0.0.2"],
    ["RFC 1918 10/8", "10.1.2.3"],
    ["RFC 1918 172.16/12", "172.20.0.1"],
    ["RFC 1918 192.168/16", "192.168.0.10"],
    ["carrier-grade NAT", "100.64.1.1"],
    ["link-local (cloud metadata)", "169.254.169.254"],
    ["IPv6 loopback", "::1"],
    ["IPv6 unique local", "fd12:3456::1"],
    ["IPv6 link-local", "fe80::1"],
    ["IPv4-mapped loopback", "::ffff:127.0.0.1"],
  ])("refuses a host that resolves to %s, before its robots.txt", async (_, address) => {
    stubNetwork({});
    const { plain } = fetcher({ "intranet.venue.test": address });

    await expect(plain.fetch("https://intranet.venue.test/")).rejects.toThrow(`resolves to ${address}`);
    expect(requested).toEqual([]);
  });

  it("fetches a public host", async () => {
    stubNetwork({ "https://venue.test/robots.txt": NO_ROBOTS, "https://venue.test/calendar": html("<p>Shows</p>") });

    const page = await fetcher().plain.fetch("https://venue.test/calendar");

    expect(page).toEqual({ url: "https://venue.test/calendar", finalUrl: "https://venue.test/calendar", status: 200, body: "<p>Shows</p>", robotsAllowed: true });
  });

  it("checks every redirect hop: a public page that redirects to a private host is refused at the hop", async () => {
    stubNetwork({ "https://venue.test/robots.txt": NO_ROBOTS, "https://venue.test/go": redirect("http://192.168.1.1/admin") });

    await expect(fetcher().plain.fetch("https://venue.test/go")).rejects.toThrow("192.168.1.1: a literal IP address");
    expect(requested).toEqual(["https://venue.test/robots.txt", "https://venue.test/go"]);
  });

  it("checks robots.txt's redirects too", async () => {
    stubNetwork({ "https://venue.test/robots.txt": redirect("http://10.0.0.1/robots.txt") });

    await expect(fetcher().plain.fetch("https://venue.test/calendar")).rejects.toThrow(FetchRefused);
    expect(requested).toEqual(["https://venue.test/robots.txt"]);
  });

  it("refuses once: a second fetch of the URL is the cached refusal, and a host is looked up once a run", async () => {
    stubNetwork({});
    const { plain, lookups } = fetcher({ "intranet.venue.test": "10.0.0.5" });

    await expect(plain.fetch("https://intranet.venue.test/a")).rejects.toThrow(FetchRefused);
    await expect(plain.fetch("https://intranet.venue.test/a")).rejects.toThrow(FetchRefused);
    await expect(plain.fetch("https://intranet.venue.test/b")).rejects.toThrow(FetchRefused);
    expect(lookups).toEqual(["intranet.venue.test"]);
  });
});

describe("fetch policy: bodies", () => {
  const page = "https://venue.test/calendar";
  const withRobots = (route: () => Response): Routes => ({ "https://venue.test/robots.txt": NO_ROBOTS, [page]: route });

  it("refuses a body that declares more than the budget, unread", async () => {
    let pulled = 0;
    const stream = new ReadableStream({ pull: (c) => void (pulled++, c.enqueue(new Uint8Array(1024))) });
    stubNetwork(withRobots(() => new Response(stream, { headers: { "content-type": "text/html", "content-length": String(MAX_BODY_BYTES + 1) } })));

    await expect(fetcher().plain.fetch(page)).rejects.toThrow(`body over ${MAX_BODY_BYTES} bytes`);
    expect(pulled).toBeLessThanOrEqual(1);
  });

  it("stops reading a body that runs past the budget and cancels it", async () => {
    let cancelled = false;
    const chunk = new Uint8Array(1_000_000).fill(0x61);
    const stream = new ReadableStream({ pull: (c) => c.enqueue(chunk), cancel: () => void (cancelled = true) });
    stubNetwork(withRobots(() => new Response(stream, { headers: { "content-type": "text/html" } })));

    await expect(fetcher().plain.fetch(page)).rejects.toThrow(FetchRefused);
    expect(cancelled).toBe(true);
  });

  it.each(["text/html; charset=utf-8", "application/xhtml+xml", "text/plain", "text/calendar", "application/xml", "text/xml", "application/rss+xml"])(
    "reads %s",
    async (type) => {
      stubNetwork(withRobots(html("listing", { "content-type": type })));

      expect((await fetcher().plain.fetch(page)).body).toBe("listing");
    },
  );

  it.each(["application/pdf", "application/zip", "audio/mpeg", "application/json", "image/png"])("refuses %s unread", async (type) => {
    let cancelled = false;
    const stream = new ReadableStream({ start: (c) => c.enqueue(new Uint8Array([1, 2, 3])), cancel: () => void (cancelled = true) });
    stubNetwork(withRobots(() => new Response(stream, { headers: { "content-type": type } })));

    await expect(fetcher().plain.fetch(page)).rejects.toThrow(`content type ${type}`);
    expect(cancelled).toBe(true);
  });

  it("reads a page that names no content type", async () => {
    // A string body gets text/plain from the Response constructor; a byte body gets none.
    stubNetwork(withRobots(() => new Response(new TextEncoder().encode("listing"))));

    expect((await fetcher().plain.fetch(page)).body).toBe("listing");
  });

  it("does not read the body of a failing status", async () => {
    stubNetwork(withRobots(() => new Response("Not here", { status: 404, headers: { "content-type": "application/json" } })));

    expect(await fetcher().plain.fetch(page)).toMatchObject({ status: 404, body: "", robotsAllowed: true });
  });

  // “Fall” — in Windows-1252: curly quotes and an em dash, each one byte.
  const WINDOWS_1252 = new Uint8Array([0x93, 0x46, 0x61, 0x6c, 0x6c, 0x94, 0x20, 0x97]);
  const READ = "“Fall” —";

  it("decodes in the header's charset", async () => {
    stubNetwork(withRobots(html(WINDOWS_1252, { "content-type": "text/html; charset=windows-1252" })));

    expect((await fetcher().plain.fetch(page)).body).toBe(READ);
  });

  it("decodes by a byte order mark when the header names no charset", async () => {
    const utf16 = new Uint8Array([0xff, 0xfe, ...[..."Fall"].flatMap((c) => [c.charCodeAt(0), 0])]);
    stubNetwork(withRobots(html(utf16)));

    expect((await fetcher().plain.fetch(page)).body).toBe("Fall");
  });

  it.each([
    ["<meta charset>", '<meta charset="windows-1252">'],
    ["http-equiv", '<meta http-equiv="Content-Type" content="text/html; charset=windows-1252">'],
  ])("decodes by %s when neither header nor BOM says", async (_, meta) => {
    const head = new TextEncoder().encode(`<head>${meta}</head>`);
    stubNetwork(withRobots(html(new Uint8Array([...head, ...WINDOWS_1252]))));

    expect((await fetcher().plain.fetch(page)).body).toBe(`<head>${meta}</head>${READ}`);
  });

  it("decodes as UTF-8 by default, and when the named charset is unknown", async () => {
    stubNetwork(withRobots(html("“Fall” —", { "content-type": "text/html; charset=x-unknown" })));

    expect((await fetcher().plain.fetch(page)).body).toBe(READ);
  });
});

describe("fetch policy: pace", () => {
  it("waits a second between two requests to one origin whose robots.txt names no delay, and not across origins", async () => {
    stubNetwork({
      "https://venue.test/robots.txt": NO_ROBOTS,
      "https://venue.test/a": html("a"),
      "https://venue.test/b": html("b"),
      "https://other.test/robots.txt": NO_ROBOTS,
      "https://other.test/a": html("a"),
    });
    const { plain } = fetcher();

    await plain.fetch("https://venue.test/a");
    await plain.fetch("https://other.test/a");
    await plain.fetch("https://venue.test/b");

    // robots.txt, then /a a second later; other.test's two requests likewise; /b is already a second past /a.
    expect(slept).toEqual([1000, 1000]);
  });

  it.each([
    ["the robots.txt crawl delay", "3", [1000, 3000]],
    ["at most ten seconds", "60", [1000, 10_000]],
  ])("honors %s", async (_, delay, expected) => {
    stubNetwork({
      "https://venue.test/robots.txt": robots(`User-agent: *\nCrawl-delay: ${delay}\n`),
      "https://venue.test/a": html("a"),
      "https://venue.test/b": html("b"),
    });
    const { plain } = fetcher();

    await plain.fetch("https://venue.test/a");
    await plain.fetch("https://venue.test/b");

    expect(slept).toEqual(expected);
  });

  it("keeps the delay between requests started together", async () => {
    // A clock that stands still while both wait, as it does when neither has woken yet.
    const policy = createFetchPolicy({ now: () => clock, sleep: async (ms) => void slept.push(ms) });
    const at = (path: string) => policy.pace(new URL(path, "https://venue.test"));

    await Promise.all([at("/a"), at("/b"), at("/c")]);

    expect(slept).toEqual([1000, 2000]);
  });
});
