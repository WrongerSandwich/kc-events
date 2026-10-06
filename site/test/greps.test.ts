// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const root = fileURLToPath(new URL("../src/", import.meta.url));
const clientSafe = () => ["lib", "components"].flatMap((d) => filesUnder(join(root, d)));

/** Any way of reading the clock: `new Date()`, `new Date` with no argument list, a bare `Date()` call, or `Date.now`. */
const CLOCK_READ = /new\s+Date\b(?!\s*\()|(?<![\w.])(?:new\s+)?Date\s*\(\s*\)|\bDate\s*\.\s*now\b/;

describe("client-safe code", () => {
  it("never imports the research job or build-only code from lib or components", () => {
    // Any quoted relative path into the job's src/ (../../../src/) or the site's build/ (../build/).
    const offenders = clientSafe().filter((f) => /["'](?:\.\.\/)+(?:src|build)\//.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("never reads the environment in code that reaches the browser", () => {
    const offenders = [...clientSafe(), join(root, "site.config.ts")].filter((f) => /process\.env/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("never reads the clock in lib", () => {
    const offenders = filesUnder(join(root, "lib")).filter((f) => CLOCK_READ.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("recognizes every spelling of a clock read, and none of the dated constructors lib uses", () => {
    for (const read of ["new Date()", "new Date ( )", "new Date;", "const d = new Date, e = 1", "Date()", "String(Date())", "Date.now()", "Date.now", "Date . now()"]) {
      expect(CLOCK_READ.test(read), read).toBe(true);
    }
    for (const fine of ["new Date(iso)", "new Date(Date.UTC(y, m, d))", "Date.parse(s)", "Date.UTC(1, 2, 3)", "isDated(e)", "updateDate()", "new DateFormat()"]) {
      expect(CLOCK_READ.test(fine), fine).toBe(false);
    }
  });
});
