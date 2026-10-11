import { setTimeout as delay } from "node:timers/promises";
import { SearchQuotaExhausted, type SearchPort, type SearchResult } from "../ports.js";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const TIMEOUT_MS = 30_000;

/** Tavily's answers for a key past its limit: 432 for the plan or key limit, 433 for the pay-as-you-go limit. */
const QUOTA_STATUSES = new Set([432, 433]);

/** Worth one more try: rate limited, or the service failed on its side. */
const isTransient = (status: number) => status === 429 || status >= 500;

/** The pause before the one retry: one to three seconds, spread so retries do not arrive together. */
const retryDelayMs = () => 1_000 + Math.random() * 2_000;

interface TavilyResponse {
  results?: { url?: unknown; title?: unknown; content?: unknown }[];
}

/**
 * The real search port: Tavily's search endpoint at basic depth (one credit a search). Results are
 * leads only; the snippet is never cited. The key is checked on first use so a run with discovery
 * off needs none. A rate limit or server error gets one retry after a jittered pause; a spent quota
 * throws `SearchQuotaExhausted`.
 */
export function createTavilySearch({
  apiKey,
  maxResults,
  fetch = globalThis.fetch,
  sleep = (ms: number) => delay(ms),
}: {
  apiKey: string | undefined;
  maxResults: number;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<unknown>;
}): SearchPort {
  return {
    async search(query: string): Promise<SearchResult[]> {
      if (!apiKey) throw new Error("TAVILY_API_KEY is not set");
      const attempt = () =>
        fetch(TAVILY_SEARCH_URL, {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ query, search_depth: "basic", topic: "general", max_results: maxResults }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

      let response = await attempt();
      if (isTransient(response.status)) {
        await response.body?.cancel();
        await sleep(retryDelayMs());
        response = await attempt();
      }
      if (!response.ok) {
        const message = `Tavily HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`;
        throw QUOTA_STATUSES.has(response.status) ? new SearchQuotaExhausted(message) : new Error(message);
      }
      const body = (await response.json()) as TavilyResponse;
      return (body.results ?? []).flatMap((r) =>
        typeof r.url === "string"
          ? [{ url: r.url, title: typeof r.title === "string" ? r.title : "", snippet: typeof r.content === "string" ? r.content : "" }]
          : [],
      );
    },
  };
}
