import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it } from "vitest";
import SavedLink from "../src/components/SavedLink.svelte";
import { STORAGE_KEY } from "../src/lib/saves";

describe("SavedLink", () => {
  it("reads as Saved, then the count, with no stray space before the comma", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["a", "b"]));
    render(SavedLink);
    await tick();
    expect(screen.getByRole("link")).toHaveAccessibleName("Saved, 2");
    expect(screen.getByRole("link")).toHaveTextContent(/^Saved\s*2$/);
  });

  it("is plain Saved with nothing saved", async () => {
    localStorage.removeItem(STORAGE_KEY);
    render(SavedLink);
    await tick();
    expect(screen.getByRole("link")).toHaveAccessibleName("Saved");
  });
});
