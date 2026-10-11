/**
 * The research command's work, apart from the process: reads config, prompts, registry, and
 * dataset under a root directory, runs once through the given adapters, and writes the dataset, the
 * run report (Markdown plus JSON twin), and the archive files the run's archived records go to: only a
 * dataset that validates, and none of the files truncated. `cli.ts` calls it with the real adapters and the working directory; tests, with fakes
 * and a temporary one.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import { addToArchive, byArchiveYear } from "./archive.js";
import { parseConfig, type RunConfig } from "./config.js";
import { DATASET_SCHEMA_VERSION, emptyDataset, parseArchive, parseDataset, type Archive, type Dataset, type Event } from "./dataset.js";
import type { Ports } from "./ports.js";
import { parseRegistry } from "./registry.js";
import { renderReportMarkdown, type RunReport } from "./report.js";
import { run } from "./run.js";
import { writeAllOrNothing, type FileToWrite } from "./write-files.js";
import { systemClock } from "./adapters/system.js";
import { createBrowserFetcher } from "./adapters/browser-fetcher.js";
import { createFetcher } from "./adapters/fetcher.js";
import { createOpenRouterModel } from "./adapters/openrouter.js";
import { createTavilySearch } from "./adapters/tavily.js";

type Env = Record<string, string | undefined>;

/**
 * The run's config: the file's, with the command line's overrides (`--horizon-weeks N`,
 * `--no-discovery`). Throws on an argument it does not know, a horizon that is not a positive whole
 * number, and discovery left on with no Tavily key, since every search would then fail one by one.
 */
export function configFromArgs(fileConfig: RunConfig, args: string[], env: Env): RunConfig {
  const { values } = parseArgs({ args, options: { "horizon-weeks": { type: "string" }, "no-discovery": { type: "boolean" } } });
  const horizon = values["horizon-weeks"];
  if (horizon !== undefined && !(Number.isInteger(Number(horizon)) && Number(horizon) > 0)) {
    throw new Error(`--horizon-weeks must be a positive whole number, got "${horizon}"`);
  }
  const config = {
    ...fileConfig,
    ...(horizon !== undefined ? { horizonWeeks: Number(horizon) } : {}),
    ...(values["no-discovery"] ? { discovery: { ...fileConfig.discovery, enabled: false } } : {}),
  };
  if (config.discovery.enabled && !env.TAVILY_API_KEY) {
    throw new Error("discovery is on but TAVILY_API_KEY is not set; put it in the environment or a gitignored .env");
  }
  return config;
}

/** The ports a run talks to the world through, and how to let go of them once it is done. */
export interface Adapters {
  ports: Ports;
  close(): Promise<void>;
}

/** The real adapters. BROWSER_CHANNEL=chrome has the browser fetcher use an installed Chrome instead of Playwright's Chromium. */
export function realAdapters(config: RunConfig, env: Env): Adapters {
  const fetcher = createFetcher();
  const browserFetcher = createBrowserFetcher(fetcher, { channel: env.BROWSER_CHANNEL || undefined });
  return {
    ports: {
      model: createOpenRouterModel({ apiKey: env.OPENROUTER_API_KEY }),
      search: createTavilySearch({ apiKey: env.TAVILY_API_KEY, maxResults: config.discovery.resultsPerQuery }),
      fetcher,
      browserFetcher,
      clock: systemClock,
    },
    close: () => browserFetcher.close(),
  };
}

export interface ResearchOptions {
  /** The directory holding `research.config.yaml`, `prompts/` and `data/`. */
  root: string;
  /** The command-line arguments, without node and the script. */
  args: string[];
  env: Env;
  adapters?: (config: RunConfig, env: Env) => Adapters;
}

/**
 * The archive files a run's archived records go to (#82), `data/archive/<year>.json`, each with what
 * it held before. An archive file that does not load stops the run's writes, so no record is lost.
 */
async function archiveFiles(dataDir: string, archived: Event[], config: RunConfig): Promise<FileToWrite[]> {
  const files: FileToWrite[] = [];
  for (const [year, events] of byArchiveYear(archived)) {
    const path = join(dataDir, "archive", `${year}.json`);
    let archive: Archive = { schemaVersion: DATASET_SCHEMA_VERSION, events: [] };
    try {
      if (existsSync(path)) archive = parseArchive(JSON.parse(await readFile(path, "utf8")), config);
    } catch (error) {
      throw new Error(`data/archive/${year}.json does not load; nothing was written`, { cause: error });
    }
    files.push({ path, content: JSON.stringify(addToArchive(archive, events), null, 2) + "\n" });
  }
  return files;
}

/** One research run under `root`; resolves to its report and the paths it wrote: the archive files first, then the dataset and the report's two. */
export async function research({ root, args, env, adapters = realAdapters }: ResearchOptions): Promise<{ report: RunReport; written: string[] }> {
  const dataDir = join(root, "data");
  const datasetPath = join(dataDir, "events.json");
  const runsDir = join(dataDir, "runs");

  const fileConfig = parseConfig(parseYaml(await readFile(join(root, "research.config.yaml"), "utf8")) ?? {});
  const config = configFromArgs(fileConfig, args, env);

  const prompts = {
    extractionRules: await readFile(join(root, "prompts", "extraction-rules.md"), "utf8"),
    curationPrompt: await readFile(join(root, "prompts", "curation-prompt.md"), "utf8"),
  };
  const registry = parseRegistry(parseYaml(await readFile(join(dataDir, "registry.yaml"), "utf8")));
  const dataset = existsSync(datasetPath) ? parseDataset(JSON.parse(await readFile(datasetPath, "utf8")), config) : emptyDataset();

  const { ports, close } = adapters(config, env);
  const result = await run({ config, prompts, dataset, registry, ports }).finally(close);

  // A dataset the next run could not load is not written, and neither is its report.
  let checked: Dataset;
  try {
    checked = parseDataset(result.dataset, config);
  } catch (error) {
    throw new Error("the run produced a dataset that does not validate; nothing was written", { cause: error });
  }

  const archives = await archiveFiles(dataDir, result.archived, config);
  await mkdir(runsDir, { recursive: true });
  if (archives.length > 0) await mkdir(join(dataDir, "archive"), { recursive: true });
  const reportBase = join(runsDir, result.report.runDate);
  // The archive goes first: a run cut short between renames leaves a record in both files, never in neither.
  const files = [
    ...archives,
    { path: datasetPath, content: JSON.stringify(checked, null, 2) + "\n" },
    { path: `${reportBase}.json`, content: JSON.stringify(result.report, null, 2) + "\n" },
    { path: `${reportBase}.md`, content: renderReportMarkdown(result.report) },
  ];
  await writeAllOrNothing(files);
  return { report: result.report, written: files.map((f) => f.path) };
}
