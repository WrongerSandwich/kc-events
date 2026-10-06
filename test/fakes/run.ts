import { expect } from "vitest";
import { run } from "../../src/run.js";
import type { RunConfig } from "../../src/config.js";
import { parseDataset, type Dataset } from "../../src/dataset.js";
import type { Source } from "../../src/registry.js";
import { fakePorts, type CannedPage, type ScriptedReply } from "./ports.js";
import { testConfig, testPrompts } from "./config.js";

/**
 * One run over these registry sources with canned pages and scripted model replies, under the test
 * config unless another is given. The dataset it returns must parse; the fake ports' calls come back
 * with the run's output.
 */
export async function runWith(
  now: Date,
  dataset: Dataset,
  {
    sources,
    pages,
    completions,
    config = testConfig(),
  }: { sources: Source[]; pages: Record<string, CannedPage>; completions: ScriptedReply[]; config?: RunConfig },
) {
  const fakes = fakePorts(now, { pages, completions });
  const result = await run({ config, prompts: testPrompts(), dataset, registry: { sources }, ports: fakes.ports });
  expect(parseDataset(result.dataset)).toEqual(result.dataset);
  return { ...result, calls: fakes.calls };
}
