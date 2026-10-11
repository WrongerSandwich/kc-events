import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";

/**
 * A response for each URL the stubbed network knows: a fresh one per request, as a server's would
 * be, or an Error the request rejects with, as a refused connection does.
 */
export type Routes = Record<string, () => Response | Error>;

/** One request that reached the stubbed network. */
export interface Requested {
  url: string;
  headers: Headers;
}

/**
 * Stubs the global `fetch` with this table (undo with `vi.unstubAllGlobals()`). A URL not in it
 * rejects, as a host that does not answer would. Returns every request made, in order, and their URLs.
 */
export function routes(table: Routes): { requests: Requested[]; urls: string[] } {
  const requests: Requested[] = [];
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, headers: new Headers(init?.headers) });
    urls.push(url);
    const route = table[url];
    if (!route) throw new TypeError("fetch failed", { cause: Object.assign(new Error(`connect ECONNREFUSED ${url}`), { code: "ECONNREFUSED" }) });
    const response = route();
    if (response instanceof Error) throw response;
    return response;
  });
  return { requests, urls };
}

export const html =
  (body: string | Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}) =>
  () =>
    new Response(body, { headers: { "content-type": "text/html", ...headers } });
export const robots = (body: string) => () => new Response(body, { headers: { "content-type": "text/plain" } });
export const redirect =
  (location: string, status = 301) =>
  () =>
    new Response(null, { status, headers: { location } });
export const status =
  (code: number, body = "") =>
  () =>
    new Response(body, { status: code, headers: { "content-type": "text/plain" } });
/** A site with no robots.txt: every path may be fetched (RFC 9309). */
export const NO_ROBOTS = status(404);

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

/** A recorded, scrubbed page from `test/fixtures/pages/` (see its README), served as HTML. */
export const recordedPage = (name: string) => html(readFileSync(join(FIXTURES, "pages", `${name}.html`), "utf8"));
/** A robots.txt from the set in `test/fixtures/robots/`, served as text. */
export const recordedRobots = (name: string) => robots(readFileSync(join(FIXTURES, "robots", `${name}.txt`), "utf8"));
/** A recorded page's file contents, to compare a fetched body against. */
export const recordedBody = (name: string) => readFileSync(join(FIXTURES, "pages", `${name}.html`), "utf8");
