import { describe, expect, it } from "vitest";
import { createOpenRouterModel } from "../src/adapters/openrouter.js";
import { ModelReplyUnusable, type CompletionRequest } from "../src/ports.js";
import { extractionResponseFormat } from "../src/extraction.js";

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

  it("abandons a reply whose body stalls past the request's timeout", async () => {
    const stalled = () =>
      new Response(new ReadableStream({ start: (controller) => controller.enqueue(new TextEncoder().encode('{"id":')) }), {
        headers: { "content-type": "application/json" },
      });
    const { fetch } = cannedFetch(stalled);

    await expect(createOpenRouterModel({ apiKey: "key", fetch }).complete({ ...REQUEST, timeoutMs: 20 })).rejects.toThrow(/timed out/i);
  });

  it("a reply that came back unusable throws with its cost and who served it, since it was billed", async () => {
    const refused = { ...completion(), choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: null, refusal: "no" } }] };
    const { fetch } = cannedFetch(json(refused));

    const error = await createOpenRouterModel({ apiKey: "key", fetch }).complete(REQUEST).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModelReplyUnusable);
    expect(error).toMatchObject({
      message: "vendor/model refused: no",
      costUsd: 0.0042,
      servedBy: { model: "vendor/model-2026-09", provider: "Vendor", generationId: "gen-123" },
    });
  });

  /** A completion whose one message is this, billed at the default cost. */
  const replying = (message: object, finishReason = "stop") => ({ ...completion(), choices: [{ index: 0, finish_reason: finishReason, message: { role: "assistant", refusal: null, ...message } }] });

  it.each([
    ["no choices", { ...completion(), choices: [] }, "OpenRouter response for vendor/model had no choices"],
    ["a refusal", replying({ content: null, refusal: "I can't help with that" }), "vendor/model refused: I can't help with that"],
    [
      "a tool call",
      replying({ content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "lookup", arguments: "{}" } }] }, "tool_calls"),
      "vendor/model replied with a tool call; the model port does not run tool loops yet",
    ],
    ["empty content", replying({ content: "  " }, "length"), "vendor/model returned no content (finish reason length)"],
    ["no content", replying({ content: null }), "vendor/model returned no content (finish reason stop)"],
    ["content that is not JSON", replying({ content: "Here are the events: none" }), "vendor/model returned content that is not JSON despite the strict response format"],
  ])("a reply with %s throws, as unusable and billed", async (_, reply, message) => {
    const { fetch } = cannedFetch(json(reply));

    const error = await createOpenRouterModel({ apiKey: "key", fetch }).complete(REQUEST).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModelReplyUnusable);
    expect(error).toMatchObject({ message, costUsd: 0.0042 });
  });

  it("sends the strict JSON schema the caller gave, with no $schema, and tools as strict functions", async () => {
    const { fetch, bodies } = cannedFetch(json(completion()));
    const tool = { name: "lookup", description: "Look a venue up", parameters: { type: "object", properties: {}, additionalProperties: false } };

    await createOpenRouterModel({ apiKey: "key", fetch }).complete({
      ...REQUEST,
      messages: [
        { role: "system", content: "Rules" },
        { role: "user", content: "Read this page" },
      ],
      tools: [tool],
      responseFormat: extractionResponseFormat,
    });

    expect(bodies[0]).toMatchObject({
      messages: [
        { role: "system", content: "Rules" },
        { role: "user", content: "Read this page" },
      ],
      tools: [{ type: "function", function: { ...tool, strict: true } }],
      response_format: { type: "json_schema", json_schema: { name: "extracted_events", strict: true, schema: extractionResponseFormat.schema } },
      provider: { require_parameters: true },
      usage: { include: true },
    });
    expect(JSON.stringify(bodies[0])).not.toContain("$schema");
  });

  it("sends no tools field when the request has none", async () => {
    const { fetch, bodies } = cannedFetch(json(completion()));
    await createOpenRouterModel({ apiKey: "key", fetch }).complete({ ...REQUEST, tools: [] });
    expect(bodies[0]).not.toHaveProperty("tools");
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
    const { fetch, bodies } = cannedFetch(json(completion()));
    const model = createOpenRouterModel({ apiKey: undefined, fetch });

    await expect(model.complete(REQUEST)).rejects.toThrow(/OPENROUTER_API_KEY is not set/);
    expect(bodies).toEqual([]);
  });
});
