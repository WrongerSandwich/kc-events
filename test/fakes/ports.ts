import type { CompletionRequest, CompletionResult, FetchResult, Ports, SearchResult } from "../../src/ports.js";
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

export interface FakePortOptions {
  pages?: Record<string, CannedPage>;
  /** Scripted extraction replies, consumed in call order; running out is an error. */
  completions?: CompletionResult[];
  /** Scripted curation replies, consumed in call order; running out flags nothing. */
  curations?: CompletionResult[];
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
        if (request.model === TEST_MODELS.curation) return judgments.shift() ?? nothingFlagged(request);
        const reply = replies.shift();
        if (!reply) throw new Error("fake model has no scripted extraction response left");
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
    fetcher: {
      async fetch(url): Promise<FetchResult> {
        const page = pages[url];
        if (page === "robots-blocked") {
          calls.push(`robots-blocked:${url}`);
          return { url, finalUrl: url, status: 0, body: "", robotsAllowed: false };
        }
        if (page === "robots-unreachable") {
          calls.push(`robots-unreachable:${url}`);
          throw new Error("robots.txt unreachable (HTTP 503)");
        }
        calls.push(`fetch:${url}`);
        if (page === undefined) throw new Error(`fake fetcher has no canned page for ${url}`);
        if (page instanceof Error) throw page;
        return { url, finalUrl: url, status: page.status, body: page.body, robotsAllowed: true };
      },
    },
    clock: { now: () => now },
  };
  return { ports, calls, requests };
}
