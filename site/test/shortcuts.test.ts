// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { setShortcuts, shortcutsOn, SHORTCUTS_KEY } from "../src/lib/shortcuts";

const memory = () => {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k), map };
};

describe("the shortcut setting", () => {
  it("is on until turned off, and turning it back on leaves nothing stored", () => {
    const store = memory();
    expect(shortcutsOn(store)).toBe(true);
    setShortcuts(false, store);
    expect(store.map.get(SHORTCUTS_KEY)).toBe("off");
    expect(shortcutsOn(store)).toBe(false);
    setShortcuts(true, store);
    expect(store.map.size).toBe(0);
    expect(shortcutsOn(store)).toBe(true);
  });

  it("stays on when storage cannot be read, and a blocked write does not throw", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(shortcutsOn(blocked)).toBe(true);
    expect(() => setShortcuts(false, blocked)).not.toThrow();
    expect(shortcutsOn(undefined)).toBe(true);
  });

  it("is the same setting the About page's checkbox writes, which spells it out rather than importing it", () => {
    const about = readFileSync(fileURLToPath(new URL("../src/pages/about.astro", import.meta.url)), "utf8");
    expect(about).toContain(`const KEY = "${SHORTCUTS_KEY}";`);
    expect(about).toContain(`localStorage.getItem(KEY) !== "off"`);
    expect(about).toContain(`localStorage.setItem(KEY, "off")`);
    expect(about).toContain(`localStorage.removeItem(KEY)`);
  });
});
