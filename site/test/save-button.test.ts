import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import SaveButton from "../src/components/SaveButton.svelte";
import { STORAGE_KEY } from "../src/lib/saves";

describe("SaveButton", () => {
  it("toggles its pressed state and label, and persists", async () => {
    localStorage.removeItem(STORAGE_KEY);
    render(SaveButton, { id: "evt_1", title: "A show" });
    const button = screen.getByRole("button", { name: "Save A show" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Saved: A show" })).toBe(button);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(["evt_1"]);
  });

  it("reflects another button's change to the same event", async () => {
    localStorage.removeItem(STORAGE_KEY);
    render(SaveButton, { id: "evt_2", title: "One" });
    render(SaveButton, { id: "evt_2", title: "One" });
    const [a, b] = screen.getAllByRole("button");
    await fireEvent.click(a!);
    expect(b).toHaveAttribute("aria-pressed", "true");
  });
});
