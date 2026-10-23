import { fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync, mount, tick, unmount } from "svelte";
import { describe, expect, it } from "vitest";
import SaveButton from "../src/components/SaveButton.svelte";
import { STORAGE_KEY } from "../src/lib/saves";

describe("SaveButton", () => {
  it("toggles its pressed state, and its name says what its label says (#181, WCAG 2.5.3), and persists", async () => {
    localStorage.removeItem(STORAGE_KEY);
    render(SaveButton, { id: "evt_1", title: "A show", last: "2026-10-09" });
    await tick(); // the button renders once mounted
    const button = screen.getByRole("button", { name: "Save A show" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).not.toHaveAttribute("aria-label");
    await fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Saved A show" })).toBe(button);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([{ id: "evt_1", last: "2026-10-09" }]);
  });

  it("names the date when it is given, so a title on several dates is told apart (#181)", async () => {
    localStorage.removeItem(STORAGE_KEY);
    render(SaveButton, { id: "evt_5", title: "The Wizard of Oz", when: "Fri Oct 9" });
    await tick();
    expect(screen.getByRole("button", { name: "Save The Wizard of Oz, Fri Oct 9" })).toBeInTheDocument();
  });

  it("gives a save made before last days were stored this page's last day (#93)", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: "evt_4" }, { id: "other" }]));
    render(SaveButton, { id: "evt_4", title: "Four", last: "2026-10-12" });
    await tick();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([{ id: "evt_4", last: "2026-10-12" }, { id: "other" }]);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
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
