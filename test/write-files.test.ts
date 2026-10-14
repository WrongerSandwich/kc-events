import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeAllOrNothing, writeDurably } from "../src/write-files.js";

const made: string[] = [];
afterEach(async () => {
  await Promise.all(made.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function scratch() {
  const dir = await mkdtemp(join(tmpdir(), "kc-write-"));
  made.push(dir);
  const paths = ["events.json", "report.json", "report.md"].map((name) => join(dir, name));
  for (const path of paths) await writeFile(path, `old ${path}`);
  return { dir, paths };
}

describe("writing the run's files", () => {
  it("replaces every file and leaves no temporary file behind", async () => {
    const { dir, paths } = await scratch();

    await writeAllOrNothing(paths.map((path) => ({ path, content: `new ${path}` })));

    for (const path of paths) expect(await readFile(path, "utf8")).toBe(`new ${path}`);
    expect((await readdir(dir)).sort()).toEqual(["events.json", "report.json", "report.md"]);
  });

  it("a writer that throws partway leaves every old file intact and no temporary file behind", async () => {
    const { dir, paths } = await scratch();
    let calls = 0;
    const failing = async (path: string, content: string) => {
      if (++calls === 2) throw new Error("disk full");
      await writeDurably(path, content);
    };

    await expect(writeAllOrNothing(paths.map((path) => ({ path, content: `new ${path}` })), failing)).rejects.toThrow("disk full");

    for (const path of paths) expect(await readFile(path, "utf8")).toBe(`old ${path}`);
    expect((await readdir(dir)).sort()).toEqual(["events.json", "report.json", "report.md"]);
  });

  it("writes temporary files beside their targets, so the rename stays on one filesystem", async () => {
    const { paths } = await scratch();
    const written: string[] = [];

    await writeAllOrNothing(paths.map((path) => ({ path, content: "x" })), async (path, content) => {
      written.push(path);
      await writeDurably(path, content);
    });

    expect(written).toEqual(paths.map((path) => `${path}.tmp`));
  });
});
