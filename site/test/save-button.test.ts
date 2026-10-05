import { fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync, mount, tick, unmount } from "svelte";
import { describe, expect, it } from "vitest";
import SaveButton from "../src/components/SaveButton.svelte";
import { STORAGE_KEY } from "../src/lib/saves";

describe("SaveButton", () => {
  it("toggles its pressed state and visible label under a stable name, and persists", async () => {
    localStorage.removeItem(STORAGE_KEY);
    render(SaveButton, { id: "evt_1", title: "A show" });
    await tick(); // the button renders once mounted
    const button = screen.getByRole("button", { name: "Save A show" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveTextContent("Save");
    await fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveTextContent("Saved");
    expect(screen.getByRole("button", { name: "Save A show" })).toBe(button);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(["evt_1"]);
  });

  it("reflects another button's change to the same event", async () => {
    localStorage.removeItem(STORAGE_KEY);
    render(SaveButton, { id: "evt_2", title: "One" });
    render(SaveButton, { id: "evt_2", title: "One" });
    await tick();
    const [a, b] = screen.getAllByRole("button");
    await fireEvent.click(a!);
    expect(b).toHaveAttribute("aria-pressed", "true");
  });

  it("renders nothing before it mounts, so no dead button ships without JavaScript", () => {
    // mount renders synchronously but runs no effects until a flush: this first render is what the server sends.
    const target = document.body.appendChild(document.createElement("div"));
    const component = mount(SaveButton, { target, props: { id: "evt_3", title: "Three" } });
    expect(target.querySelector("button")).toBeNull();
    flushSync();
    expect(target.querySelector("button")).not.toBeNull();
    unmount(component);
    target.remove();
  });
});
