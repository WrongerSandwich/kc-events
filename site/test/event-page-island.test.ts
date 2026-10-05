import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

// Literals only inside a vi.mock factory: vitest hoists the call above every import and declaration.
vi.mock("../src/generated/meta", () => ({
  meta: { kinds: [], regions: [], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));
import EventPageIsland from "../src/components/EventPageIsland.svelte";

// render() flushes Svelte's effects, so onMount (the visitor's date) has run when it returns.
describe("EventPageIsland", () => {
  it("shows the save button and no notice while the event is ahead", () => {
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") });
    render(EventPageIsland, { id: "evt_1", title: "A show", lastDay: "2026-10-09" });
    expect(screen.getByRole("button", { name: "Save A show" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    vi.useRealTimers();
  });

  it("says so once the event has passed on the visitor's clock", () => {
    vi.useFakeTimers({ now: new Date("2026-10-12T12:00:00Z") });
    render(EventPageIsland, { id: "evt_1", title: "A show", lastDay: "2026-10-09" });
    expect(screen.getByRole("status")).toHaveTextContent("This has already happened");
    vi.useRealTimers();
  });

  it("never shows the notice for an undated event", () => {
    vi.useFakeTimers({ now: new Date("2099-01-01T12:00:00Z") });
    render(EventPageIsland, { id: "evt_1", title: "Trivia" });
    expect(screen.queryByRole("status")).toBeNull();
    vi.useRealTimers();
  });
});
