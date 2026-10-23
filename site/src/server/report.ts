// The report form's function (#129): a reader with no GitHub account reports a wrong listing from the site, and this
// files it as the issue the "Wrong listing" issue form would (.github/ISSUE_TEMPLATE/wrong-listing.yml): the same
// title shape, labels and headings. api/report.ts is the Vercel entry; this is the seam the tests drive, with the
// GitHub API faked. Imports carry a .js extension because Vercel runs the compiled files unbundled.
import { reportUrl } from "../lib/report.js";
import { siteConfig } from "../site.config.js";

/** The longest "What is wrong" accepted, in characters. */
export const MAX_WHAT = 2000;
/**
 * The longest request body read: the form's fields at their limits, URL-encoded, with room to spare. A "what" of
 * MAX_WHAT characters in a three-byte script URL-encodes to 18,000 characters, and every field at its limit in the worst
 * encoding comes to about 23 KB (#187).
 */
export const MAX_BODY = 32_000;
/** The most issues the token's user may have opened in the last hour before the function refuses to file another (#187). */
export const MAX_PER_HOUR = 20;
/**
 * The form's fields; any other name in a body refuses it. `website` is the honeypot, which a person never fills. `event`
 * is the event's page on this site, and all the issue says about the event (its title and pages) is looked up from the
 * published data by the page's id: a client cannot put a title or a link of its own in an issue.
 */
const FIELDS = new Set(["what", "website", "event"]);

export const LABELS = ["bug", "needs-triage"];

/** What the issue quotes about an event: its title and the pages it was read from. */
export interface PublishedPages { title: string; primaryUrl: string; eventUrl?: string }

export interface ReportDeps {
  /** The fine-grained token (this repository, Issues read and write); undefined when the environment has none. */
  token: string | undefined;
  /** The origins an event's site page may be on: the request's own and the canonical one. */
  origins: string[];
  fetch: typeof fetch;
  /** The published event with that id, or undefined when the site has none. */
  published: (id: string) => Promise<PublishedPages | undefined>;
}

/** Why a report was not filed, for the reader; undefined for a refusal that says nothing (the honeypot, a forged body). */
type Outcome = { ok: true; issueUrl?: string } | { ok: false; status: number; reason?: string };

/** The form's fields, read: what the reader wrote, and the event's page on this site when the form was on one. */
interface Form {
  what: string;
  event?: string;
}

interface Report {
  what: string;
  context?: { title: string; event: string; primaryUrl: string; eventUrl?: string };
}

function httpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** The form's fields read and checked, or the refusal. A refusal files nothing. */
export function parseReport(body: string, origins: string[]): Form | { status: number; reason?: string } {
  if (body.length > MAX_BODY) return { status: 413, reason: "The report is too long; keep it shorter." };
  const params = new URLSearchParams(body);
  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (!FIELDS.has(key) || seen.has(key)) return { status: 400 };
    seen.add(key);
  }
  if (params.get("website")) return { status: 400 };
  const what = (params.get("what") ?? "").replace(/\r\n?/g, "\n").trim();
  if (what === "") return { status: 400, reason: "Say what is wrong." };
  if (what.length > MAX_WHAT) return { status: 400, reason: `Keep it under ${MAX_WHAT.toLocaleString("en-US")} characters.` };

  const event = params.get("event") ?? "";
  if (!event) return { what };
  const eventUrl = httpUrl(event);
  if (!eventUrl) return { status: 400 };
  const site = new URL(eventUrl);
  if (!origins.includes(site.origin) || !/^\/e\/[\w-]+$/.test(site.pathname) || site.search || site.hash) return { status: 400 };
  return { what, event: eventUrl };
}

/** The id in an event's site page URL, as parseReport admits them. */
const eventId = (event: string) => new URL(event).pathname.slice("/e/".length);

/**
 * The report with the event's title and pages looked up, or a refusal: 400 when the site publishes no such event (the
 * reader's page is older than the last run), 502 when the published data could not be read at all.
 */
async function resolve(form: Form, deps: ReportDeps): Promise<Report | { status: number; reason?: string }> {
  if (!form.event) return { what: form.what };
  let found: PublishedPages | undefined;
  try {
    found = await deps.published(eventId(form.event));
  } catch (error) {
    console.error(`report: the published events could not be read: ${error instanceof Error ? error.message : String(error)}`);
    return { status: 502 };
  }
  if (!found) return { status: 400, reason: "That event is no longer listed." };
  const { title, primaryUrl, eventUrl } = found;
  return { what: form.what, context: { title: oneLine(title), event: form.event, primaryUrl, ...(eventUrl && { eventUrl }) } };
}

/**
 * The lookup the deployed function uses: the deployment's own /events.json, the projection the site publishes, which
 * names every event's title and pages as its page shows them. Fetched per report; reports are rare and the file is
 * cached at the edge. Throws when the file cannot be read, which the handler answers as "could not send".
 */
export function publishedEvents(origin: string, fetch: typeof globalThis.fetch): ReportDeps["published"] {
  return async (id) => {
    const response = await fetch(`${origin}/events.json`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`${origin}/events.json answered ${response.status}`);
    const { events } = (await response.json()) as { events: ({ id: string } & PublishedPages)[] };
    const found = events.find((e) => e.id === id);
    return found && { title: found.title, primaryUrl: found.primaryUrl, ...(found.eventUrl && { eventUrl: found.eventUrl }) };
  };
}

/** A fence longer than any run of backticks in the text, so what the reader wrote stays plain text: no mentions, links or images. */
function fenced(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}`;
}

/** The issue's title and body, laid out as the issue form lays out its fields. */
export function issueFor(report: Report): { title: string; body: string } {
  const { what, context } = report;
  const firstLine = oneLine(what.split("\n")[0]!);
  const title = `Wrong listing: ${context ? context.title : firstLine.length > 60 ? `${firstLine.slice(0, 59)}…` : firstLine}`;
  const field = (heading: string, value: string | undefined) => `### ${heading}\n\n${value ?? "_No response_"}`;
  const body = [
    field("What is wrong", fenced(what)),
    field("Event on kcthisweek.com", context?.event),
    field("Page it was read from", context?.primaryUrl),
    field("Event's own page", context?.eventUrl),
    SENT_FROM,
  ].join("\n\n");
  return { title, body };
}

const SENT_FROM = "---\n\n_Sent from the report form on the site, by a reader who may have no GitHub account._";

/** A further report of an event that already has an open issue, as a comment on that issue. */
export function commentFor(what: string): string {
  return ["### Reported again", fenced(what), SENT_FROM].join("\n\n");
}

/** Thrown by a GitHub call that failed; the handler answers it as "could not send" and logs the message. */
class GitHubError extends Error {}

/** One GitHub API call with the token; its JSON answer, or a GitHubError. The token itself is never logged. */
async function gitHub<T>(deps: ReportDeps, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await deps.fetch(`https://api.github.com${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${deps.token}`,
        ...(body !== undefined && { "Content-Type": "application/json" }),
        "User-Agent": "kc-this-week-report-form",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new GitHubError(`GitHub could not be reached: ${error instanceof Error ? error.message : String(error)}`);
  }
  // An expired token or a lost permission shows here, in the function's logs.
  if (!response.ok) throw new GitHubError(`GitHub answered ${response.status} to ${path.split("?")[0]}: ${(await response.text()).slice(0, 300)}`);
  return (await response.json()) as T;
}

/** The issue's link for the reader, only when it is an issue of this repository. */
const issueLink = (url: string | undefined) => (url?.startsWith(`${siteConfig.repoUrl}/issues/`) ? { issueUrl: url } : {});

interface Found { total_count: number; items: { number: number; html_url: string; body?: string | null }[] }

const search = (deps: ReportDeps, q: string) => gitHub<Found>(deps, `/search/issues?${new URLSearchParams({ q, per_page: "100" })}`);

/**
 * Files the report, or, when an open needs-triage issue already carries the same event, comments on that issue instead
 * (#187). Refuses with 429, filing nothing, once the token's user has opened MAX_PER_HOUR issues in the last hour: the
 * function's own bound on volume, beside the firewall's per-address rule.
 */
async function file(report: Report, deps: ReportDeps, now: Date): Promise<Outcome> {
  if (!deps.token) {
    console.error("report: no GITHUB_REPORT_TOKEN in the environment");
    return { ok: false, status: 503 };
  }
  const [owner, repo] = new URL(siteConfig.repoUrl).pathname.split("/").filter(Boolean);
  try {
    const hourAgo = new Date(now.getTime() - 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z");
    const recent = await search(deps, `repo:${owner}/${repo} is:issue author:@me created:>=${hourAgo}`);
    if (recent.total_count >= MAX_PER_HOUR) {
      console.error(`report: ${recent.total_count} issues opened in the last hour; refusing another`);
      return { ok: false, status: 429, reason: "Too many reports in the last hour." };
    }
    const event = report.context?.event;
    if (event) {
      // Search matches words, not the exact link, so each hit's body is checked for the event's link on a line of its own.
      const open = await search(deps, `repo:${owner}/${repo} is:issue is:open label:needs-triage in:body "${event}"`);
      const same = open.items.find((issue) => (issue.body ?? "").split(/\r?\n/).some((line) => line.trim() === event));
      if (same) {
        await gitHub(deps, `/repos/${owner}/${repo}/issues/${same.number}/comments`, { body: commentFor(report.what) });
        return { ok: true, ...issueLink(same.html_url) };
      }
    }
    const issue = await gitHub<{ html_url?: string }>(deps, `/repos/${owner}/${repo}/issues`, { ...issueFor(report), labels: LABELS });
    return { ok: true, ...issueLink(issue.html_url) };
  } catch (error) {
    // A GitHub answer that is not JSON lands here too, as "could not send" rather than a crash.
    console.error(`report: ${error instanceof GitHubError ? error.message : `GitHub's answer could not be read: ${String(error)}`}`);
    return { ok: false, status: 502 };
  }
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The plain page a form posted without JavaScript lands on. */
function page(outcome: Outcome, back: string, github: string): string {
  const message = outcome.ok
    ? `<p>Sent. It is now a ${outcome.issueUrl ? `<a href="${escape(outcome.issueUrl)}">public issue on GitHub</a>` : "public issue on GitHub"}.</p>`
    : `<p>Could not send.${outcome.reason ? ` ${escape(outcome.reason)}` : ""} Try again, or use the GitHub link below.</p>
<p><a href="${escape(github)}">Report it on GitHub</a></p>`;
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Report a wrong listing · ${escape(siteConfig.name)}</title></head>
<body>
<main>
<h1>Report a wrong listing</h1>
${message}
<p><a href="${escape(back)}">Back to ${back === "/about" ? "the about page" : "the listing"}</a></p>
</main>
</body>
</html>
`;
}

/** The event page a refused post came from, for the plain page's back link; else the about page. */
function refererPath(request: Request, origins: string[]): string {
  try {
    const referer = new URL(request.headers.get("Referer") ?? "");
    if (origins.includes(referer.origin) && /^\/e\/[\w-]+$/.test(referer.pathname)) return referer.pathname;
  } catch {
    // no Referer, or not a URL
  }
  return "/about";
}

const HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
  "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

/**
 * Answers a POST of the form: JSON ({ ok, url?, reason? }, url the issue's) to the form's script, which asks for it in Accept, else the
 * plain page. Nothing is filed unless every check passes.
 */
export async function handleReport(request: Request, deps: ReportDeps, now = new Date()): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed\n", { status: 405, headers: { ...HEADERS, Allow: "POST" } });
  // A browser says where a post came from: one from another site's page is refused, so no page elsewhere can make its
  // visitors file reports (each from their own address, past the firewall's per-IP limit).
  const from = request.headers.get("Origin");
  if (request.headers.get("Sec-Fetch-Site") === "cross-site" || (from !== null && !deps.origins.includes(from))) {
    return new Response("Forbidden\n", { status: 403, headers: HEADERS });
  }
  const body = await request.text();
  const form = parseReport(body, deps.origins);
  const parsed = "what" in form ? await resolve(form, deps) : form;
  const report = "what" in parsed ? parsed : undefined;
  const outcome: Outcome = "what" in parsed ? await file(parsed, deps, now) : { ok: false, ...parsed };
  const status = outcome.ok ? 200 : outcome.status;
  if (request.headers.get("Accept")?.includes("application/json")) {
    const json = outcome.ok ? { ok: true, ...(outcome.issueUrl && { url: outcome.issueUrl }) } : { ok: false, ...(outcome.reason && { reason: outcome.reason }) };
    return Response.json(json, { status, headers: HEADERS });
  }
  const back = report?.context ? new URL(report.context.event).pathname : refererPath(request, deps.origins);
  const github = reportUrl(siteConfig.repoUrl, report?.context);
  return new Response(page(outcome, back, github), { status, headers: { ...HEADERS, "Content-Type": "text/html; charset=utf-8" } });
}
