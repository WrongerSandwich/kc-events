import { parseConfig, type RunConfig } from "../../src/config.js";

/** The model ids the test config names; the fake model routes scripted replies by them. */
export const TEST_MODELS = { extraction: "test/extraction", curation: "test/curation" } as const;

export function testConfig(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    ...parseConfig({
      horizonWeeks: 8,
      timezone: "America/Chicago",
      geography: "Kansas City metro on both sides of the state line, plus Lawrence",
      spendCapUsd: 5,
      // One read of each page, so a test scripts one reply per page; the two-read tests set 2 (#224).
      extractionReads: 1,
      // One page at a time, so a test's scripted replies, fetches and calls keep their order; the concurrency tests set more (#252).
      concurrency: 1,
      models: { ...TEST_MODELS },
      kinds: ["music", "other"],
      neighborhoods: { "Central KC": ["Westport", "East Bottoms", "Crossroads"], Lawrence: ["Lawrence"] },
    }),
    ...overrides,
  };
}

export function testPrompts() {
  return { extractionRules: "TEST EXTRACTION RULES", curationPrompt: "TEST CURATION PROMPT", eventPageRules: "TEST EVENT PAGE RULES" };
}
