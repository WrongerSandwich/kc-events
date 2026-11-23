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
# IndexNow's step (#311): names the two sitemap copies it was given, or fails as a missing key file would.
if [[ "$1 $2 $3" == "exec tsx src/indexnow-cli.ts" ]]; then
  if [[ -n "\${FAKE_INDEXNOW_FAIL:-}" ]]; then echo "no IndexNow key file in site/public" >&2; exit 1; fi
  echo "IndexNow: sitemaps $(cat "$5") then $(cat "$7")"
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

// A fetch of the live sitemap writes its -o file a numbered copy, so the order of the two copies shows; anything else is a ping.
const FAKE_CURL = `#!/usr/bin/env bash
if [[ "\${@: -1}" == */sitemap.xml ]]; then
  n=$(( $(cat "$FAKE_SITEMAPS" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$FAKE_SITEMAPS"
  while (($#)); do [[ "$1" == -o ]] && printf 'copy-%s' "$n" > "$2"; shift; done
  exit 0
fi
printf '%s\\n' "\${@: -1}" >> "$FAKE_PINGS"
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
  await writeFile(join(work, ".env"), "GH_TOKEN=github_pat_test\nHEALTHCHECKS_URL=https://hc.test/ping/abc\n");

  const bin = join(dir, "bin");
  await mkdir(bin);
  await writeFile(join(bin, "pnpm"), FAKE_PNPM);
  await writeFile(join(bin, "gh"), FAKE_GH);
  await writeFile(join(bin, "curl"), FAKE_CURL);
  for (const fake of ["pnpm", "gh", "curl"]) await chmod(join(bin, fake), 0o755);
  const calls = join(dir, "pnpm-calls");
  const comments = join(dir, "comments");
  const pings = join(dir, "pings");

  const runWith = (env: Record<string, string>, ...args: string[]) => {
    try {
      const output = execFileSync("bash", [join(work, "scripts", "weekly-run.sh"), ...args], {
        cwd: work,
        env: {
          ...process.env,
          ...GIT_ENV,
          PATH: `${bin}:${process.env.PATH}`,
          XDG_STATE_HOME: join(dir, "state"),
          FAKE_CALLS: calls,
          FAKE_COMMENTS: comments,
          FAKE_PINGS: pings,
          FAKE_SITEMAPS: join(dir, "sitemaps"),
          ...env,
        },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { code: 0, output };
    } catch (error) {
      const e = error as { status: number; stdout: string; stderr: string };
      return { code: e.status, output: `${e.stdout}${e.stderr}` };
    }
  };
  const run = (...args: string[]) => runWith({}, ...args);
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
    runWith,
    landed,
    researchCalls: async () => (await read(calls)).split("\n").filter((line) => line.startsWith("research")),
    comments: () => read(comments),
    pings: async () => (await read(pings)).split("\n").filter(Boolean),
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
    expect(await c.pings()).toEqual(["https://hc.test/ping/abc/start", "https://hc.test/ping/abc"]);
  });

  it("tells IndexNow what changed between the live sitemap before the push and after the deploy, on the success comment (#311)", async () => {
    const weekly = await clone();
    expect(weekly.run().code).toBe(0);
    expect(await weekly.comments()).toContain("\n\nIndexNow: sitemaps copy-1 then copy-2");

    const midweek = await clone();
    expect(midweek.run("--reverify-only").code).toBe(0);
    expect(await midweek.comments()).toContain("\n\nIndexNow: sitemaps copy-1 then copy-2");
  });

  it("leaves the run a success when IndexNow's step fails, with the cause on the comment's line (#311)", async () => {
    const c = await clone();

    const { code, output } = c.runWith({ FAKE_INDEXNOW_FAIL: "1" });

    expect(code, output).toBe(0);
    expect(await c.comments()).toContain(`${TODAY}: ok,`);
    expect(await c.comments()).toContain("IndexNow: not sent (no IndexNow key file in site/public)");
    expect(await c.pings()).toEqual(["https://hc.test/ping/abc/start", "https://hc.test/ping/abc"]);
  });

  it("with --reverify-only passes the flag through and commits as the midweek re-verification (#253)", async () => {
    const c = await clone();

    const { code, output } = c.run("--reverify-only", "--days", "7");

    expect(code, output).toBe(0);
    expect(await c.researchCalls()).toEqual(["research --reverify-only --days 7"]);
    expect(c.subjects()[0]).toBe(`Midweek re-verification ${TODAY}`);
    expect(await c.comments()).toContain(`${TODAY} midweek re-verification: ok, 41 page(s) re-read, 3 re-verified, 1 expired`);
    // A midweek success marks the check up for no one, so a missed weekly run still alerts.
    expect(await c.pings()).toEqual([]);
  });

  it("refuses a midweek pass on a day origin/main already has one, running nothing", async () => {
    const c = await clone();
    await c.landed(`Midweek re-verification ${TODAY}`);

    const { code, output } = c.run("--reverify-only");

    expect(code).toBe(1);
    expect(output).toContain(`origin/main already has a midweek re-verification for ${TODAY}`);
    expect(await c.researchCalls()).toEqual([]);
    expect(await c.comments()).toContain(`**${TODAY} midweek re-verification: failed.**`);
    expect(await c.pings()).toEqual(["https://hc.test/ping/abc/fail"]);
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
