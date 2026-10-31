import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// scripts/weekly-run.sh, the weekly run and (with --reverify-only) its midweek pass (#253), driven in a temporary
// clone of a temporary origin with a fake pnpm (its research writes a dataset and a report) and a fake gh (the
// health issue and Vercel's status) on PATH, and its log under a temporary state directory.

const SCRIPTS = new URL("../scripts/", import.meta.url).pathname;
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());

const made: string[] = [];
afterEach(async () => {
  await Promise.all(made.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const GIT_ENV = { GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.test", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.test" };

const FAKE_PNPM = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_CALLS"
if [[ "$1" == research ]]; then
  mode=weekly
  for arg in "$@"; do [[ "$arg" == --reverify-only ]] && mode=reverify-only; done
  day=$(TZ=America/Chicago date +%F)
  mkdir -p data/runs
  printf '{"stamp":"%s"}\\n' "$RANDOM$RANDOM" > data/events.json
  printf '{"mode":"%s","counts":{"found":0,"new":0,"updated":0,"reverified":3,"expired":{"cancelled":1}},"spend":{"totalUsd":0.08,"capUsd":5,"capHit":false},"reverification":{"pagesRead":41}}\\n' "$mode" > "data/runs/$day.json"
  printf '# report\\n' > "data/runs/$day.md"
fi
`;

const FAKE_GH = `#!/usr/bin/env bash
case "$1 $2" in
  "api "*) printf 'success\\nDeployment has completed\\nhttps://vercel.test/d\\n' ;;
  "issue list") echo 7 ;;
  "issue comment")
    while [[ $# -gt 0 ]]; do [[ "$1" == --body ]] && printf '%s\\n' "$2" >> "$FAKE_COMMENTS"; shift; done
    echo "https://github.test/issues/7#comment-1" ;;
esac
`;

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...GIT_ENV } });

/** An origin holding the scripts and a dataset, a clone of it to run in, and a PATH with the fakes. */
async function clone() {
  const dir = await mkdtemp(join(tmpdir(), "kc-weekly-"));
  made.push(dir);
  const origin = join(dir, "origin.git");
  const work = join(dir, "work");
  git(dir, "init", "--quiet", "--bare", "--initial-branch=main", origin);
  git(dir, "clone", "--quiet", origin, work);
  await mkdir(join(work, "scripts"));
  await mkdir(join(work, "data", "runs"), { recursive: true });
  await mkdir(join(work, "site"));
  for (const script of ["weekly-run.sh", "deploy-checks.sh"]) await copyFile(join(SCRIPTS, script), join(work, "scripts", script));
  await writeFile(join(work, "data", "events.json"), "{}\n");
  await writeFile(join(work, "data", "runs", ".keep"), "");
  await writeFile(join(work, "site", ".keep"), "");
  await writeFile(join(work, ".gitignore"), ".env\n");
  git(work, "add", ".");
  git(work, "commit", "--quiet", "-m", "Start");
  git(work, "push", "--quiet", "origin", "HEAD:main");
  await writeFile(join(work, ".env"), "GH_TOKEN=github_pat_test\n");

  const bin = join(dir, "bin");
  await mkdir(bin);
  await writeFile(join(bin, "pnpm"), FAKE_PNPM);
  await writeFile(join(bin, "gh"), FAKE_GH);
  await chmod(join(bin, "pnpm"), 0o755);
  await chmod(join(bin, "gh"), 0o755);
  const calls = join(dir, "pnpm-calls");
  const comments = join(dir, "comments");

  const run = (...args: string[]) => {
    try {
      const output = execFileSync("bash", [join(work, "scripts", "weekly-run.sh"), ...args], {
        cwd: work,
        env: { ...process.env, ...GIT_ENV, PATH: `${bin}:${process.env.PATH}`, XDG_STATE_HOME: join(dir, "state"), FAKE_CALLS: calls, FAKE_COMMENTS: comments },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { code: 0, output };
    } catch (error) {
      const e = error as { status: number; stdout: string; stderr: string };
      return { code: e.status, output: `${e.stdout}${e.stderr}` };
    }
  };
  /** A commit with this message on origin's main, as an earlier run today would have left. */
  const landed = async (message: string) => {
    await writeFile(join(work, "data", "runs", `${TODAY}.md`), `# ${message}\n`);
    git(work, "add", "data");
    git(work, "commit", "--quiet", "-m", message);
    git(work, "push", "--quiet", "origin", "HEAD:main");
  };
  const read = async (path: string) => (existsSync(path) ? await readFile(path, "utf8") : "");
  return {
    run,
    landed,
    researchCalls: async () => (await read(calls)).split("\n").filter((line) => line.startsWith("research")),
    comments: () => read(comments),
    subjects: () => git(origin, "log", "--format=%s", "main").trim().split("\n"),
  };
}

describe("the weekly run script", () => {
  it("runs pnpm research as given and commits as the weekly run", async () => {
    const c = await clone();

    const { code, output } = c.run("--no-discovery");

    expect(code, output).toBe(0);
    expect(await c.researchCalls()).toEqual(["research --no-discovery"]);
    expect(c.subjects()[0]).toBe(`Weekly research run ${TODAY}`);
    expect(await c.comments()).toContain(`${TODAY}: ok, 0 found, 0 new, 0 updated, 3 re-verified, 1 expired`);
  });

  it("with --reverify-only passes the flag through and commits as the midweek re-verification (#253)", async () => {
    const c = await clone();

    const { code, output } = c.run("--reverify-only", "--days", "7");

    expect(code, output).toBe(0);
    expect(await c.researchCalls()).toEqual(["research --reverify-only --days 7"]);
    expect(c.subjects()[0]).toBe(`Midweek re-verification ${TODAY}`);
    expect(await c.comments()).toContain(`${TODAY} midweek re-verification: ok, 41 page(s) re-read, 3 re-verified, 1 expired`);
  });

  it("refuses a midweek pass on a day origin/main already has one, running nothing", async () => {
    const c = await clone();
    await c.landed(`Midweek re-verification ${TODAY}`);

    const { code, output } = c.run("--reverify-only");

    expect(code).toBe(1);
    expect(output).toContain(`origin/main already has a midweek re-verification for ${TODAY}`);
    expect(await c.researchCalls()).toEqual([]);
    expect(await c.comments()).toContain(`**${TODAY} midweek re-verification: failed.**`);
  });

  it("refuses a midweek pass on a weekly run's day, whose report it would write over", async () => {
    const c = await clone();
    await c.landed(`Weekly research run ${TODAY}`);

    const { code, output } = c.run("--reverify-only");

    expect(code).toBe(1);
    expect(output).toContain(`origin/main already has a weekly research run for ${TODAY}, whose report a midweek re-verification would write over`);
    expect(await c.researchCalls()).toEqual([]);
  });

  it("keys the weekly run's refusal on the weekly commit alone, so a midweek pass that day does not stop it", async () => {
    const weeklyDone = await clone();
    await weeklyDone.landed(`Weekly research run ${TODAY}`);
    expect(weeklyDone.run().output).toContain(`origin/main already has a weekly run for ${TODAY}`);

    const midweekDone = await clone();
    await midweekDone.landed(`Midweek re-verification ${TODAY}`);
    const { code, output } = midweekDone.run();
    expect(code, output).toBe(0);
    expect(midweekDone.subjects()[0]).toBe(`Weekly research run ${TODAY}`);
  });
});
