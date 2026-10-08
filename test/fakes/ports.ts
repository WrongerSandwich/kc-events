import type { CompletionRequest, CompletionResult, FetchPort, FetchResult, Ports, SearchResult } from "../../src/ports.js";
import { EVENTS_TO_JUDGE } from "../../src/curation.js";
import { TEST_MODELS } from "./config.js";

/**
 * What an unscripted curation call gets, so tests about other stages need not script one: every
 * event in the batch judged not don't-miss, at no cost. Judged, not ignored, so a later run over
 * unchanged events makes no curation call, as it would after a real reply.
 */
function nothingFlagged(request: CompletionRequest): CompletionResult {
  const listed = request.messages.at(-1)?.content.split(`${EVENTS_TO_JUDGE}\n\n`)[1] ?? "[]";
  const events = JSON.parse(listed) as { id: string }[];
  return { value: { judgments: events.map(({ id }) => ({ id, dontMiss: false, why: "" })) }, costUsd: 0 };
}

/**
 * A canned response: a page with a status, a robots.txt block, a robots.txt that cannot be reached
 * (thrown, as the real fetcher does), or a network failure.
 */
export type CannedPage = { status: number; body: string } | "robots-blocked" | "robots-unreachable" | Error;

/** A scripted model reply, or an Error the call throws, as a connection reset partway through would. */
export type ScriptedReply = CompletionResult | Error;

export interface FakePortOptions {
  pages?: Record<string, CannedPage>;
  /** Scripted extraction replies, consumed in call order; running out is an error. An Error entry is thrown, not returned. */
  completions?: ScriptedReply[];
  /** Scripted curation replies, consumed in call order; running out flags nothing. An Error entry is thrown, not returned. */
  curations?: ScriptedReply[];
  /** Search results by query; a query not listed returns nothing, an Error is thrown. */
  searches?: Record<string, SearchResult[] | Error>;
}

/** Fake ports that record every call; none of them reach the network. */
export function fakePorts(now: Date, { pages = {}, completions = [], curations = [], searches = {} }: FakePortOptions = {}) {
  const calls: string[] = [];
  const requests: CompletionRequest[] = [];
  const replies = [...completions];
  const judgments = [...curations];
  const ports: Ports = {
    model: {
      async complete(request) {
        calls.push(`model:${request.model}`);
        requests.push(request);
        const reply = request.model === TEST_MODELS.curation ? (judgments.shift() ?? nothingFlagged(request)) : replies.shift();
        if (!reply) throw new Error("fake model has no scripted extraction response left");
        if (reply instanceof Error) throw reply;
        return reply;
      },
    },
    search: {
      async search(query) {
        calls.push(`search:${query}`);
        const results = searches[query] ?? [];
        if (results instanceof Error) throw results;
        return results;
      },
    },
    fetcher: cannedFetcher(pages, calls, ""),
    browserFetcher: cannedFetcher(pages, calls, "browser"),
    clock: { now: () => now },
  };
  return { ports, calls, requests };
}

/**
 * A fetcher over the canned pages, recording each call. The plain one records `fetch:<url>`,
 * `robots-blocked:<url>`, and `robots-unreachable:<url>`; the browser one puts `browser` in front
 * (`browser:<url>`, `browser robots-blocked:<url>`) and adds the selector it was told to wait for.
 */
function cannedFetcher(pages: Record<string, CannedPage>, calls: string[], prefix: string): FetchPort {
  const record = (what: string, url: string) => calls.push(prefix && what ? `${prefix} ${what}:${url}` : `${prefix || what}:${url}`);
  return {
    async fetch(url, options): Promise<FetchResult> {
      const page = pages[url];
      if (page === "robots-blocked") {
        record("robots-blocked", url);
        return { url, finalUrl: url, status: 0, body: "", robotsAllowed: false };
      }
      if (page === "robots-unreachable") {
        record("robots-unreachable", url);
        throw new Error("robots.txt unreachable (HTTP 503)");
      }
      calls.push(`${prefix || "fetch"}:${url}${options?.waitFor ? ` waiting for ${options.waitFor}` : ""}`);
      if (page === undefined) throw new Error(`fake fetcher has no canned page for ${url}`);
      if (page instanceof Error) throw page;
      return { url, finalUrl: url, status: page.status, body: page.body, robotsAllowed: true };
    },
  };
}
