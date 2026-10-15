import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

// Literals only inside a vi.mock factory: vitest hoists the call above every import and declaration.
vi.mock("../src/generated/meta", () => ({
  meta: { kinds: [], regions: [], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));
vi.mock("../src/generated/tonight", () => ({ tonight: { from: "2026-10-05", counts: [23, 1, 0] } }));
import TonightLink from "../src/components/TonightLink.svelte";

describe("TonightLink", () => {
  afterEach(() => vi.useRealTimers());

  it("counts the visitor's tonight, not the build's", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-06T17:00:00Z") }); // Tuesday noon in Kansas City
    render(TonightLink);
    await tick();
    expect(screen.getByRole("link")).toHaveTextContent("Tonight: 1 event");
    expect(screen.getByRole("link")).toHaveAttribute("href", "/explore?when=today");
  });

  it("turns to tomorrow at 10 pm in Kansas City", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-06T03:30:00Z") }); // Monday 10:30 pm in Kansas City
    render(TonightLink);
    await tick();
    expect(screen.getByRole("link")).toHaveTextContent("Tomorrow: 1 event");
    expect(screen.getByRole("link")).toHaveAttribute("href", "/explore?when=tomorrow");
  });

  it("catches up when a tab left open comes back the next day", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-05T17:00:00Z") });
    render(TonightLink);
    await tick();
    expect(screen.getByRole("link")).toHaveTextContent("Tonight: 23 events");
    vi.setSystemTime(new Date("2026-10-07T17:00:00Z"));
    document.dispatchEvent(new Event("visibilitychange"));
    await tick();
    expect(screen.getByRole("link")).toHaveTextContent("Nothing listed tonight");
  });

  it("is absent on a day past the counts", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-09T17:00:00Z") });
    render(TonightLink);
    await tick();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
