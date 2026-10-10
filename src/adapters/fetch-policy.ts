import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

// What both fetchers will and will not fetch, and how they read what comes back. A URL is checked
// before every request, redirect hops included: http(s) only, and never a host on the machine's
// own network, so a link a discovered page carries cannot point the job at the home LAN. A body
// is read within a byte budget, only in a content type the job can read, and decoded in the
// charset it declares. Requests to one origin are spaced by its robots.txt `Crawl-delay`.

/**
 * A request the fetch policy refused, thrown in place of the request. The run counts it as an
 * outage like any other failed fetch: the page was not read, so nothing on it is struck.
 */
export class FetchRefused extends Error {
  override name = "FetchRefused";
}

/** The most a page's body may hold, after transfer encoding is undone. */
export const MAX_BODY_BYTES = 5_000_000;
/** The pause between two requests to one origin whose robots.txt names no crawl delay. */
export const DEFAULT_CRAWL_DELAY_MS = 1_000;
/** The longest crawl delay honored; a robots.txt asking for more gets this. */
export const MAX_CRAWL_DELAY_MS = 10_000;

/** The content types a page may come back in; anything else is refused unread. */
const READABLE_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "text/calendar",
  "application/xml",
  "text/xml",
  "application/rss+xml",
]);

/** Host suffixes that only ever name something on a local network. */
const LOCAL_SUFFIXES = [".local", ".internal", ".localhost"];

/** Addresses that are the machine itself or its network, never a public page. */
const PRIVATE_ADDRESSES = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["127.0.0.0", 8],
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["100.64.0.0", 10],
  ["169.254.0.0", 16],
] as const) {
  PRIVATE_ADDRESSES.addSubnet(network, prefix, "ipv4");
}
PRIVATE_ADDRESSES.addAddress("::", "ipv6");
PRIVATE_ADDRESSES.addAddress("::1", "ipv6");
PRIVATE_ADDRESSES.addSubnet("fc00::", 7, "ipv6");
PRIVATE_ADDRESSES.addSubnet("fe80::", 10, "ipv6");

/** Resolves a hostname to every address it has, as `dns.promises.lookup` with `all: true` does. */
export type Lookup = (hostname: string) => Promise<{ address: string; family: number }[]>;

export interface FetchPolicyOptions {
  lookup?: Lookup;
  /** Waits the given milliseconds; tests pass one that only records. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface FetchPolicy {
  /** Throws `FetchRefused` unless the URL may be requested: its scheme, its host, and every address the host resolves to. */
  check(url: URL): Promise<void>;
  /** Waits until a request to the URL's origin keeps the crawl delay since the last one, and books this one. */
  pace(url: URL): Promise<void>;
  /** The origin's robots.txt crawl delay in seconds, once read; none means the default. */
  setCrawlDelay(origin: string, seconds: number | undefined): void;
}

/**
 * One run's policy: host checks are cached by hostname (a host's addresses do not change within a
 * run that matters) and pacing is per origin across both fetchers.
 *
 * The address check is made on our own lookup, not on the connection undici makes, so a host that
 * answers differently the second time (DNS rebinding) could slip through; that takes a hostile DNS
 * server, not a careless link, and is out of reach without a custom dispatcher.
 */
export function createFetchPolicy({
  lookup = (hostname) => dnsLookup(hostname, { all: true, verbatim: true }),
  sleep = (ms) => delay(ms),
  now = Date.now,
}: FetchPolicyOptions = {}): FetchPolicy {
  const hosts = new Map<string, Promise<void>>();
  const nextSlot = new Map<string, number>();
  const crawlDelays = new Map<string, number>();

  async function checkHost(hostname: string): Promise<void> {
    if (isIP(hostname)) throw new FetchRefused(`fetch policy refuses ${hostname}: a literal IP address`);
    if (!hostname.includes(".")) throw new FetchRefused(`fetch policy refuses ${hostname}: not a public hostname`);
    if (LOCAL_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
      throw new FetchRefused(`fetch policy refuses ${hostname}: a local hostname`);
    }
    const addresses = await lookup(hostname);
    const local = addresses.find(({ address, family }) => isPrivate(address, family));
    if (local) throw new FetchRefused(`fetch policy refuses ${hostname}: it resolves to ${local.address}, a private address`);
  }

  return {
    async check(url) {
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new FetchRefused(`fetch policy refuses ${url.href}: only http and https are fetched`);
      }
      // An IPv6 literal keeps its brackets in `hostname`; a trailing dot names the same host.
      const hostname = url.hostname.replace(/^\[(.*)\]$/, "$1").replace(/\.$/, "").toLowerCase();
      let checked = hosts.get(hostname);
      if (!checked) {
        checked = checkHost(hostname);
        hosts.set(hostname, checked);
      }
      await checked;
    },
    async pace(url) {
      // The slot is booked before waiting, so two requests started together still go one delay apart.
      const at = Math.max(now(), nextSlot.get(url.origin) ?? 0);
      nextSlot.set(url.origin, at + (crawlDelays.get(url.origin) ?? DEFAULT_CRAWL_DELAY_MS));
      const wait = at - now();
      if (wait > 0) await sleep(wait);
    },
    setCrawlDelay(origin, seconds) {
      if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return;
      crawlDelays.set(origin, Math.min(seconds * 1000, MAX_CRAWL_DELAY_MS));
    },
  };
}

function isPrivate(address: string, family: number): boolean {
  if (family === 6) {
    // An IPv4 address written as IPv6 (::ffff:127.0.0.1) is the IPv4 address.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return PRIVATE_ADDRESSES.check(mapped[1]!, "ipv4");
    return PRIVATE_ADDRESSES.check(address, "ipv6");
  }
  return PRIVATE_ADDRESSES.check(address, "ipv4");
}

/**
 * A successful response's body as text, or `FetchRefused`: a content type off the allow-list is
 * refused unread; one that names no content type is read, and refused if it turns out binary.
 */
export async function readText(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type");
  const type = contentType?.split(";")[0]!.trim().toLowerCase();
  if (type !== undefined && !READABLE_TYPES.has(type)) {
    await response.body?.cancel();
    throw new FetchRefused(`fetch policy refuses content type ${type}`);
  }
  const bytes = await readCapped(response);
  // Text holds no NUL unless it is UTF-16 (which marks itself); a PDF, ZIP or MP3 has one within its first kilobyte.
  const binary = !bomCharset(bytes)?.startsWith("utf-16") && bytes.subarray(0, 1024).includes(0);
  if (type === undefined && binary) throw new FetchRefused("fetch policy refuses a body with no content type that is not text");
  return decodeBody(bytes, contentType);
}

/**
 * The response's body as bytes, read no further than the budget: a body that declares or reaches
 * more is cancelled and refused. The budget counts bytes after decompression, so a small gzip
 * transfer cannot inflate without bound.
 */
export async function readCapped(response: Response): Promise<Uint8Array> {
  // Content-Length counts the transfer, which is never more than the decompressed body.
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_BODY_BYTES) {
    await response.body?.cancel();
    throw tooLarge();
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Throws `FetchRefused` if a page already in hand (a browser's rendered DOM) is over the byte budget. */
export function checkSize(body: string): void {
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw tooLarge();
}

const tooLarge = () => new FetchRefused(`fetch policy refuses a body over ${MAX_BODY_BYTES} bytes`);

/**
 * The body as text, in the charset it declares: the content-type header's, else a byte order mark,
 * else a `<meta charset>` or `http-equiv` in the first kilobyte, else UTF-8. A charset the decoder
 * does not know is read as UTF-8.
 */
function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  const charset = headerCharset(contentType) ?? bomCharset(bytes) ?? metaCharset(bytes) ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function headerCharset(contentType: string | null): string | undefined {
  return contentType ? /;\s*charset\s*=\s*"?([^";\s]+)/i.exec(contentType)?.[1] : undefined;
}

function bomCharset(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  return undefined;
}

function metaCharset(bytes: Uint8Array): string | undefined {
  // Read as Latin-1 so every byte is one character; the charset name itself is ASCII.
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  // Matches both <meta charset="x"> and http-equiv's content="text/html; charset=x".
  return /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1];
}
