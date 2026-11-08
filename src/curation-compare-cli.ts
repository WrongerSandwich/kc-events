/**
 * The curation prompt comparison (ADR 0014), outside the weekly run: judges the dataset's eligible events several
 * times under the current curation prompt, and under a candidate prompt file when `--prompt` names one, through the
 * run's own request (`buildCurationRequest`, batches formed as the run forms them), and writes the scores
 * (`curation-compare.ts`) to `docs/curation-comparison/<date>[-<tag>].md`. Touches nothing the weekly run reads or
 * writes; the trials go to the gitignored `.cache/curation-compare/`. Reads OPENROUTER_API_KEY from the environment
 * or a gitignored `.env`.
 *
 *   pnpm compare-curation [--repeats 3] [--prompt path] [--sample N] [--seed s] [--cap 8] [--tag name] [--fresh]
 *
 * Each trial is appended to the day's `trials.jsonl` as it lands, and a comparison started again the same day
 * makes only the trials not already there (unless --fresh), so a stopped one loses nothing. The convention: a
 * curation prompt edit lands with its comparison report in the same commit.
 */
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import { createOpenRouterModel } from "./adapters/openrouter.js";
import { systemClock } from "./adapters/system.js";
import { parseConfig } from "./config.js";
import { buildCurationRequest, CURATION_BATCH_SIZE, curationReplySchema, promptHash, type CurationContext } from "./curation.js";
import { promptDiff, renderCurationComparison, sampleEligible, scoreRepeats, type CurationTrial, type PromptSide } from "./curation-compare.js";
import { parseDataset, type Event } from "./dataset.js";
import { byKindThenDate } from "./run.js";
import { capSpend, SpendCapReached } from "./spend.js";
import { toLocalDate } from "./time.js";

const ROOT = process.cwd();
const CACHE = join(ROOT, ".cache", "curation-compare");

async function main() {
  if (existsSync(join(ROOT, ".env"))) process.loadEnvFile(join(ROOT, ".env"));
  const { values } = parseArgs({
    options: {
      repeats: { type: "string", default: "3" },
      prompt: { type: "string" },
      sample: { type: "string" },
      seed: { type: "string", default: "kc-this-week" },
      cap: { type: "string", default: "8" },
      tag: { type: "string" },
      fresh: { type: "boolean", default: false },
    },
  });
  if (values.tag !== undefined && !/^[a-z0-9-]+$/.test(values.tag)) throw new Error("--tag must be lowercase letters, digits and dashes");
  const repeats = Number(values.repeats);
  const capUsd = Number(values.cap);
  const sample = values.sample === undefined ? undefined : Number(values.sample);
  for (const [name, n] of [["repeats", repeats], ["cap", capUsd], ...(sample === undefined ? [] : [["sample", sample] as const])] as const) {
    if (!(n > 0)) throw new Error(`--${name} must be a positive number`);
  }

  const config = parseConfig(parseYaml(await readFile(join(ROOT, "research.config.yaml"), "utf8")) ?? {});
  const dataset = parseDataset(JSON.parse(await readFile(join(ROOT, "data", "events.json"), "utf8")), config);
  const prompts: { side: PromptSide; text: string }[] = [{ side: "current", text: await readFile(join(ROOT, "prompts", "curation-prompt.md"), "utf8") }];
  if (values.prompt !== undefined) prompts.push({ side: "candidate", text: await readFile(values.prompt, "utf8") });

  const today = toLocalDate(new Date(), config.timezone);
  const events = sampleEligible(dataset.events, sample, values.seed).sort(byKindThenDate);
  const name = values.tag === undefined ? today : `${today}-${values.tag}`;
  const runDir = join(CACHE, name);
  const trialsPath = join(runDir, "trials.jsonl");
  await mkdir(runDir, { recursive: true });
  if (values.fresh) await rm(trialsPath, { force: true });
  const trials: CurationTrial[] = existsSync(trialsPath)
    ? (await readFile(trialsPath, "utf8"))
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as CurationTrial)
    : [];
  const done = new Set(trials.map((t) => `${t.prompt} ${t.repeat} ${t.id}`));
  if (trials.length > 0) console.log(`${trials.length} trial(s) already saved under ${name}; making only the rest`);
  console.log(`${events.length} event(s) × ${repeats} repeat(s) × ${prompts.length} prompt(s), cap ${capUsd} USD, model ${config.models.curation}`);

  const model = capSpend(createOpenRouterModel({ apiKey: process.env.OPENROUTER_API_KEY }), capUsd, systemClock);
  const started = Date.now();
  let capHit = false;
  const batches: Event[][] = [];
  for (let i = 0; i < events.length; i += CURATION_BATCH_SIZE) batches.push(events.slice(i, i + CURATION_BATCH_SIZE));

  outer: for (const { side, text } of prompts) {
    const context: CurationContext = { config, curationPrompt: text, today };
    for (let repeat = 0; repeat < repeats; repeat++) {
      for (const batch of batches) {
        const pending = batch.filter((e) => !done.has(`${side} ${repeat} ${e.id}`));
        if (pending.length === 0) continue;
        let costUsd = 0;
        let judgments: CurationTrial[] = [];
        try {
          const reply = await model.complete(buildCurationRequest(pending, context));
          costUsd = reply.costUsd;
          const parsed = curationReplySchema.safeParse(reply.value);
          if (!parsed.success) {
            console.log(`a reply under ${side}, repeat ${repeat}, was not in the expected shape; ${pending.length} event(s) left unjudged this repeat`);
            continue;
          }
          const ids = new Set(pending.map((e) => e.id));
          const perEvent = costUsd / Math.max(1, parsed.data.judgments.length);
          judgments = parsed.data.judgments
            .filter((j) => ids.has(j.id))
            .map((j) => ({ prompt: side, repeat, id: j.id, verdict: j.verdict, reason: j.reason, why: j.why, costUsd: perEvent }));
        } catch (error) {
          if (error instanceof SpendCapReached) {
            capHit = true;
            console.log(`cap hit at ${model.totalUsd().toFixed(3)} USD`);
            break outer;
          }
          console.log(`a call under ${side}, repeat ${repeat}, failed: ${error instanceof Error ? error.message : String(error)}`);
          continue;
        }
        for (const t of judgments) {
          trials.push(t);
          done.add(`${t.prompt} ${t.repeat} ${t.id}`);
          await appendFile(trialsPath, `${JSON.stringify(t)}\n`);
        }
        console.log(`${side} repeat ${repeat + 1}/${repeats}: ${trials.length} trial(s), ${model.totalUsd().toFixed(3)} USD this time`);
      }
    }
  }

  const sampled = new Set(events.map((e) => e.id));
  const scored = trials.filter((t) => sampled.has(t.id));
  const markdown = renderCurationComparison(scoreRepeats(scored, dataset.events), promptDiff(scored, events), {
    date: today,
    model: config.models.curation,
    currentHash: promptHash(prompts[0]!.text),
    ...(prompts[1] ? { candidateHash: promptHash(prompts[1].text) } : {}),
    sample: events.length,
    minutes: (Date.now() - started) / 60_000,
    capHit,
  });
  const docDir = join(ROOT, "docs", "curation-comparison");
  await mkdir(docDir, { recursive: true });
  const docPath = join(docDir, `${name}.md`);
  await writeFile(docPath, `${markdown}\n`);
  console.log(`${scored.length} trial(s), ${model.totalUsd().toFixed(3)} USD${capHit ? ", cap hit" : ""}. Wrote ${docPath}; trials in ${trialsPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
