/**
 * The ports the run talks to the world through: a model, a search, two fetchers, and a clock.
 * The run does no I/O of its own; the CLI builds real adapters, tests pass fakes.
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

/** One web-search hit. Not a glossary Lead, which is how an event was first found. */
export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

export interface SearchPort {
  search(query: string): Promise<SearchResult[]>;
}

export interface FetchResult {
  /** The URL requested. */
  url: string;
  /** The URL after redirects. */
  finalUrl: string;
  status: number;
  body: string;
  /**
   * False when robots.txt disallowed the URL, or a URL it redirected to; body is then empty and
   * the disallowed URL was never requested (earlier redirect hops may have been).
   */
  robotsAllowed: boolean;
}

export interface FetchOptions {
  /** A CSS selector to wait for before reading the page; only a browser fetcher waits for anything. */
  waitFor?: string;
}

export interface FetchPort {
  fetch(url: string, options?: FetchOptions): Promise<FetchResult>;
}

export interface Clock {
  now(): Date;
}

export interface Ports {
  model: ModelPort;
  search: SearchPort;
  fetcher: FetchPort;
  /** Loads a page in a browser and returns the rendered HTML, for a registry source with `fetch: browser`. */
  browserFetcher: FetchPort;
  clock: Clock;
}
