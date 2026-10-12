import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("module load order", () => {
  // The site's build loads the config before the dataset; a runtime import that closes a cycle back to the dataset
  // runs the dataset's schemas before the config's hosts exist (the build failure after 759d2fc). Vitest's own
  // loader hides the cycle, so the config is loaded in a plain Node process, as the build loads it.
  it("the config loads first without reaching the dataset half-built", () => {
    const out = execFileSync(process.execPath, ["--import", "tsx", "-e", 'await import("./src/config.ts"); console.log("loaded")'], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(out.trim()).toBe("loaded");
  });
});
