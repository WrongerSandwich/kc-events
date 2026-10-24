/**
 * The extraction model comparison (#222). Saves every active registry source's pages once (each
 * source's own fetch, plain or browser), has each model read every saved page several times through
 * the run's own extraction, and writes the scores (`model-compare.ts`) to `docs/model-comparison/`.
 * Touches nothing the weekly run reads or writes; the pages and every trial go to the gitignored
 * `.cache/model-compare/`. Reads OPENROUTER_API_KEY from the environment or a gitignored `.env`.
 *
 *   pnpm compare-models [--models a,b,...] [--repeats 3] [--cap 6] [--concurrency 2] [--refetch] [--fresh]
 *
 * Each trial is appended to the day's `trials.jsonl` as it lands, and a comparison started again the
 * same day makes only the trials not already there (unless --fresh), so a stopped one loses nothing.
 * The cap counts this invocation's calls only. The report scores every saved trial of the models asked for.
 *
 * Pages saved by an earlier comparison are read again unless --refetch, so models added later read
 * the very same pages. Trials go out repeat by repeat, so a cap hit leaves every page read at least
 * as often by each model as the repeats that were finished.
 */
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import { createOpenRouterModel } from "./adapters/openrouter.js";
import { parseConfig, type RunConfig } from "./config.js";
import { parseDataset } from "./dataset.js";
import type { ExtractionContext } from "./extraction.js";
import { HARD_CASES, renderComparison, scoreModels, trialEvent, type Trial } from "./model-compare.js";
import { ModelReplyUnusable, type FetchResult, type ModelPort } from "./ports.js";
import { parseRegistry, type Source } from "./registry.js";
import { realAdapters } from "./research.js";
import { checkSource, extractPage } from "./run.js";
import { capSpend, SpendCapReached } from "./spend.js";
import { neighborhoodList } from "./taxonomy.js";
import { toLocalDate, toLocalIso } from "./time.js";

const DEFAULT_MODELS = [
  "openai/gpt-6-luna",
  "openai/gpt-6-luna-pro",
  "anthropic/claude-haiku-5.5",
  "deepseek/deepseek-v4-flash",
  "qwen/qwen3.8-flash",
  "mistralai/mistral-small-2603",
  "google/gemini-3.1-flash-lite",
];

interface SavedPages {
  fetchedAt: string;
  pages: { source: string; key: string; page: FetchResult }[];
  unfetched: string[];
}

const ROOT = process.cwd();
const CACHE = join(ROOT, ".cache", "model-compare");
const PAGES_PATH = join(CACHE, "pages.json");

async function savePages(config: RunConfig, sources: Source[]): Promise<SavedPages> {
  const adapters = realAdapters(config, process.env);
  const pages: SavedPages["pages"] = [];
  const unfetched: string[] = [];
  try {
    for (const source of sources) {
      const checked = await checkSource(source, adapters.ports);
      for (const page of checked.pages) pages.push({ source: source.name, key: `${source.name} ${page.url}`, page });
      if (checked.report.result !== "fetched") unfetched.push(`${source.name} (${checked.report.result}${checked.report.detail ? `: ${checked.report.detail.slice(0, 120)}` : ""})`);
      console.log(`fetched ${source.name}: ${checked.pages.length} page(s)${checked.report.result === "fetched" ? "" : `, ${checked.report.result}`}`);
    }
  } finally {
    await adapters.close();
  }
  const saved = { fetchedAt: new Date().toISOString(), pages, unfetched };
  await mkdir(CACHE, { recursive: true });
  await writeFile(PAGES_PATH, JSON.stringify(saved));
  return saved;
}

/** A model port that records the cost of the one call it makes, whether it came back usable or not. */
function metered(model: ModelPort) {
  let costUsd = 0;
  return {
    port: {
      async complete(request) {
        try {
          const result = await model.complete(request);
          costUsd += result.costUsd;
          return result;
        } catch (error) {
          if (error instanceof ModelReplyUnusable) costUsd += error.costUsd ?? 0;
          throw error;
        }
      },
    } satisfies ModelPort,
    cost: () => costUsd,
  };
}

/**
 * A call a provider refused for its rate limit (429) is tried again after a pause, up to four times: it
 * says nothing about the model, and a comparison scoring it as a failure would be scoring the provider.
 */
async function rateLimited<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (attempt >= 4 || !(error instanceof Error) || !error.message.startsWith("429")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5_000 * 2 ** attempt));
    }
  }
}

async function main() {
  if (existsSync(join(ROOT, ".env"))) process.loadEnvFile(join(ROOT, ".env"));
  const { values } = parseArgs({
    options: {
      models: { type: "string" },
      repeats: { type: "string", default: "3" },
      cap: { type: "string", default: "6" },
      concurrency: { type: "string", default: "2" },
      refetch: { type: "boolean", default: false },
      fresh: { type: "boolean", default: false },
    },
  });
  const models = values.models ? values.models.split(",").map((m) => m.trim()).filter(Boolean) : DEFAULT_MODELS;
  const repeats = Number(values.repeats);
  const capUsd = Number(values.cap);
  const concurrency = Number(values.concurrency);
  for (const [name, n] of [["repeats", repeats], ["cap", capUsd], ["concurrency", concurrency]] as const) {
    if (!(n > 0)) throw new Error(`--${name} must be a positive number`);
  }

  const config = parseConfig(parseYaml(await readFile(join(ROOT, "research.config.yaml"), "utf8")) ?? {});
  const registry = parseRegistry(parseYaml(await readFile(join(ROOT, "data", "registry.yaml"), "utf8")));
  const rules = await readFile(join(ROOT, "prompts", "extraction-rules.md"), "utf8");
  const dataset = parseDataset(JSON.parse(await readFile(join(ROOT, "data", "events.json"), "utf8")), config);
  const sources = registry.sources.filter((s): s is Source & { status: "active" } => s.status === "active");

  const saved = existsSync(PAGES_PATH) && !values.refetch ? (JSON.parse(await readFile(PAGES_PATH, "utf8")) as SavedPages) : await savePages(config, sources);
  const fetchedAt = new Date(saved.fetchedAt);
  console.log(`${saved.pages.length} saved page(s) from ${saved.fetchedAt}; ${models.length} model(s) × ${repeats} repeat(s), cap ${capUsd} USD`);

  // The pages' own day, so a comparison read later resolves "this Friday" as the run that fetched them would.
  const context = (model: string): ExtractionContext => ({
    config: { ...config, models: { ...config.models, extraction: model } },
    rules,
    today: toLocalDate(fetchedAt, config.timezone),
    nowIso: toLocalIso(fetchedAt, config.timezone),
    neighborhoods: neighborhoodList(config, registry),
  });
  const date = toLocalDate(new Date(), config.timezone);
  const runDir = join(CACHE, date);
  const trialsPath = join(runDir, "trials.jsonl");
  await mkdir(runDir, { recursive: true });
  // Trials of other pages (a --refetch since) are not this comparison's.
  if (values.fresh || values.refetch) await rm(trialsPath, { force: true });
  const pageKeys = new Set(saved.pages.map((p) => p.key));
  const trials: Trial[] = existsSync(trialsPath)
    ? (await readFile(trialsPath, "utf8"))
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Trial)
        .filter((t) => pageKeys.has(t.page))
    : [];
  const done = new Set(trials.map((t) => `${t.model} ${t.page} ${t.repeat}`));
  if (trials.length > 0) console.log(`${trials.length} trial(s) already saved today; making only the rest`);
  const record = async (trial: Trial) => {
    trials.push(trial);
    await appendFile(trialsPath, `${JSON.stringify(trial)}\n`);
  };
  const capped = capSpend(createOpenRouterModel({ apiKey: process.env.OPENROUTER_API_KEY }), capUsd);
  const sourceByName = new Map(sources.map((s) => [s.name, s]));
  let capHit = false;

  const runModel = async (model: string) => {
    const ctx = context(model);
    const queue = Array.from({ length: repeats }, (_, repeat) => saved.pages.map((p) => ({ ...p, repeat })))
      .flat()
      .filter((task) => !done.has(`${model} ${task.key} ${task.repeat}`));
    const worker = async () => {
      for (let task = queue.shift(); task !== undefined && !capHit; task = queue.shift()) {
        const source = sourceByName.get(task.source);
        if (source === undefined) continue;
        const meter = metered(capped);
        const started = Date.now();
        const base = { model, page: task.key, source: task.source, repeat: task.repeat };
        try {
          const result = await rateLimited(() => extractPage(task.page, { lane: "registry", source }, meter.port, ctx));
          const ms = Date.now() - started;
          await record(
            result.sightings === undefined
              ? { ...base, costUsd: meter.cost(), ms, error: result.problems[0] ?? "reply not in the expected shape" }
              : { ...base, costUsd: meter.cost(), ms, extracted: result.extracted, events: result.sightings.map(trialEvent) },
          );
        } catch (error) {
          if (error instanceof SpendCapReached) {
            capHit = true;
            break;
          }
          await record({ ...base, costUsd: meter.cost(), ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
        }
        if (trials.length % 50 === 0) console.log(`${trials.length} trial(s), ${capped.totalUsd().toFixed(3)} USD this time`);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    console.log(`done: ${model}`);
  };
  await Promise.all(models.map(runModel));

  const scores = scoreModels(models, trials.filter((t) => models.includes(t.model)), dataset.events, HARD_CASES);
  const markdown = renderComparison(scores, {
    date,
    pages: saved.pages.length,
    sources: new Set(saved.pages.map((p) => p.source)).size,
    repeats,
    capUsd,
    spentUsd: trials.filter((t) => models.includes(t.model)).reduce((sum, t) => sum + t.costUsd, 0),
    capHit,
    unfetched: saved.unfetched,
  });
  const docDir = join(ROOT, "docs", "model-comparison");
  await mkdir(docDir, { recursive: true });
  const docPath = join(docDir, `${date}.md`);
  await writeFile(docPath, markdown);
  console.log(`${trials.length} trial(s), ${capped.totalUsd().toFixed(3)} USD${capHit ? ", cap hit" : ""}. Wrote ${docPath}; trials in ${trialsPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
