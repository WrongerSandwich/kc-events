// The report form's function (#129): a reader with no GitHub account reports a wrong listing from the site, and this
// files it as the issue the "Wrong listing" issue form would (.github/ISSUE_TEMPLATE/wrong-listing.yml): the same
// title shape, labels and headings. api/report.ts is the Vercel entry; this is the seam the tests drive, with the
// GitHub API faked. Imports carry a .js extension because Vercel runs the compiled files unbundled.
import { reportUrl } from "../lib/report.js";
import { siteConfig } from "../site.config.js";

/** The longest "What is wrong" accepted, in characters. */
export const MAX_WHAT = 2000;
/** The longest event title accepted from the form's hidden field. */
const MAX_TITLE = 500;
/** The longest request body read: the form's fields at their limits, URL-encoded, with room to spare. */
const MAX_BODY = 16_000;
/** The form's fields; any other name in a body refuses it. `website` is the honeypot, which a person never fills. */
const FIELDS = new Set(["what", "website", "title", "event", "primary-page", "event-page"]);

export const LABELS = ["bug", "needs-triage"];

export interface ReportDeps {
  /** The fine-grained token (this repository, Issues read and write); undefined when the environment has none. */
  token: string | undefined;
  /** The origins an event's site page may be on: the request's own and the canonical one. */
  origins: string[];
  fetch: typeof fetch;
}

/** Why a report was not filed, for the reader; undefined for a refusal that says nothing (the honeypot, a forged body). */
type Outcome = { ok: true; issueUrl: string } | { ok: false; status: number; reason?: string };

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
export function parseReport(body: string, origins: string[]): Report | { status: number; reason?: string } {
  if (body.length > MAX_BODY) return { status: 413 };
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

  const title = oneLine(params.get("title") ?? "");
  const event = params.get("event") ?? "";
  const primary = params.get("primary-page") ?? "";
  const own = params.get("event-page") ?? "";
  if (!title && !event && !primary && !own) return { what };
  // Event context comes whole from the event page's hidden fields, or not at all.
  if (!title || title.length > MAX_TITLE || !event || !primary) return { status: 400 };
  const eventUrl = httpUrl(event);
  const primaryUrl = httpUrl(primary);
  const ownUrl = own ? httpUrl(own) : undefined;
  if (!eventUrl || !primaryUrl || (own && !ownUrl)) return { status: 400 };
  const site = new URL(eventUrl);
  if (!origins.includes(site.origin) || !/^\/e\/[\w-]+$/.test(site.pathname) || site.search || site.hash) return { status: 400 };
  return { what, context: { title, event: eventUrl, primaryUrl, ...(ownUrl && { eventUrl: ownUrl }) } };
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
    field("Primary page", context?.primaryUrl),
    field("Event page", context?.eventUrl),
    "---\n\n_Sent from the report form on the site, by a reader who may have no GitHub account._",
  ].join("\n\n");
  return { title, body };
}

async function file(report: Report, deps: ReportDeps): Promise<Outcome> {
  if (!deps.token) {
    console.error("report: no GITHUB_REPORT_TOKEN in the environment");
    return { ok: false, status: 503 };
  }
  const [owner, repo] = new URL(siteConfig.repoUrl).pathname.split("/").filter(Boolean);
  try {
    const response = await deps.fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${deps.token}`,
        "Content-Type": "application/json",
        "User-Agent": "kc-this-week-report-form",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ...issueFor(report), labels: LABELS }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // An expired token or a lost permission shows here, in the function's logs; the token itself is never logged.
      console.error(`report: GitHub answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
      return { ok: false, status: 502 };
    }
    const issue = (await response.json()) as { html_url?: string };
    return { ok: true, issueUrl: issue.html_url ?? "" };
  } catch (error) {
    console.error(`report: GitHub could not be reached: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, status: 502 };
  }
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The plain page a form posted without JavaScript lands on. */
function page(outcome: Outcome, back: string, github: string): string {
  const message = outcome.ok
    ? "<p>Sent. Thanks.</p>"
    : `<p>Could not send.${outcome.reason ? ` ${escape(outcome.reason)}` : ""} Try again, or <a href="${escape(github)}">report it on GitHub</a>.</p>`;
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
 * Answers a POST of the form: JSON ({ ok, reason? }) to the form's script, which asks for it in Accept, else the
 * plain page. Nothing is filed unless every check passes.
 */
export async function handleReport(request: Request, deps: ReportDeps): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed\n", { status: 405, headers: { ...HEADERS, Allow: "POST" } });
  // A browser says where a post came from: one from another site's page is refused, so no page elsewhere can make its
  // visitors file reports (each from their own address, past the firewall's per-IP limit).
  const from = request.headers.get("Origin");
  if (request.headers.get("Sec-Fetch-Site") === "cross-site" || (from !== null && !deps.origins.includes(from))) {
    return new Response("Forbidden\n", { status: 403, headers: HEADERS });
  }
  const body = await request.text();
  const parsed = parseReport(body, deps.origins);
  const report = "what" in parsed ? parsed : undefined;
  const outcome: Outcome = "what" in parsed ? await file(parsed, deps) : { ok: false, ...parsed };
  const status = outcome.ok ? 200 : outcome.status;
  if (request.headers.get("Accept")?.includes("application/json")) {
    const json = outcome.ok ? { ok: true } : { ok: false, ...(outcome.reason && { reason: outcome.reason }) };
    return Response.json(json, { status, headers: HEADERS });
  }
  const back = report?.context ? new URL(report.context.event).pathname : refererPath(request, deps.origins);
  const github = reportUrl(siteConfig.repoUrl, report?.context);
  return new Response(page(outcome, back, github), { status, headers: { ...HEADERS, "Content-Type": "text/html; charset=utf-8" } });
}
