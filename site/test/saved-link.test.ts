import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

// Literals only inside a vi.mock factory: vitest hoists the call above every import and declaration.
vi.mock("../src/generated/meta", () => ({
  meta: { kinds: [], regions: [], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));
import SavedLink from "../src/components/SavedLink.svelte";
import { LEGACY_KEY, STORAGE_KEY } from "../src/lib/saves";

const store = (saved: { id: string; last?: string }[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

describe("SavedLink", () => {
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("reads as Saved, then the count, with no stray space before the comma", async () => {
    store([{ id: "a" }, { id: "b" }]);
    render(SavedLink);
    await tick();
    expect(screen.getByRole("link")).toHaveAccessibleName("Saved, 2");
    expect(screen.getByRole("link")).toHaveTextContent(/^Saved\s*2$/);
  });

  it("is plain Saved with nothing saved", async () => {
    render(SavedLink);
    await tick();
    expect(screen.getByRole("link")).toHaveAccessibleName("Saved");
  });

  it("counts a v1 save, migrated", async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(["a"]));
    render(SavedLink);
    await tick();
    expect(screen.getByRole("link")).toHaveAccessibleName("Saved, 1");
  });

  it("leaves out saves that have passed, and drops one more when the tab comes back on a later day", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-09T17:00:00Z") }); // Friday in Kansas City
    store([{ id: "past", last: "2026-10-08" }, { id: "today", last: "2026-10-09" }, { id: "later", last: "2026-10-20" }, { id: "weekly" }]);
    render(SavedLink);
    await tick();
    expect(screen.getByRole("link")).toHaveAccessibleName("Saved, 3");
    vi.setSystemTime(new Date("2026-10-10T17:00:00Z"));
    document.dispatchEvent(new Event("visibilitychange"));
    await tick();
    expect(screen.getByRole("link")).toHaveAccessibleName("Saved, 2");
  });

  it("follows a save made in another tab", async () => {
    store([{ id: "a" }]);
    render(SavedLink);
    await tick();
    store([{ id: "a" }, { id: "b" }]);
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    await tick();
    expect(screen.getByRole("link")).toHaveAccessibleName("Saved, 2");
  });
});
