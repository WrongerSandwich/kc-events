// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const root = new URL("../src/", import.meta.url).pathname;
const clientSafe = () => ["lib", "components"].flatMap((d) => filesUnder(join(root, d)));

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
    const offenders = filesUnder(join(root, "lib")).filter((f) => /new Date\(\)|Date\.now\(/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
