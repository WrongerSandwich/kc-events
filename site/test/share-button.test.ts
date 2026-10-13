import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShareButton from "../src/components/ShareButton.svelte";

const data = () => ({ title: "A show", text: "Fri Oct 9 · recordBar", url: "https://www.kcthisweek.com/e/evt_a1" });

function stubNavigator(over: { share?: (d: unknown) => Promise<void>; writeText?: (t: string) => Promise<void> }) {
  vi.stubGlobal("navigator", { ...navigator, share: over.share, clipboard: over.writeText ? { writeText: over.writeText } : undefined });
}

/** Lets the click's promise chain settle. */
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };

describe("ShareButton (#132)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("copies the link and says so where there is no share sheet", async () => {
    const writeText = vi.fn(async () => {});
    stubNavigator({ writeText });
    render(ShareButton, { label: "Share", data });
    await fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await settle();
    expect(writeText).toHaveBeenCalledWith("https://www.kcthisweek.com/e/evt_a1");
    expect(screen.getByText("Link copied")).toBeInTheDocument();
  });

  it("hands the link to the share sheet and says nothing", async () => {
    const share = vi.fn(async () => {});
    stubNavigator({ share, writeText: vi.fn(async () => {}) });
    render(ShareButton, { label: "Share", data });
    await fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await settle();
    expect(share).toHaveBeenCalledWith(data());
    expect(screen.queryByText("Link copied")).toBeNull();
  });

  it("shows the link to copy by hand when it cannot copy", async () => {
    stubNavigator({ writeText: async () => { throw new Error("denied"); } });
    render(ShareButton, { label: "Share", data });
    await fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await settle();
    expect(screen.getByText(/Copy this link:/)).toHaveTextContent("https://www.kcthisweek.com/e/evt_a1");
  });

  it("is disabled while there is nothing to share", () => {
    render(ShareButton, { label: "Share saved", data, disabled: true });
    expect(screen.getByRole("button", { name: "Share saved" })).toBeDisabled();
  });
});
