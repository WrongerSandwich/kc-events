/**
 * The four ports the run talks to the world through. The run does no I/O of its own;
 * the CLI builds real adapters, tests pass fakes.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, unknown>;
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  /** Strict JSON-schema response format; the reply is parsed against it. */
  responseFormat: { name: string; schema: Record<string, unknown> };
}

export interface CompletionResult {
  /** The parsed structured reply. Callers validate it against their own Zod schema. */
  value: unknown;
  /** Cost in USD as reported by the provider for this call. */
  costUsd: number;
}

export interface ModelPort {
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

export interface Lead {
  url: string;
  title: string;
  snippet: string;
}

export interface SearchPort {
  search(query: string): Promise<Lead[]>;
}

export interface FetchResult {
  /** The URL requested. */
  url: string;
  /** The URL after redirects. */
  finalUrl: string;
  status: number;
  body: string;
  /** False when robots.txt disallowed the fetch; body is then empty and nothing was requested. */
  robotsAllowed: boolean;
}

export interface FetchPort {
  fetch(url: string): Promise<FetchResult>;
}

export interface Clock {
  now(): Date;
}

export interface Ports {
  model: ModelPort;
  search: SearchPort;
  fetcher: FetchPort;
  clock: Clock;
}
