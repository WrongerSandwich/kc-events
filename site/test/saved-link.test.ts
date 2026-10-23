import { afterEach, describe, expect, it, vi } from "vitest";

// Literals only inside a vi.mock factory: vitest hoists the call above every import and declaration.
vi.mock("../src/generated/meta", () => ({
  meta: { kinds: [], regions: [], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));
import { showSavedCount } from "../src/components/header";
import { createSaves, LEGACY_KEY, saves, STORAGE_KEY } from "../src/lib/saves";

const store = (saved: { id: string; last?: string }[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

/** The header's link as Header.astro renders it, counted by the script every page runs. */
function link(from = createSaves(localStorage)): { a: HTMLAnchorElement; stop: () => void } {
  const a = document.body.appendChild(document.createElement("a"));
  a.href = "/explore?saved=1";
  a.textContent = "Saved";
  return { a, stop: showSavedCount(a, from) };
}

describe("the header's Saved link", () => {
  let stops: (() => void)[] = [];
  const counted = (from?: ReturnType<typeof createSaves>) => {
    const l = link(from);
    stops.push(l.stop);
    return l.a;
  };

  afterEach(() => {
    for (const stop of stops) stop();
    stops = [];
    document.body.replaceChildren();
    vi.useRealTimers();
    localStorage.clear();
  });

  it("reads as Saved, then the count, with no stray space before the comma", () => {
    store([{ id: "a" }, { id: "b" }]);
    const a = counted();
    expect(a).toHaveAccessibleName("Saved, 2");
    expect(a).toHaveTextContent(/^Saved\s*2$/);
    expect(a.querySelector(".count")).toHaveTextContent("2");
  });

  it("is plain Saved with nothing saved", () => {
    const a = counted();
    expect(a).toHaveAccessibleName("Saved");
    expect(a).toHaveTextContent(/^Saved$/);
    expect(a).not.toHaveAttribute("aria-label");
  });

  it("counts a v1 save, migrated", () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(["a"]));
    expect(counted()).toHaveAccessibleName("Saved, 1");
  });

  it("leaves out saves that have passed, and drops one more when the tab comes back on a later day", () => {
    vi.useFakeTimers({ now: new Date("2026-10-09T17:00:00Z") }); // Friday in Kansas City
    store([{ id: "past", last: "2026-10-08" }, { id: "today", last: "2026-10-09" }, { id: "later", last: "2026-10-20" }, { id: "weekly" }]);
    const a = counted();
    expect(a).toHaveAccessibleName("Saved, 3");
    vi.setSystemTime(new Date("2026-10-10T17:00:00Z"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(a).toHaveAccessibleName("Saved, 2");
  });

  it("follows a save made on the page (the explorer's Save), and goes back to plain Saved when the last is unsaved", () => {
    const from = createSaves(localStorage);
    const a = counted(from);
    from.toggle("a");
    expect(a).toHaveAccessibleName("Saved, 1");
    from.toggle("a");
    expect(a).toHaveAccessibleName("Saved");
    expect(a.querySelector(".count")).toBeNull();
  });

  it("follows a save made in another tab", () => {
    store([{ id: "a" }]);
    const a = counted(saves());
    expect(a).toHaveAccessibleName("Saved, 1");
    store([{ id: "a" }, { id: "b" }]);
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    expect(a).toHaveAccessibleName("Saved, 2");
  });

  it("stops listening once stopped", () => {
    const from = createSaves(localStorage);
    const { a, stop } = link(from);
    stop();
    from.toggle("a");
    expect(a).toHaveAccessibleName("Saved");
  });
});
