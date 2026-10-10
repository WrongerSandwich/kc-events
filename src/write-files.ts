/**
 * Writing a run's files so a crash, a full disk, or a timeout mid-write never leaves one truncated:
 * each goes to a temporary file beside its target, flushed to disk, and only once every one exists
 * are they renamed into place. A rename within a directory replaces the target whole.
 */
import { open, rename, rm } from "node:fs/promises";

export interface FileToWrite {
  path: string;
  content: string;
}

/** Writes the content to the path and flushes it to disk before returning. */
export async function writeDurably(path: string, content: string): Promise<void> {
  const handle = await open(path, "w");
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Writes every file or none: each to `<path>.tmp` with the writer, then, once all are written,
 * renames each over its target. A writer that throws leaves every target as it was and removes the
 * temporary files.
 */
export async function writeAllOrNothing(files: FileToWrite[], write: (path: string, content: string) => Promise<void> = writeDurably): Promise<void> {
  const temps = files.map((f) => `${f.path}.tmp`);
  try {
    for (const [i, file] of files.entries()) await write(temps[i]!, file.content);
  } catch (error) {
    await Promise.all(temps.map((t) => rm(t, { force: true })));
    throw error;
  }
  for (const [i, file] of files.entries()) await rename(temps[i]!, file.path);
}
