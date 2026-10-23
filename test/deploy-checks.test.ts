import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// scripts/deploy-checks.sh holds what scripts/weekly-run.sh asks about the deploy (#191): Vercel's commit status for the
// run's commit, polled after the push, and the daily deploy's failures since the last run (scripts/daily-deploy.sh's
// deploy.log). Driven here with a fake gh on PATH that answers from a queue of canned replies.

const SCRIPT = new URL("../scripts/deploy-checks.sh", import.meta.url).pathname;

const made: string[] = [];
afterEach(async () => {
  await Promise.all(made.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A gh that prints its next canned reply (a line "exit N" first makes it exit N, its stderr the rest), recording its arguments. */
async function fakeGh(replies: string[]) {
  const dir = await mkdtemp(join(tmpdir(), "kc-deploy-checks-"));
  made.push(dir);
  const bin = join(dir, "bin");
  await mkdir(bin);
  for (const [i, reply] of replies.entries()) await writeFile(join(dir, `reply-${i}`), reply);
  await writeFile(join(dir, "n"), "0");
  await writeFile(
    join(bin, "gh"),
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${dir}/calls"
n=$(cat "${dir}/n"); echo $((n + 1)) > "${dir}/n"
f="${dir}/reply-$n"; [[ -f $f ]] || f="${dir}/reply-${replies.length - 1}"
if [[ $(head -n1 "$f") =~ ^exit\\ ([0-9]+)$ ]]; then tail -n +2 "$f" >&2; exit "\${BASH_REMATCH[1]}"; fi
cat "$f"
`,
  );
  await chmod(join(bin, "gh"), 0o755);
  const run = (command: string, env: Record<string, string> = {}) =>
    execFileSync("bash", ["-c", `set -euo pipefail; source "${SCRIPT}"; ${command}`], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, VERCEL_POLL_SECONDS: "0", ...env },
      encoding: "utf8",
    });
  const calls = async () => (await readFile(join(dir, "calls"), "utf8")).trim().split("\n");
  return { dir, run, calls };
}

describe("vercel_state", () => {
  it("polls the commit's Vercel status while it is pending, then prints its state, description and link", async () => {
    const gh = await fakeGh(["pending\nDeployment is building\nhttps://vercel.com/x/1\n", "", "failure\nDeployment has failed\nhttps://vercel.com/x/1\n"]);
    expect(gh.run("vercel_state abc123")).toBe("failure\nDeployment has failed\nhttps://vercel.com/x/1\n");
    const calls = await gh.calls();
    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatch(/^api repos\/\{owner\}\/\{repo\}\/commits\/abc123\/status --jq .*"Vercel"/);
  });

  it("prints success once Vercel says so", async () => {
    const gh = await fakeGh(["success\nDeployment has completed\nhttps://vercel.com/x/1\n"]);
    expect(gh.run("vercel_state abc123")).toBe("success\nDeployment has completed\nhttps://vercel.com/x/1\n");
  });

  it("gives up as a timeout when the status is still pending, or missing, past the wait", async () => {
    const gh = await fakeGh(["pending\nDeployment is building\n\n"]);
    expect(gh.run("vercel_state abc123", { VERCEL_WAIT_SECONDS: "0" })).toBe("timeout\npending: Deployment is building\n\n");
    const none = await fakeGh([""]);
    expect(none.run("vercel_state abc123", { VERCEL_WAIT_SECONDS: "0" })).toBe("timeout\nno Vercel status on the commit\n\n");
  });

  it("calls the status unreadable after three failed reads in a row, with gh's last error", async () => {
    const gh = await fakeGh(["exit 1\nHTTP 403: Resource not accessible by personal access token"]);
    expect(gh.run("vercel_state abc123")).toBe("unreadable\nHTTP 403: Resource not accessible by personal access token\n\n");
    expect(await gh.calls()).toHaveLength(3);
  });
});

describe("deploy_failures", () => {
  it("prints the deploy log's lines from the last week that are not a 2xx answer, and nothing without a log", async () => {
    const gh = await fakeGh([""]);
    const day = (ago: number) => gh.run(`date -d "${ago} days ago" +%Y-%m-%dT00:05`).trim();
    const log = join(gh.dir, "deploy.log");
    await writeFile(
      log,
      [
        `${day(9)} deploy hook failed: 503`,
        `${day(5)} deploy hook answered 201`,
        `${day(4)} deploy hook failed: no answer`,
        `${day(3)} no DEPLOY_HOOK_URL in .env; nothing deployed (re-run scripts/home-run-setup.sh)`,
        `${day(1)} deploy hook answered 201`,
      ].join("\n") + "\n",
    );
    expect(gh.run(`deploy_failures "${log}"`)).toBe(`${day(4)} deploy hook failed: no answer\n${day(3)} no DEPLOY_HOOK_URL in .env; nothing deployed (re-run scripts/home-run-setup.sh)\n`);
    expect(gh.run(`deploy_failures "${join(gh.dir, "missing.log")}"`)).toBe("");
  });
});
