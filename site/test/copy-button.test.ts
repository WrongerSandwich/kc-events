import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import CopyButton from "../src/components/CopyButton.svelte";

const url = "https://www.kcthisweek.com/calendar/picks.ics";
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };

describe("CopyButton (#188)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("copies the address in one tap, without the share sheet, and says so", async () => {
    const writeText = vi.fn(async () => {});
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, share, clipboard: { writeText } });
    render(CopyButton, { label: "Copy address", url });
    await fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
    await settle();
    expect(writeText).toHaveBeenCalledWith(url);
    expect(share).not.toHaveBeenCalled();
    expect(screen.getByText("Address copied")).toBeInTheDocument();
  });

  it("says to copy it by hand when it cannot", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: async () => { throw new Error("denied"); } } });
    render(CopyButton, { label: "Copy address", url });
    await fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
    await settle();
    expect(screen.getByText(/Could not copy/)).toBeInTheDocument();
  });
});
