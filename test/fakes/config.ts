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
      models: { ...TEST_MODELS },
      kinds: ["music", "other"],
      neighborhoods: ["Westport", "Lawrence", "Elsewhere in the metro"],
    }),
    ...overrides,
  };
}

export function testPrompts() {
  return { extractionRules: "TEST EXTRACTION RULES", curationPrompt: "TEST CURATION PROMPT" };
}
