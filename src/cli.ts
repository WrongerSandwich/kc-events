/**
 * The research command. Does all file I/O: loads config, prompts, registry, and dataset, builds
 * the adapters, calls the run, and writes the dataset and the run report (Markdown plus JSON twin).
 * BROWSER_CHANNEL=chrome has the browser fetcher use an installed Chrome instead of Playwright's Chromium.
 *
 *   pnpm research [--horizon-weeks N] [--no-discovery]
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import { parseConfig } from "./config.js";
import { emptyDataset, parseDataset } from "./dataset.js";
import { parseRegistry } from "./registry.js";
import { renderReportMarkdown } from "./report.js";
import { run } from "./run.js";
import { systemClock } from "./adapters/system.js";
import { createBrowserFetcher } from "./adapters/browser-fetcher.js";
import { createFetcher } from "./adapters/fetcher.js";
import { createOpenRouterModel } from "./adapters/openrouter.js";
import { createTavilySearch } from "./adapters/tavily.js";

const ROOT = process.cwd();
const CONFIG_PATH = join(ROOT, "research.config.yaml");
const DATA_DIR = join(ROOT, "data");
const REGISTRY_PATH = join(DATA_DIR, "registry.yaml");
const DATASET_PATH = join(DATA_DIR, "events.json");
const RUNS_DIR = join(DATA_DIR, "runs");
const EXTRACTION_RULES_PATH = join(ROOT, "prompts", "extraction-rules.md");
const CURATION_PROMPT_PATH = join(ROOT, "prompts", "curation-prompt.md");

async function main() {
  const { values } = parseArgs({ options: { "horizon-weeks": { type: "string" }, "no-discovery": { type: "boolean" } } });

  if (existsSync(join(ROOT, ".env"))) process.loadEnvFile(join(ROOT, ".env"));

  const fileConfig = parseConfig(parseYaml(await readFile(CONFIG_PATH, "utf8")) ?? {});
  const horizon = values["horizon-weeks"];
  if (horizon !== undefined && !(Number.isInteger(Number(horizon)) && Number(horizon) > 0)) {
    throw new Error(`--horizon-weeks must be a positive whole number, got "${horizon}"`);
  }
  const config = {
    ...fileConfig,
    ...(horizon !== undefined ? { horizonWeeks: Number(horizon) } : {}),
    ...(values["no-discovery"] ? { discovery: { ...fileConfig.discovery, enabled: false } } : {}),
  };

  // Checked up front: without it every search would fail one by one.
  if (config.discovery.enabled && !process.env.TAVILY_API_KEY) {
    throw new Error("discovery is on but TAVILY_API_KEY is not set; put it in the environment or a gitignored .env");
  }

  const prompts = {
    extractionRules: await readFile(EXTRACTION_RULES_PATH, "utf8"),
    curationPrompt: await readFile(CURATION_PROMPT_PATH, "utf8"),
  };
  const registry = parseRegistry(parseYaml(await readFile(REGISTRY_PATH, "utf8")));
  const dataset = existsSync(DATASET_PATH)
    ? parseDataset(JSON.parse(await readFile(DATASET_PATH, "utf8")))
    : emptyDataset();

  const fetcher = createFetcher();
  const browserFetcher = createBrowserFetcher(fetcher, { channel: process.env.BROWSER_CHANNEL || undefined });
  const result = await run({
    config,
    prompts,
    dataset,
    registry,
    ports: {
      model: createOpenRouterModel({ apiKey: process.env.OPENROUTER_API_KEY }),
      search: createTavilySearch({ apiKey: process.env.TAVILY_API_KEY, maxResults: config.discovery.resultsPerQuery }),
      fetcher,
      browserFetcher,
      clock: systemClock,
    },
  }).finally(() => browserFetcher.close());

  await mkdir(RUNS_DIR, { recursive: true });
  const reportBase = join(RUNS_DIR, result.report.runDate);
  await writeFile(DATASET_PATH, JSON.stringify(result.dataset, null, 2) + "\n");
  await writeFile(`${reportBase}.json`, JSON.stringify(result.report, null, 2) + "\n");
  await writeFile(`${reportBase}.md`, renderReportMarkdown(result.report));

  const { counts, spend, discovery, curation, promotionSuggestions } = result.report;
  const expired = Object.values(counts.expired).reduce((sum, n) => sum + n, 0);
  console.log(
    `Run ${result.report.runDate}: ${counts.found} found, ${counts.new} new, ${counts.updated} updated, ${counts.reverified} re-verified, ` +
      `${counts.heldUnverified} held unverified, ${expired} expired; ` +
      `${spend.totalUsd.toFixed(4)} of ${spend.capUsd} USD` +
      (spend.capHit
        ? `, cap hit (${spend.shortfall.pagesNotExtracted} page(s) not extracted, ${spend.shortfall.eventsNotReverified} event(s) not re-verified, ` +
          `${spend.shortfall.queriesNotSearched} search(es) not made, ${spend.shortfall.leadsNotFollowed} lead(s) not followed, ` +
          `${spend.shortfall.eventsNotCurated} event(s) not curated).`
        : "."),
  );
  if (discovery.enabled) {
    console.log(
      `Discovery: ${discovery.queries} search(es), ${discovery.aggregatorPages} index page(s) read for links, ` +
        `${discovery.pagesExtracted} primary page(s) extracted; ${promotionSuggestions.length} promotion suggestion(s).`,
    );
  }
  console.log(
    `Curation: ${curation.calls} call(s), ${curation.judged} event(s) judged, ${curation.flagged} flagged don't-miss` +
      (curation.problems.length > 0 ? `, ${curation.problems.length} problem(s).` : "."),
  );
  console.log(`Wrote ${DATASET_PATH}, ${reportBase}.md, ${reportBase}.json`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
