import { describe, expect, it, vi } from "vitest";
import { createSaves, LEGACY_KEY, STORAGE_KEY, upcomingCount, type SavedMap } from "../src/lib/saves";

function memory(initial?: string, key = STORAGE_KEY) {
  const m = new Map<string, string>();
  if (initial !== undefined) m.set(key, initial);
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), map: m };
}

const stored = (store: ReturnType<typeof memory>) => JSON.parse(store.map.get(STORAGE_KEY)!);
const ids = (saved: SavedMap) => [...saved.keys()];

describe("saves", () => {
  it("starts from storage, toggles, and persists each save with its last day", () => {
    const store = memory(JSON.stringify([{ id: "a", last: "2026-10-10" }]));
    const s = createSaves(store);
    expect(s.list()).toEqual(["a"]);
    s.toggle("b", "2026-10-20");
    s.toggle("c"); // a recurring event has no last day
    expect(s.has("b")).toBe(true);
    expect(stored(store)).toEqual([{ id: "a", last: "2026-10-10" }, { id: "b", last: "2026-10-20" }, { id: "c" }]);
    s.toggle("a");
    expect(s.list()).toEqual(["b", "c"]);
  });

  it("migrates v1's bare ids to v2 once, with no last day, and leaves v1 alone", () => {
    const store = memory(JSON.stringify(["a", "b"]), LEGACY_KEY);
    const s = createSaves(store);
    expect(s.list()).toEqual(["a", "b"]);
    expect(stored(store)).toEqual([{ id: "a" }, { id: "b" }]);
    expect(store.map.get(LEGACY_KEY)).toBe(JSON.stringify(["a", "b"]));
    // v2 now exists, so a later v1 change is never read again.
    store.map.set(LEGACY_KEY, JSON.stringify(["z"]));
    expect(createSaves(store).list()).toEqual(["a", "b"]);
  });

  it("brings saves' last days up to the dataset's, leaving ids it does not have as they were", () => {
    const store = memory(JSON.stringify([{ id: "moved", last: "2026-10-10" }, { id: "migrated" }, { id: "gone", last: "2026-10-01" }]));
    const s = createSaves(store);
    const fn = vi.fn();
    s.subscribe(fn);
    s.refresh(new Map([["moved", "2026-10-17"], ["migrated", "2026-10-12"], ["other", "2026-10-30"]]));
    expect(stored(store)).toEqual([{ id: "moved", last: "2026-10-17" }, { id: "migrated", last: "2026-10-12" }, { id: "gone", last: "2026-10-01" }]);
    expect(fn).toHaveBeenCalledTimes(2);
    s.refresh(new Map([["moved", "2026-10-17"]])); // nothing changes: no write, no notice
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("counts what is still to come: no last day, today, or later", () => {
    const saved = new Map([["a", undefined], ["b", "2026-10-10"], ["c", "2026-10-11"], ["d", "2026-10-12"]]);
    expect(upcomingCount(saved, "2026-10-11")).toBe(3);
    expect(upcomingCount(saved, "2026-10-13")).toBe(1);
  });

  it("keeps ids of events that are no longer active through a toggle", () => {
    const store = memory(JSON.stringify([{ id: "gone" }, { id: "here" }]));
    const s = createSaves(store);
    s.toggle("here");
    expect(s.list()).toEqual(["gone"]);
    s.toggle("new");
    expect(stored(store)).toEqual([{ id: "gone" }, { id: "new" }]);
  });

  it("notifies subscribers immediately and on change, and stops after unsubscribe", () => {
    const s = createSaves(memory());
    const fn = vi.fn();
    const off = s.subscribe(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(ids(fn.mock.calls[0]![0])).toEqual([]);
    s.toggle("x");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(ids(fn.mock.calls[1]![0])).toEqual(["x"]);
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
    expect(createSaves(memory(JSON.stringify([{ id: "a", last: 3 }, { id: 2 }, null, "b"]))).list()).toEqual(["a"]);
    expect(createSaves(memory(JSON.stringify(["a", 2, null]), LEGACY_KEY)).list()).toEqual(["a"]);
  });

  it("keeps notifying the other subscribers, and keeps toggle from throwing, when one subscriber throws", () => {
    const saves = createSaves(memory());
    const seen: string[][] = [];
    let armed = false;
    saves.subscribe(() => { if (armed) throw new Error("bad subscriber"); });
    saves.subscribe((s) => seen.push(ids(s)));
    armed = true;
    expect(() => saves.toggle("a")).not.toThrow();
    expect(seen.at(-1)).toEqual(["a"]);
    expect(saves.has("a")).toBe(true);
  });

  it("re-reads storage when a new subscriber arrives, so a later mount sees outside changes", () => {
    const store = memory(JSON.stringify([]));
    const s = createSaves(store);
    store.map.set(STORAGE_KEY, JSON.stringify([{ id: "z" }]));
    const fn = vi.fn();
    s.subscribe(fn);
    expect(ids(fn.mock.calls[0]![0])).toEqual(["z"]);
    expect(s.has("z")).toBe(true);
  });

  it("tells existing subscribers when a reload finds another tab's change", () => {
    const store = memory(JSON.stringify([]));
    const s = createSaves(store);
    const fn1 = vi.fn();
    s.subscribe(fn1);
    store.map.set(STORAGE_KEY, JSON.stringify([{ id: "z" }]));
    s.reload();
    expect(ids(fn1.mock.calls.at(-1)![0])).toEqual(["z"]);
    const calls = fn1.mock.calls.length;
    s.reload(); // unchanged: no notice
    expect(fn1).toHaveBeenCalledTimes(calls);
  });
});
