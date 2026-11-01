/**
 * The promotion command (#255). Prints the events held for promotion on a host, what discovery remembers
 * of it, and a registry stanza drafted from them (`promote.ts`); with `--write`, appends the stanza to
 * `data/registry.yaml` under the promoted heading, once the registry with it still parses. A person then
 * writes its check hints, reviews the rest, and commits; the next run reads its pages and releases the
 * held events.
 *
 *   pnpm promote <host> [--write]
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import { parseConfig } from "./config.js";
import { parseDataset } from "./dataset.js";
import { promotionDraft, stanzaYaml, withPromoted } from "./promote.js";
import { parseRegistry } from "./registry.js";
import { toLocalDate } from "./time.js";

const ROOT = process.cwd();
const CONFIG_PATH = join(ROOT, "research.config.yaml");
const DATASET_PATH = join(ROOT, "data", "events.json");
const REGISTRY_PATH = join(ROOT, "data", "registry.yaml");

async function main() {
  const { values, positionals } = parseArgs({ options: { write: { type: "boolean" } }, allowPositionals: true });
  const [hostArg, ...extra] = positionals;
  if (hostArg === undefined || extra.length > 0) throw new Error("usage: pnpm promote <host> [--write]");

  const config = parseConfig(parseYaml(await readFile(CONFIG_PATH, "utf8")) ?? {});
  const dataset = parseDataset(JSON.parse(await readFile(DATASET_PATH, "utf8")), config);
  const registryText = await readFile(REGISTRY_PATH, "utf8");
  const registry = parseRegistry(parseYaml(registryText));
  const today = toLocalDate(new Date(), config.timezone);
  const { host, held, state, stanza } = promotionDraft(hostArg, { dataset, registry, config, today });

  console.log(`${held.length} event(s) held for promotion on ${host}:`);
  for (const e of held) console.log(`  ${e.title} | ${e.start ?? "no start"} | ${e.venue ?? "no venue"} | ${e.neighborhood} | ${e.primaryUrl}`);
  console.log(
    state === undefined
      ? "Discovery state: none."
      : `Discovery state: seen in ${state.runsSeen} run(s), last ${state.lastSeen}${state.runsUnseen ? `, unseen in the ${state.runsUnseen} run(s) since` : ""}.`,
  );
  console.log(`\nDrafted stanza:\n\n${stanzaYaml(stanza)}\n`);

  if (!values.write) {
    console.log("Nothing written; --write appends it to data/registry.yaml.");
    return;
  }
  const written = withPromoted(registryText, stanza);
  parseRegistry(parseYaml(written));
  await writeFile(REGISTRY_PATH, written);
  console.log("Appended to data/registry.yaml. Write its checkHints, review the rest, and commit.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
