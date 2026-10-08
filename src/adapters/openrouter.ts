import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { CompletionRequest, CompletionResult, ModelPort } from "../ports.js";
import { REPO_URL } from "./identity.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * OpenRouter extensions to the OpenAI request body. `require_parameters` keeps a request off
 * any provider endpoint that does not support every parameter we send, so a strict JSON-schema
 * response format never silently degrades to free text.
 */
type OpenRouterParams = ChatCompletionCreateParamsNonStreaming & {
  provider: { require_parameters: boolean };
};

/** OpenRouter puts the charge for the call in the usage block of every response. */
interface OpenRouterUsage {
  cost?: number;
}

/**
 * The real model port: the OpenAI SDK pointed at OpenRouter. One call per completion, cost read
 * from the response. The key is checked on first use so a run with nothing to extract needs none.
 */
export function createOpenRouterModel({ apiKey }: { apiKey: string | undefined }): ModelPort {
  let client: OpenAI | undefined;
  const clientOrThrow = () => {
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set; put it in the environment or a gitignored .env");
    client ??= new OpenAI({
      apiKey,
      baseURL: OPENROUTER_BASE_URL,
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
      };

      const completion = await clientOrThrow().chat.completions.create(params);

      const cost = (completion.usage as (typeof completion.usage & OpenRouterUsage) | undefined)?.cost;
      if (typeof cost !== "number") {
        throw new Error(`OpenRouter response for ${request.model} carried no usage.cost; the spend cap cannot be enforced without it`);
      }

      const message = completion.choices[0]?.message;
      if (!message) throw new Error(`OpenRouter response for ${request.model} had no choices`);
      if (message.refusal) throw new Error(`${request.model} refused: ${message.refusal}`);
      if (message.tool_calls && message.tool_calls.length > 0) {
        throw new Error(`${request.model} replied with a tool call; the model port does not run tool loops yet`);
      }
      if (typeof message.content !== "string" || message.content.trim() === "") {
        throw new Error(`${request.model} returned no content (finish reason ${completion.choices[0]?.finish_reason})`);
      }

      let value: unknown;
      try {
        value = JSON.parse(message.content);
      } catch (error) {
        throw new Error(`${request.model} returned content that is not JSON despite the strict response format`, { cause: error });
      }
      return { value, costUsd: cost };
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
