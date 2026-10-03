import type { Clock, SearchPort } from "../ports.js";

export const systemClock: Clock = { now: () => new Date() };

function notYet(port: string, ticket: string): never {
  throw new Error(`The ${port} adapter is not built yet (${ticket}); the run should not have called it.`);
}

// Placeholder until the real adapter lands.
export const unbuiltSearch: SearchPort = { search: async () => notYet("search", "Tavily, issue #8") };
