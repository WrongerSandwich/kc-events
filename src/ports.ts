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

/** The run stage a model call is made for, so its spend and time can be told apart in the report (#257). */
export const MODEL_STAGES = ["extraction", "discovery", "reverification", "own-page", "ticket-page", "curation"] as const;
export type ModelStage = (typeof MODEL_STAGES)[number];

export interface CompletionRequest {
  model: string;
  stage: ModelStage;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  /** Strict JSON-schema response format; the reply is parsed against it. */
  responseFormat: { name: string; schema: Record<string, unknown> };
  /** How long the call may take before it is abandoned and thrown; a page or batch is lost, not the run's time budget. */
  timeoutMs: number;
}

export interface CompletionResult {
  /** The parsed structured reply. Callers validate it against their own Zod schema. */
  value: unknown;
  /** Cost in USD as reported by the provider for this call. */
  costUsd: number;
  /** Who served the call, so spend can be reconciled against the provider's own records. */
  servedBy?: ServedBy;
}

/** A model call as the provider records it: the model that answered, the upstream provider, and the id its activity page lists. */
export interface ServedBy {
  model: string;
  provider?: string;
  generationId: string;
}

/**
 * A call whose reply came back but could not be used. It was still billed, so it carries who
 * served it and, when the reply said, the cost, for the spend cap and the run's record of calls.
 */
export class ModelReplyUnusable extends Error {
  override name = "ModelReplyUnusable";
  constructor(
    message: string,
    readonly servedBy: ServedBy,
    readonly costUsd?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
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
  /** Throws `SearchQuotaExhausted` when the search service will take no more queries from this key. */
  search(query: string): Promise<SearchResult[]>;
}

/** The search key's quota is spent: every further query would fail the same way, so none should be made. */
export class SearchQuotaExhausted extends Error {
  override name = "SearchQuotaExhausted";
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
