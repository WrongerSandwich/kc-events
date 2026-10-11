import { describe, expect, it } from "vitest";
import { createOpenRouterModel } from "../src/adapters/openrouter.js";
import type { CompletionRequest } from "../src/ports.js";

const REQUEST: CompletionRequest = {
  model: "vendor/model",
  messages: [{ role: "user", content: "Read this page" }],
  responseFormat: { name: "extracted_events", schema: { type: "object" } },
  timeoutMs: 120_000,
};

/** A canned OpenRouter chat completion; `usage` replaces the default usage block. */
function completion({ usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.0042 } as object, provider = "Vendor" } = {}) {
  return {
    id: "gen-123",
    object: "chat.completion",
    created: 1_760_000_000,
    model: "vendor/model-2026-09",
    provider,
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: '{"events":[]}', refusal: null } }],
    usage,
  };
}

/** A fetch that answers every call with the canned responses in turn and records each request body. */
function cannedFetch(...responses: (() => Response)[]) {
  const bodies: Record<string, unknown>[] = [];
  const fetch = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const next = responses.shift();
    if (!next) throw new Error("no canned response left");
    return next();
  }) as typeof globalThis.fetch;
  return { fetch, bodies };
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("OpenRouter model adapter", () => {
  it("asks for usage explicitly and returns the parsed reply, its cost, and who served it", async () => {
    const { fetch, bodies } = cannedFetch(json(completion()));
    const result = await createOpenRouterModel({ apiKey: "key", fetch }).complete(REQUEST);

    expect(bodies[0]).toMatchObject({ model: "vendor/model", usage: { include: true }, provider: { require_parameters: true } });
    expect(result).toEqual({
      value: { events: [] },
      costUsd: 0.0042,
      servedBy: { model: "vendor/model-2026-09", provider: "Vendor", generationId: "gen-123" },
    });
  });

  it("makes one attempt: a server error throws rather than retrying", async () => {
    const { fetch, bodies } = cannedFetch(json({ error: { message: "upstream down" } }, 502), json(completion()));

    await expect(createOpenRouterModel({ apiKey: "key", fetch }).complete(REQUEST)).rejects.toThrow();
    expect(bodies).toHaveLength(1);
  });

  it("abandons a call that runs past the request's timeout", async () => {
    const fetch = ((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)))) as typeof globalThis.fetch;

    await expect(createOpenRouterModel({ apiKey: "key", fetch }).complete({ ...REQUEST, timeoutMs: 20 })).rejects.toThrow(/timed out/i);
  });

  it("throws when the reply carries no cost", async () => {
    const { fetch } = cannedFetch(json(completion({ usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })));

    await expect(createOpenRouterModel({ apiKey: "key", fetch }).complete(REQUEST)).rejects.toThrow(/no usage\.cost/);
  });

  it("treats a cost of 0 from a model that is not free as a missing cost", async () => {
    const zero = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0 };
    const paid = cannedFetch(json(completion({ usage: zero })));
    const free = cannedFetch(json(completion({ usage: zero })));

    await expect(createOpenRouterModel({ apiKey: "key", fetch: paid.fetch }).complete(REQUEST)).rejects.toThrow(/usage\.cost of 0/);
    await expect(createOpenRouterModel({ apiKey: "key", fetch: free.fetch }).complete({ ...REQUEST, model: "vendor/model:free" })).resolves.toMatchObject({
      costUsd: 0,
    });
  });

  it("needs the key only when a call is made", async () => {
    const model = createOpenRouterModel({ apiKey: undefined });

    await expect(model.complete(REQUEST)).rejects.toThrow(/OPENROUTER_API_KEY is not set/);
  });
});
