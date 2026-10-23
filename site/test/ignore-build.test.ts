// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { access, chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// scripts/ignore-build.sh is Vercel's ignored build step: exit 0 skips, exit 1 builds. Driven here in a temporary
// repository of two commits whose difference touches nothing the site reads, with a fake curl standing in for the
// live site's /events.json, so the one rule that reads it can be exercised: a production deployment builds when
// the live site was last built on another day in Kansas City, whatever the commits say (the daily rebuild, which a
// deploy hook starts with no new commit, would otherwise be skipped after any docs-only commit, since Vercel's
// previous SHA is the last successful deployment's).

const SCRIPT = new URL("../scripts/ignore-build.sh", import.meta.url).pathname;

const made: string[] = [];
afterEach(async () => {
  await Promise.all(made.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A Kansas City calendar day, `offset` days from today, as an instant at 1 p.m. there (which is that day in UTC too). */
function centralDay(offset: number): string {
  const now = new Date(Date.now() + offset * 86_400_000);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return `${day}T18:00:00.000Z`;
}

/**
 * Two commits, the second changing only `changed` (the README unless given), and a fake curl answering /events.json
 * with `generatedAt`.
 */
async function repo(generatedAt: string | undefined, changed = "README.md") {
  const dir = await mkdtemp(join(tmpdir(), "kc-ignore-"));
  made.push(dir);
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: dir, stdio: "pipe" });
  git("init", "-q");
  await mkdir(join(dir, "site", "scripts"), { recursive: true });
  await copyFile(SCRIPT, join(dir, "site", "scripts", "ignore-build.sh"));
  await mkdir(join(dir, dirname(changed)), { recursive: true });
  await writeFile(join(dir, changed), "one\n");
  git("add", "-A");
  git("commit", "-q", "-m", "one");
  const prev = git("rev-parse", "HEAD").toString().trim();
  await writeFile(join(dir, changed), "two\n");
  git("commit", "-q", "-am", "two");
  const head = git("rev-parse", "HEAD").toString().trim();
  const bin = join(dir, "bin");
  await mkdir(bin);
  const curl = generatedAt === undefined ? "#!/usr/bin/env bash\nexit 22\n" : `#!/usr/bin/env bash\nprintf '%s' '{"schemaVersion":2,"generatedAt":"${generatedAt}","events":[]}'\n`;
  await writeFile(join(bin, "curl"), curl);
  await chmod(join(bin, "curl"), 0o755);
  return (env: Record<string, string> = {}) => {
    const run = spawnSync("bash", ["scripts/ignore-build.sh"], {
      cwd: join(dir, "site"),
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, VERCEL_GIT_PREVIOUS_SHA: prev, VERCEL_GIT_COMMIT_SHA: head, VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "www.example.test", ...env },
      encoding: "utf8",
    });
    return run.status;
  };
}

const exists = (path: string) => access(path).then(() => true, () => false);

describe("the ignored build step", () => {
  it("builds a production deployment when the live site was last built on another Kansas City day, though the commits changed nothing the site reads", async () => {
    expect((await repo(centralDay(-1)))()).toBe(1);
  });

  it("skips when the live site was built today and the commits changed nothing the site reads", async () => {
    expect((await repo(centralDay(0)))()).toBe(0);
  });

  it("builds when the live site cannot be read: a day's rebuild is worth more than a build saved", async () => {
    expect((await repo(undefined))()).toBe(1);
  });

  it("leaves a preview deployment to the commits alone", async () => {
    expect((await repo(centralDay(-1)))({ VERCEL_ENV: "preview" })).toBe(0);
  });

  it("builds when only a run report changed: the changes page reads data/runs (#192)", async () => {
    expect((await repo(centralDay(0), "data/runs/2026-10-19.json"))()).toBe(1);
  });

  it("builds, and hands git nothing, when the previous SHA is not a full commit hash (#192)", async () => {
    const out = join(tmpdir(), `kc-ignore-planted-${process.pid}`);
    made.push(out);
    const run = await repo(centralDay(0));
    expect(run({ VERCEL_ENV: "preview", VERCEL_GIT_PREVIOUS_SHA: `--output=${out}` })).toBe(1);
    expect(await exists(out)).toBe(false);
    expect(run({ VERCEL_ENV: "preview", VERCEL_GIT_PREVIOUS_SHA: "HEAD~1" })).toBe(1);
  });
});
