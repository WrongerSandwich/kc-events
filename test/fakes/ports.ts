import type { CompletionRequest, CompletionResult, FetchResult, Ports } from "../../src/ports.js";

/** A canned response: a page with a status, a robots.txt block, or a network failure. */
export type CannedPage = { status: number; body: string } | "robots-blocked" | Error;

export interface FakePortOptions {
  pages?: Record<string, CannedPage>;
  /** Scripted model replies, consumed in call order. */
  completions?: CompletionResult[];
}

/** Fake ports that record every call; none of them reach the network. */
export function fakePorts(now: Date, { pages = {}, completions = [] }: FakePortOptions = {}) {
  const calls: string[] = [];
  const requests: CompletionRequest[] = [];
  const replies = [...completions];
  const ports: Ports = {
    model: {
      async complete(request) {
        calls.push(`model:${request.model}`);
        requests.push(request);
        const reply = replies.shift();
        if (!reply) throw new Error("fake model has no scripted response left");
        return reply;
      },
    },
    search: {
      async search(query) {
        calls.push(`search:${query}`);
        return [];
      },
    },
    fetcher: {
      async fetch(url): Promise<FetchResult> {
        const page = pages[url];
        if (page === "robots-blocked") {
          calls.push(`robots-blocked:${url}`);
          return { url, finalUrl: url, status: 0, body: "", robotsAllowed: false };
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
