import { parseConfig, type RunConfig } from "../../src/config.js";

export function testConfig(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    ...parseConfig({
      horizonWeeks: 8,
      timezone: "America/Chicago",
      geography: "Kansas City metro on both sides of the state line, plus Lawrence",
      spendCapUsd: 5,
      models: { extraction: "test/extraction", curation: "test/curation" },
      kinds: ["music", "other"],
      neighborhoods: ["Westport", "Lawrence", "Elsewhere in the metro"],
    }),
    ...overrides,
  };
}

export function testPrompts() {
  return { extractionRules: "TEST EXTRACTION RULES" };
}
