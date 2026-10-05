import { describe, expect, it, vi } from "vitest";
import { createSaves, STORAGE_KEY } from "../src/lib/saves";

function memory(initial?: string) {
  const m = new Map<string, string>();
  if (initial !== undefined) m.set(STORAGE_KEY, initial);
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), map: m };
}

describe("saves", () => {
  it("starts from storage, toggles, and persists", () => {
    const store = memory(JSON.stringify(["a"]));
    const s = createSaves(store);
    expect(s.list()).toEqual(["a"]);
    s.toggle("b");
    expect(s.has("b")).toBe(true);
    expect(JSON.parse(store.map.get(STORAGE_KEY)!)).toEqual(["a", "b"]);
    s.toggle("a");
    expect(s.list()).toEqual(["b"]);
  });

  it("notifies subscribers immediately and on change, and stops after unsubscribe", () => {
    const s = createSaves(memory());
    const fn = vi.fn();
    const off = s.subscribe(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect([...fn.mock.calls[0]![0]]).toEqual([]);
    s.toggle("x");
    expect(fn).toHaveBeenCalledTimes(2);
    expect([...fn.mock.calls[1]![0]]).toEqual(["x"]);
    off();
    s.toggle("y");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("treats missing, throwing, or corrupt storage as nothing saved and never throws", () => {
    expect(createSaves(undefined).list()).toEqual([]);
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
    const s = createSaves(throwing);
    expect(s.list()).toEqual([]);
    expect(() => s.toggle("a")).not.toThrow();
    expect(s.has("a")).toBe(true); // kept in memory for the page's life
    expect(createSaves(memory("not json")).list()).toEqual([]);
    expect(createSaves(memory(JSON.stringify({ a: 1 }))).list()).toEqual([]);
    expect(createSaves(memory(JSON.stringify(["a", 2, null]))).list()).toEqual(["a"]);
  });

  it("re-reads storage when a new subscriber arrives, so a later mount sees outside changes", () => {
    const store = memory(JSON.stringify([]));
    const s = createSaves(store);
    store.map.set(STORAGE_KEY, JSON.stringify(["z"]));
    const fn = vi.fn();
    s.subscribe(fn);
    expect([...fn.mock.calls[0]![0]]).toEqual(["z"]);
    expect(s.has("z")).toBe(true);
  });
});
