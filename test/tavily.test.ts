import { describe, expect, it } from "vitest";
import { createTavilySearch } from "../src/adapters/tavily.js";
import { SearchQuotaExhausted } from "../src/ports.js";

const RESULTS = { results: [{ url: "https://venue.test/shows", title: "Shows", content: "This week at the venue" }, { title: "no url" }] };

/** A Tavily search over canned responses, served in turn; records how many requests went out and the pauses taken. */
function cannedSearch(...responses: (() => Response)[]) {
  let requests = 0;
  const pauses: number[] = [];
  const search = createTavilySearch({
    apiKey: "key",
    maxResults: 5,
    fetch: (async () => {
      requests++;
      const next = responses.shift();
      if (!next) throw new Error("no canned response left");
      return next();
    }) as typeof globalThis.fetch,
    sleep: async (ms) => void pauses.push(ms),
  });
  return { search, requests: () => requests, pauses };
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const text = (body: string, status: number) => () => new Response(body, { status });

describe("Tavily search adapter", () => {
  it("returns the results that carry a URL", async () => {
    const { search } = cannedSearch(json(RESULTS));

    expect(await search.search("music events")).toEqual([{ url: "https://venue.test/shows", title: "Shows", snippet: "This week at the venue" }]);
  });

  it.each([429, 500, 503])("retries once after a jittered pause on HTTP %i", async (status) => {
    const { search, requests, pauses } = cannedSearch(text("busy", status), json(RESULTS));

    expect(await search.search("music events")).toHaveLength(1);
    expect(requests()).toBe(2);
    expect(pauses).toHaveLength(1);
    expect(pauses[0]).toBeGreaterThanOrEqual(1_000);
    expect(pauses[0]).toBeLessThan(3_000);
  });

  it("gives up after the one retry", async () => {
    const { search, requests } = cannedSearch(text("busy", 429), text("still busy", 429), json(RESULTS));

    await expect(search.search("music events")).rejects.toThrow("Tavily HTTP 429: still busy");
    expect(requests()).toBe(2);
  });

  it.each([432, 433])("throws SearchQuotaExhausted on HTTP %i without retrying", async (status) => {
    const { search, requests } = cannedSearch(text("limit exceeded", status));

    const error = await search.search("music events").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SearchQuotaExhausted);
    expect(error).toHaveProperty("message", `Tavily HTTP ${status}: limit exceeded`);
    expect(requests()).toBe(1);
  });

  it("does not retry any other client error", async () => {
    const { search, requests } = cannedSearch(text("bad key", 401));

    const error = await search.search("music events").catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(SearchQuotaExhausted);
    expect(requests()).toBe(1);
  });
});
