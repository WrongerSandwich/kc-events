/**
 * IndexNow's step of `scripts/weekly-run.sh` (#311), run after the deploy is confirmed: reads the two copies of the live
 * sitemap the script fetched (before the push, after the deploy; a missing or empty file is a fetch that failed), sends
 * IndexNow the URLs that changed between them (`indexnow.ts`), and prints the health comment's one line about it. With
 * `--dry-run` it prints the request bodies it would send instead, and touches no network.
 *
 *   tsx src/indexnow-cli.ts --before <file> --after <file> [--dry-run]
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ABOUT_URL } from "./adapters/identity.js";
import { type IndexNowBody, indexNowKey, indexNowNotice } from "./indexnow.js";

const ENDPOINT = "https://api.indexnow.org/indexnow";
/** The site's canonical origin, the one the user agent's About link already names. */
const ORIGIN = new URL(ABOUT_URL).origin;

/** A copy of the sitemap, or undefined when the script could not fetch it (no file, or an empty one). */
async function copy(path: string): Promise<string | undefined> {
  const text = await readFile(path, "utf8").catch(() => "");
  return text.trim() === "" ? undefined : text;
}

async function main() {
  const { values } = parseArgs({ options: { before: { type: "string" }, after: { type: "string" }, "dry-run": { type: "boolean" } } });
  if (values.before === undefined || values.after === undefined) throw new Error("usage: tsx src/indexnow-cli.ts --before <file> --after <file> [--dry-run]");
  const key = await indexNowKey(join(process.cwd(), "site", "public"));
  const post = values["dry-run"]
    ? async (body: IndexNowBody) => {
        console.log(JSON.stringify(body, null, 2));
        return 200;
      }
    : async (body: IndexNowBody) =>
        (
          await fetch(ENDPOINT, {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
          })
        ).status;
  const line = await indexNowNotice({ before: await copy(values.before), after: await copy(values.after), origin: ORIGIN, key, post });
  // A dry run's post answers 200 without sending, so only a "sent" line needs saying otherwise.
  console.log(values["dry-run"] ? line.replace(/^(IndexNow: \d+ URL\(s\)) sent \(.*\)$/, "$1 in the request(s) above, not sent (a dry run)") : line);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
