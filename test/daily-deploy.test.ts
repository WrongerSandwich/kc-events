import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// scripts/daily-deploy.sh rebuilds the site once a day by POSTing to the Vercel Deploy Hook named in the clone's
// gitignored .env (audit 2026-10-21, E1): without it every page is Monday's build all week. Driven here with a
// fake curl on PATH, in a temporary clone, with the log under a temporary state directory.

const SCRIPT = new URL("../scripts/daily-deploy.sh", import.meta.url).pathname;
const HOOK = "https://api.vercel.com/v1/integrations/deploy/prj_test/s3cretHookId";

const made: string[] = [];
afterEach(async () => {
  await Promise.all(made.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A clone with the script and an .env, a PATH with a fake curl that records its arguments, and a state directory. */
async function clone(env: string | undefined, status = "201") {
  const dir = await mkdtemp(join(tmpdir(), "kc-deploy-"));
  made.push(dir);
  await mkdir(join(dir, "scripts"));
  await copyFile(SCRIPT, join(dir, "scripts", "daily-deploy.sh"));
  if (env !== undefined) await writeFile(join(dir, ".env"), env);
  const bin = join(dir, "bin");
  await mkdir(bin);
  const calls = join(dir, "curl-calls");
  await writeFile(join(bin, "curl"), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${calls}"\nprintf '%s' "${status}"\n`);
  await chmod(join(bin, "curl"), 0o755);
  const state = join(dir, "state");
  const run = () => {
    try {
      const stdout = execFileSync("bash", [join(dir, "scripts", "daily-deploy.sh")], {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, XDG_STATE_HOME: state },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { code: 0, output: stdout };
    } catch (error) {
      const e = error as { status: number; stdout: string; stderr: string };
      return { code: e.status, output: `${e.stdout}${e.stderr}` };
    }
  };
  const calledWith = async () => (existsSync(calls) ? await readFile(calls, "utf8") : "");
  const log = async () => readFile(join(state, "kc-this-week", "deploy.log"), "utf8");
  return { run, calledWith, log };
}

describe("the daily deploy", () => {
  it("POSTs to the deploy hook from .env and logs the answer, printing nothing", async () => {
    const c = await clone(`OPENROUTER_API_KEY=x\nDEPLOY_HOOK_URL="${HOOK}"\n`);
    const { code, output } = c.run();
    expect(code).toBe(0);
    expect(output).toBe("");
    expect(await c.calledWith()).toMatch(new RegExp(`-X POST .*${HOOK.replace(/[/.]/g, "\\$&")}`));
    expect(await c.log()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2} deploy hook answered 201\n$/);
  });

  it("fails, saying so, when .env names no hook, and never prints the hook itself", async () => {
    const c = await clone("OPENROUTER_API_KEY=x\n");
    const { code, output } = c.run();
    expect(code).toBe(1);
    expect(output).toContain("no DEPLOY_HOOK_URL in .env");
    expect(await c.calledWith()).toBe("");
    const failed = await clone(`DEPLOY_HOOK_URL=${HOOK}\n`, "503");
    const answer = failed.run();
    expect(answer.code).toBe(1);
    expect(answer.output).toContain("deploy hook failed: 503");
    expect(answer.output).not.toContain("s3cretHookId");
    expect(await failed.log()).toContain("deploy hook failed: 503");
  });
});
