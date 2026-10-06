import { render, screen } from "@testing-library/svelte";
import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

// Literals only inside a vi.mock factory: vitest hoists the call above every import and declaration.
// vi.hoisted so a test can change the build's date; the factory still sees only what is hoisted with it.
const { meta } = vi.hoisted(() => ({
  meta: { kinds: [], regions: [], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));
vi.mock("../src/generated/meta", () => ({ meta }));

import StalenessBanner from "../src/components/StalenessBanner.svelte";

// Islands switch to the visitor's date in onMount; `await tick()` lets that render land before asserting.
describe("StalenessBanner", () => {
  afterEach(() => {
    vi.useRealTimers();
    meta.buildToday = "2026-10-05";
  });

  it("is absent while the run is fresh", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-13T12:00:00Z") }); // 8 days
    render(StalenessBanner);
    await tick();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("is fresh on the ninth day after the run and stale on the tenth", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-14T12:00:00Z") }); // 9 days
    const day9 = render(StalenessBanner);
    await tick();
    expect(screen.queryByRole("status")).toBeNull();
    day9.unmount();
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z")); // 10 days
    render(StalenessBanner);
    await tick();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("is already there in the first render when the build itself is stale", () => {
    meta.buildToday = "2026-10-20";
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") }); // the visitor's clock would say fresh
    const target = document.body.appendChild(document.createElement("div"));
    // mount renders synchronously and runs no effects, so this is what the server would have sent.
    const component = mount(StalenessBanner, { target });
    expect(target.querySelector('[role="status"]')).not.toBeNull();
    unmount(component);
    target.remove();
  });

  it("says when it was last researched once stale, with the run date in it", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-15T12:00:00Z") }); // 10 days
    render(StalenessBanner);
    await tick();
    expect(screen.getByRole("status")).toHaveTextContent("This list was last researched on Oct 5 and may have missed changes since. Check the event's own page before you go.");
  });
});
