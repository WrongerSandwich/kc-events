/**
 * The grading command. Reads a run report and the dataset, renders the milestone grading document
 * (filling counts three and four; keeping whatever is already written in it), and writes it.
 *
 *   pnpm grade [--run YYYY-MM-DD]     defaults to the latest run report in data/runs
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parseDataset } from "./dataset.js";
import { renderGrading } from "./grading.js";
import type { RunReport } from "./report.js";

const ROOT = process.cwd();
const RUNS_DIR = join(ROOT, "data", "runs");
const DATASET_PATH = join(ROOT, "data", "events.json");
const GRADING_PATH = join(ROOT, "docs", "milestone-one-grading.md");

async function latestRunDate(): Promise<string> {
  const dates = (await readdir(RUNS_DIR))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort();
  const latest = dates.at(-1);
  if (latest === undefined) throw new Error(`no run report in ${RUNS_DIR}; run \`pnpm research\` first`);
  return latest;
}

async function main() {
  const { values } = parseArgs({ options: { run: { type: "string" } } });
  const runDate = values.run ?? (await latestRunDate());
  const reportPath = join(RUNS_DIR, `${runDate}.json`);
  if (!existsSync(reportPath)) throw new Error(`no run report at ${reportPath}`);

  const report = JSON.parse(await readFile(reportPath, "utf8")) as RunReport;
  const dataset = parseDataset(JSON.parse(await readFile(DATASET_PATH, "utf8")));
  const existing = existsSync(GRADING_PATH) ? await readFile(GRADING_PATH, "utf8") : undefined;

  await mkdir(join(ROOT, "docs"), { recursive: true });
  await writeFile(GRADING_PATH, renderGrading({ report, dataset, existing }));
  console.log(`${existing === undefined ? "Wrote" : "Refreshed counts three and four in"} ${GRADING_PATH} from run ${runDate}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
