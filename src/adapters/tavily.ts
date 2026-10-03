import type { SearchPort, SearchResult } from "../ports.js";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const TIMEOUT_MS = 30_000;

interface TavilyResponse {
  results?: { url?: unknown; title?: unknown; content?: unknown }[];
}

/**
 * The real search port: Tavily's search endpoint at basic depth (one credit a search). Results are
 * leads only; the snippet is never cited. The key is checked on first use so a run with discovery
 * off needs none.
 */
export function createTavilySearch({ apiKey, maxResults }: { apiKey: string | undefined; maxResults: number }): SearchPort {
  return {
    async search(query: string): Promise<SearchResult[]> {
      if (!apiKey) throw new Error("TAVILY_API_KEY is not set; put it in the environment or a gitignored .env");
      const response = await fetch(TAVILY_SEARCH_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ query, search_depth: "basic", topic: "general", max_results: maxResults }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Tavily HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
      const body = (await response.json()) as TavilyResponse;
      return (body.results ?? []).flatMap((r) =>
        typeof r.url === "string"
          ? [{ url: r.url, title: typeof r.title === "string" ? r.title : "", snippet: typeof r.content === "string" ? r.content : "" }]
          : [],
      );
    },
  };
}
