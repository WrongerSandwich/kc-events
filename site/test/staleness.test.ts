import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";

// Literals only inside a vi.mock factory: vitest hoists the call above every import and declaration.
vi.mock("../src/generated/meta", () => ({
  meta: { kinds: [], regions: [], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));

import StalenessBanner from "../src/components/StalenessBanner.svelte";

// Islands switch to the visitor's date in onMount; `await tick()` lets that render land before asserting.
describe("StalenessBanner", () => {
  it("is absent while the run is fresh", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-13T12:00:00Z") }); // 8 days
    render(StalenessBanner);
    await tick();
    expect(screen.queryByRole("status")).toBeNull();
    vi.useRealTimers();
  });

  it("appears after nine days with the run date in it", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-15T12:00:00Z") }); // 10 days
    render(StalenessBanner);
    await tick();
    expect(screen.getByRole("status")).toHaveTextContent("This list was last researched on Oct 5 and may have missed changes since. Check the event's own page before you go.");
    vi.useRealTimers();
  });
});
