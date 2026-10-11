import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { ModelReplyUnusable, type CompletionRequest, type CompletionResult, type ModelPort, type ServedBy } from "../ports.js";
import { REPO_URL } from "./identity.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * OpenRouter extensions to the OpenAI request body. `require_parameters` keeps a request off
 * any provider endpoint that does not support every parameter we send, so a strict JSON-schema
 * response format never silently degrades to free text. `usage.include` asks for the call's cost
 * in the reply rather than relying on OpenRouter sending it by default.
 */
type OpenRouterParams = ChatCompletionCreateParamsNonStreaming & {
  provider: { require_parameters: boolean };
  usage: { include: true };
};

/** OpenRouter puts the charge for the call in the usage block, and the provider that served it beside the model. */
interface OpenRouterUsage {
  cost?: number;
}
interface OpenRouterCompletion {
  provider?: string;
}

/** OpenRouter's free variants end in `:free`; any other model costs something, so a cost of 0 from one is a cost missing. */
const isFreeModel = (model: string) => model.endsWith(":free");

/**
 * The real model port: the OpenAI SDK pointed at OpenRouter. One attempt per completion, bounded
 * by the request's timeout; cost and who served the call read from the response. The key is
 * checked on first use so a run with nothing to extract needs none.
 */
export function createOpenRouterModel({ apiKey, fetch }: { apiKey: string | undefined; fetch?: typeof globalThis.fetch }): ModelPort {
  let client: OpenAI | undefined;
  const clientOrThrow = () => {
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set; put it in the environment or a gitignored .env");
    client ??= new OpenAI({
      apiKey,
      baseURL: OPENROUTER_BASE_URL,
      // No silent retries: the SDK's default of two would triple a wedged call's time, and every
      // attempt may be billed while only the last one's cost is seen. A call that throws already
      // costs only its page or batch in the run.
      maxRetries: 0,
      ...(fetch ? { fetch } : {}),
      // OpenRouter's app attribution headers; shown on its activity page, not required.
      defaultHeaders: { "HTTP-Referer": REPO_URL, "X-Title": "KC This Week" },
    });
    return client;
  };

  return {
    async complete(request: CompletionRequest): Promise<CompletionResult> {
      const params: OpenRouterParams = {
        model: request.model,
        messages: request.messages.map(toOpenAiMessage),
        ...(request.tools && request.tools.length > 0
          ? {
              tools: request.tools.map((tool) => ({
                type: "function" as const,
                function: { name: tool.name, description: tool.description, parameters: tool.parameters, strict: true },
              })),
            }
          : {}),
        response_format: {
          type: "json_schema",
          json_schema: { name: request.responseFormat.name, strict: true, schema: request.responseFormat.schema },
        },
        provider: { require_parameters: true },
        usage: { include: true },
      };

      const completion = await clientOrThrow().chat.completions.create(params, { timeout: request.timeoutMs });

      const { provider } = completion as typeof completion & OpenRouterCompletion;
      // The generation id is what OpenRouter's activity page and generation lookup key on.
      const servedBy: ServedBy = { model: completion.model, ...(provider !== undefined ? { provider } : {}), generationId: completion.id };

      const cost = (completion.usage as (typeof completion.usage & OpenRouterUsage) | undefined)?.cost;
      if (typeof cost !== "number" || (cost === 0 && !isFreeModel(request.model))) {
        const carried = typeof cost === "number" ? "a usage.cost of 0" : "no usage.cost";
        throw new ModelReplyUnusable(`OpenRouter response for ${request.model} carried ${carried}; the spend cap cannot be enforced without it`, servedBy);
      }
      // Past here the reply was billed at a known cost, so a reply that cannot be used still reports it.
      const unusable = (message: string, options?: ErrorOptions) => new ModelReplyUnusable(message, servedBy, cost, options);

      const message = completion.choices[0]?.message;
      if (!message) throw unusable(`OpenRouter response for ${request.model} had no choices`);
      if (message.refusal) throw unusable(`${request.model} refused: ${message.refusal}`);
      if (message.tool_calls && message.tool_calls.length > 0) {
        throw unusable(`${request.model} replied with a tool call; the model port does not run tool loops yet`);
      }
      if (typeof message.content !== "string" || message.content.trim() === "") {
        throw unusable(`${request.model} returned no content (finish reason ${completion.choices[0]?.finish_reason})`);
      }

      let value: unknown;
      try {
        value = JSON.parse(message.content);
      } catch (error) {
        throw unusable(`${request.model} returned content that is not JSON despite the strict response format`, { cause: error });
      }
      return { value, costUsd: cost, servedBy };
    },
  };
}

function toOpenAiMessage(message: CompletionRequest["messages"][number]): ChatCompletionMessageParam {
  switch (message.role) {
    case "system":
      return { role: "system", content: message.content };
    case "user":
      return { role: "user", content: message.content };
    case "assistant":
      return { role: "assistant", content: message.content };
    case "tool":
      if (!message.toolCallId) throw new Error("a tool message needs the toolCallId it answers");
      return { role: "tool", content: message.content, tool_call_id: message.toolCallId };
  }
}
