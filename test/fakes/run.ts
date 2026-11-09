import { expect } from "vitest";
import { run } from "../../src/run.js";
import type { RunConfig } from "../../src/config.js";
import { parseDataset, type Dataset } from "../../src/dataset.js";
import type { HandPick } from "../../src/hand-picks.js";
import type { CompletionRequest, CompletionResult, SearchResult } from "../../src/ports.js";
import type { Source } from "../../src/registry.js";
import type { VenueRow } from "../../src/venues.js";
import { fakePorts, type CannedPage, type ScriptedReply } from "./ports.js";
import { testConfig, testPrompts } from "./config.js";

/**
 * One run over these registry sources with canned pages and scripted model replies, under the test
 * config unless another is given, and with these search results by query when the config turns
 * discovery on, and with curation's unscripted replies from `curate` when given, and as a midweek pass when `reverifyOnly` is given. The dataset it returns must parse; the fake ports' calls come back
 * and model requests come back with the run's output. Each canned page carries the quotes the
 * scripted replies make, as a real page carries what the model quotes from it, unless
 * `pagesCarryQuotes` is false.
 */
export async function runWith(
  now: Date,
  dataset: Dataset,
  {
    sources,
    pages,
    completions,
    config = testConfig(),
    searches,
    pagesCarryQuotes = true,
    curate,
    curations,
    handPicks,
    venues,
    reverifyOnly,
  }: {
    sources: Source[];
    pages: Record<string, CannedPage>;
    completions: ScriptedReply[];
    config?: RunConfig;
    searches?: Record<string, SearchResult[] | Error>;
    pagesCarryQuotes?: boolean;
    curate?: (request: CompletionRequest) => CompletionResult;
    /** Scripted curation replies, taken in order before `curate` answers. */
    curations?: ScriptedReply[];
    /** Entries of data/picks.yaml, applied after curation (ADR 0014). */
    handPicks?: HandPick[];
    /** Rows of data/venues.yaml; a row's neighborhood places every event at its venue (#258). */
    venues?: VenueRow[];
    reverifyOnly?: { days: number };
  },
) {
  const fakes = fakePorts(now, { pages, completions, pagesCarryQuotes, ...(searches ? { searches } : {}), ...(curate ? { curate } : {}), ...(curations ? { curations } : {}) });
  const result = await run({
    config,
    prompts: testPrompts(),
    dataset,
    registry: { sources },
    ports: fakes.ports,
    ...(handPicks ? { handPicks } : {}),
    ...(venues ? { venues } : {}),
    ...(reverifyOnly && { reverifyOnly }),
  });
  expect(parseDataset(result.dataset, config)).toEqual(result.dataset);
  return { ...result, calls: fakes.calls, requests: fakes.requests };
}
