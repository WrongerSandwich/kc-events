import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Temporary directories the running test file made; `test/setup.ts` removes them once it finishes, passed or not (#141). */
const made: string[] = [];

export function tempDir(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

export function removeTempDirs() {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
}
