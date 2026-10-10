/**
 * Hosts and sites: which host a URL is on, whether that host is one of a list (or under one), and
 * which site it belongs to, meaning its registrable domain (the public suffix plus one label:
 * "knuckleheadskc.com" for "tickets.knuckleheadskc.com"). The trust boundary between pages is
 * drawn here (ADR 0008, amended #75): a page speaks for an event only from the event's own site.
 */

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

/**
 * Second-level labels that are themselves public suffixes under a two-letter country code ("co.uk",
 * "com.au", "ac.jp"): the generic ones, so "a.co.uk" and "b.co.uk" are two sites. The job carries no
 * public suffix list; this approximation errs toward treating two hosts as one site, so a page on a
 * hosted platform's other tenant ("x.squarespace.com" and "y.squarespace.com") counts as the same site.
 */
const COUNTRY_SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "edu", "ac", "or", "ne", "go", "gob", "mil", "ltd", "plc", "sch", "nhs"]);

/**
 * The site a URL belongs to: its registrable domain, the last two labels of its host, or the last
 * three under a country code's generic second level. An IP address or a one-label host is its own
 * site. Undefined when the URL does not parse.
 */
export function registrableDomain(url: string): string | undefined {
  const host = hostOf(url);
  if (host === undefined) return undefined;
  if (/^[\d.]+$/.test(host) || host.startsWith("[")) return host;
  const labels = host.split(".");
  if (labels.length <= 2) return host;
  const [second, top] = labels.slice(-2) as [string, string];
  const keep = top.length === 2 && COUNTRY_SECOND_LEVEL.has(second) ? 3 : 2;
  return labels.slice(-keep).join(".");
}

/** Whether two URLs are on one site: the same registrable domain. Two URLs that do not parse are not. */
export function sameSite(a: string, b: string): boolean {
  const site = registrableDomain(a);
  return site !== undefined && site === registrableDomain(b);
}
