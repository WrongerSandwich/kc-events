/**
 * The research command's work, apart from the process: reads config, prompts, registry, and
 * dataset under a root directory, runs once through the given adapters, and writes the dataset, the
 * run report (Markdown plus JSON twin), and the archive files the run's archived records go to: only a
 * dataset that validates, and none of the files truncated; for one that does not, only the report and
 * the refused records, beside the reports. `cli.ts` calls it with the real adapters and the working
 * directory; tests, with fakes and a temporary one.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
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

/** The days a midweek pass's window reaches past today unless `--days` says otherwise (#253). */
const REVERIFY_DAYS = 10;

const positiveWhole = (value: string) => Number.isInteger(Number(value)) && Number(value) > 0;

/**
 * The run's config: the file's, with the command line's overrides (`--horizon-weeks N`,
 * `--no-discovery`, `--discovery` to run the lane whatever its cadence, #255), and whether it is a
 * midweek pass (`--reverify-only [--days N]`, #253), which turns discovery off. Throws on an argument it does not know, a horizon or window that is not a
 * positive whole number, `--days` without `--reverify-only`, and discovery left on with no Tavily key,
 * since every search would then fail one by one.
 */
export function runOptionsFromArgs(fileConfig: RunConfig, args: string[], env: Env): { config: RunConfig; reverifyOnly?: { days: number } } {
  const { values } = parseArgs({
    args,
    options: {
      "horizon-weeks": { type: "string" },
      discovery: { type: "boolean" },
      "no-discovery": { type: "boolean" },
      "reverify-only": { type: "boolean" },
      days: { type: "string" },
    },
  });
  if (values.discovery && values["no-discovery"]) throw new Error("--discovery and --no-discovery say opposite things; give one");
  if (values.discovery && values["reverify-only"]) throw new Error("--discovery has no place here: a --reverify-only run searches nothing");
  const horizon = values["horizon-weeks"];
  if (horizon !== undefined && !positiveWhole(horizon)) {
    throw new Error(`--horizon-weeks must be a positive whole number, got "${horizon}"`);
  }
  const days = values.days;
  if (days !== undefined && !values["reverify-only"]) throw new Error("--days is the window of a --reverify-only run; give both or neither");
  if (days !== undefined && !positiveWhole(days)) throw new Error(`--days must be a positive whole number, got "${days}"`);
  const reverifyOnly = values["reverify-only"] ? { days: days !== undefined ? Number(days) : REVERIFY_DAYS } : undefined;
  const config = {
    ...fileConfig,
    ...(horizon !== undefined ? { horizonWeeks: Number(horizon) } : {}),
    ...(values["no-discovery"] || reverifyOnly ? { discovery: { ...fileConfig.discovery, enabled: false } } : {}),
    // A hand run that forces the lane runs it whatever its cadence (#255).
    ...(values.discovery ? { discovery: { ...fileConfig.discovery, enabled: true, cadence: "weekly" as const } } : {}),
  };
  if (config.discovery.enabled && !env.TAVILY_API_KEY) {
    throw new Error("discovery is on but TAVILY_API_KEY is not set; put it in the environment or a gitignored .env");
  }
  return { config, ...(reverifyOnly && { reverifyOnly }) };
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

/** A record the dataset's schema refused, in full, with what the schema said of it; `event` is absent for an issue with the dataset as a whole. */
interface Refused {
  index?: number;
  messages: string[];
  event?: Event;
}

/** The schema's issues grouped by the event they are about, in the dataset's order, each message with the path below the event it names. */
function refusedEvents(error: z.ZodError, dataset: Dataset): Refused[] {
  const byIndex = new Map<number | undefined, string[]>();
  for (const issue of error.issues) {
    const [top, index, ...below] = issue.path;
    const at = top === "events" && typeof index === "number" ? index : undefined;
    const where = at === undefined ? issue.path : below;
    const message = where.length > 0 ? `${issue.message} (at ${where.join(".")})` : issue.message;
    byIndex.set(at, [...(byIndex.get(at) ?? []), message]);
  }
  return [...byIndex]
    .sort(([a], [b]) => (a ?? -1) - (b ?? -1))
    .map(([index, messages]) => (index === undefined ? { messages } : { index, messages, event: dataset.events[index] }));
}

/** The heading of a refused record's messages: its id, title, status, class, start and end. */
function refusedHeading(e: Event | undefined): string {
  if (e === undefined) return "the dataset as a whole:";
  return `${e.id} "${e.title}" (${e.status}, ${e.recurrence}, start ${e.start ?? "none"}, end ${e.end ?? "none"}):`;
}

/** One research run under `root`; resolves to its report and the paths it wrote: the archive files first, then the dataset and the report's two. */
export async function research({ root, args, env, adapters = realAdapters }: ResearchOptions): Promise<{ report: RunReport; written: string[] }> {
  const dataDir = join(root, "data");
  const datasetPath = join(dataDir, "events.json");
  const runsDir = join(dataDir, "runs");

  const fileConfig = parseConfig(parseYaml(await readFile(join(root, "research.config.yaml"), "utf8")) ?? {});
  const { config, reverifyOnly } = runOptionsFromArgs(fileConfig, args, env);

  const prompts = {
    extractionRules: await readFile(join(root, "prompts", "extraction-rules.md"), "utf8"),
    curationPrompt: await readFile(join(root, "prompts", "curation-prompt.md"), "utf8"),
    eventPageRules: await readFile(join(root, "prompts", "event-page-rules.md"), "utf8"),
  };
  const registry = parseRegistry(parseYaml(await readFile(join(dataDir, "registry.yaml"), "utf8")));
  const dataset = existsSync(datasetPath) ? parseDataset(JSON.parse(await readFile(datasetPath, "utf8")), config) : emptyDataset();

  const { ports, close } = adapters(config, env);
  const result = await run({ config, prompts, dataset, registry, ports, ...(reverifyOnly && { reverifyOnly }) }).finally(close);

  const reportBase = join(runsDir, result.report.runDate);

  // A dataset the next run could not load is not written, and neither is its report: the report goes
  // to a gitignored side file instead, with the records it refused, so the run's spend and readings
  // can still be looked at (#219).
  let checked: Dataset;
  try {
    checked = parseDataset(result.dataset, config);
  } catch (error) {
    const refusal = "the run produced a dataset that does not validate; nothing was written";
    if (!(error instanceof z.ZodError)) throw new Error(refusal, { cause: error });
    const refused = refusedEvents(error, result.dataset);
    const sidePath = `${reportBase}.failed.json`;
    let sideNote = `the run's report and the refused records are in data/runs/${result.report.runDate}.failed.json`;
    try {
      await mkdir(runsDir, { recursive: true });
      await writeAllOrNothing([{ path: sidePath, content: JSON.stringify({ refused, report: result.report }, null, 2) + "\n" }]);
    } catch (writeError) {
      sideNote = `the run's report could not be kept either (${String(writeError)})`;
    }
    const lines = refused.map(({ event, messages }) => `  ${refusedHeading(event)}\n${messages.map((m) => `    - ${m}`).join("\n")}`);
    // No cause: the lines carry every issue, and Zod's JSON of them would push them out of the health comment's 40-line log tail.
    throw new Error(`${refusal}, and ${sideNote}.\n${lines.join("\n")}`);
  }

  const archives = await archiveFiles(dataDir, result.archived, config);
  await mkdir(runsDir, { recursive: true });
  if (archives.length > 0) await mkdir(join(dataDir, "archive"), { recursive: true });
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
