import type { Clock, ModelPort, SearchPort } from "../ports.js";

export const systemClock: Clock = { now: () => new Date() };

function notYet(port: string, ticket: string): never {
  throw new Error(`The ${port} adapter is not built yet (${ticket}); the run should not have called it.`);
}

// Placeholders until the real adapters land.
export const unbuiltModel: ModelPort = { complete: async () => notYet("model", "OpenRouter, issue #4") };
export const unbuiltSearch: SearchPort = { search: async () => notYet("search", "Tavily, issue #8") };
