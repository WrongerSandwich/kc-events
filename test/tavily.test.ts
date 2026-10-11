import { describe, expect, it } from "vitest";
import { createTavilySearch } from "../src/adapters/tavily.js";
import { SearchQuotaExhausted } from "../src/ports.js";

const RESULTS = { results: [{ url: "https://venue.test/shows", title: "Shows", content: "This week at the venue" }, { title: "no url" }] };

/** A Tavily search over canned responses, served in turn; records the requests that went out and the pauses taken. */
function cannedSearch(...responses: (() => Response)[]) {
  return cannedSearchWith("key", ...responses);
}

function cannedSearchWith(apiKey: string | undefined, ...responses: (() => Response)[]) {
  let requests = 0;
  const sent: { url: string; init: RequestInit }[] = [];
  const pauses: number[] = [];
  const search = createTavilySearch({
    apiKey,
    maxResults: 5,
    fetch: (async (url: unknown, init?: RequestInit) => {
      requests++;
      sent.push({ url: String(url), init: init ?? {} });
      const next = responses.shift();
      if (!next) throw new Error("no canned response left");
      return next();
    }) as typeof globalThis.fetch,
    sleep: async (ms) => void pauses.push(ms),
  });
  return { search, requests: () => requests, sent, pauses };
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

  it("posts the query at basic depth with the result count, the key as a bearer token", async () => {
    const { search, sent } = cannedSearch(json(RESULTS));

    await search.search("music events");

    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe("https://api.tavily.com/search");
    expect(sent[0]!.init).toMatchObject({ method: "POST", headers: { authorization: "Bearer key", "content-type": "application/json" } });
    expect(JSON.parse(String(sent[0]!.init.body))).toEqual({ query: "music events", search_depth: "basic", topic: "general", max_results: 5 });
    expect(sent[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("says what the server said when it fails twice, cut to 200 characters", async () => {
    const { search } = cannedSearch(text("down", 500), text(`internal error ${"x".repeat(300)}`, 500));

    const error = (await search.search("music events").catch((e: unknown) => e)) as Error;
    expect(error.message).toMatch(/^Tavily HTTP 500: internal error x+$/);
    expect(error.message).toHaveLength("Tavily HTTP 500: ".length + 200);
  });

  it("drops a result with no URL and blanks a title or snippet that is not text", async () => {
    const { search } = cannedSearch(json({ results: [{ url: 42 }, { url: "https://venue.test/a", title: null, content: ["x"] }] }));

    expect(await search.search("music events")).toEqual([{ url: "https://venue.test/a", title: "", snippet: "" }]);
  });

  it("reads a reply with no results list as no results", async () => {
    const { search } = cannedSearch(json({ answer: null }));
    expect(await search.search("music events")).toEqual([]);
  });

  it("needs the key only when a search is made", async () => {
    const { search, requests } = cannedSearchWith(undefined, json(RESULTS));

    await expect(search.search("music events")).rejects.toThrow("TAVILY_API_KEY is not set");
    expect(requests()).toBe(0);
  });
});
