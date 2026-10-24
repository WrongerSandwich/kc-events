import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Literals only inside a vi.mock factory: vitest hoists the call above every import and declaration.
vi.mock("../src/generated/meta", () => ({
  meta: { kinds: [], regions: [], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));
import EventPageIsland from "../src/components/EventPageIsland.svelte";

// render() flushes Svelte's effects, so onMount (the visitor's date) has run when it returns.
describe("EventPageIsland", () => {
  // The page's notice above the title, which the island fills and shows once the event has passed.
  let page: HTMLElement;
  beforeEach(() => {
    page = Object.assign(document.createElement("article"), { className: "event", innerHTML: '<div class="passed" hidden><p role="status"></p></div>' });
    document.body.append(page);
  });
  afterEach(() => page.remove());

  it("shows the save button and no notice while the event is ahead", () => {
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") });
    render(EventPageIsland, { id: "evt_1", title: "A show", lastDay: "2026-10-09", shareText: "Friday, October 9, 7:00 pm · recordBar" });
    expect(screen.getByRole("button", { name: "Save A show" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    vi.useRealTimers();
  });

  it("says so once the event has passed on the visitor's clock", () => {
    vi.useFakeTimers({ now: new Date("2026-10-12T12:00:00Z") });
    render(EventPageIsland, { id: "evt_1", title: "A show", lastDay: "2026-10-09", shareText: "Friday, October 9, 7:00 pm · recordBar" });
    // Shown first, then written, so a screen reader hears it.
    expect(screen.getByRole("status")).toHaveTextContent("");
    vi.advanceTimersByTime(200);
    expect(screen.getByRole("status")).toHaveTextContent("This has already happened");
    vi.useRealTimers();
  });

  it("says so when a tab left open comes back after the event has passed (#93)", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-09T23:00:00Z") }); // Friday evening: the show is tonight
    render(EventPageIsland, { id: "evt_1", title: "A show", lastDay: "2026-10-09", shareText: "Friday, October 9, 7:00 pm · recordBar" });
    expect(screen.queryByRole("status")).toBeNull();
    vi.setSystemTime(new Date("2026-10-10T14:00:00Z")); // reopened Saturday morning
    document.dispatchEvent(new Event("visibilitychange"));
    await tick();
    vi.advanceTimersByTime(200);
    expect(screen.getByRole("status")).toHaveTextContent("This has already happened");
    vi.useRealTimers();
  });

  it("never shows the notice for an undated event", () => {
    vi.useFakeTimers({ now: new Date("2099-01-01T12:00:00Z") });
    render(EventPageIsland, { id: "evt_1", title: "Trivia", shareText: "Tuesdays · A bar" });
    expect(screen.queryByRole("status")).toBeNull();
    vi.useRealTimers();
  });

  it("offers the calendar's two ways in one control when the event has dates", () => {
    render(EventPageIsland, { id: "evt_1", title: "A show", lastDay: "2026-10-09", shareText: "x", ics: "/e/evt_1.ics", google: "https://calendar.google.com/calendar/render?action=TEMPLATE" });
    expect(screen.getByText("Add to calendar")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Apple, Outlook and others (.ics)", hidden: true })).toHaveAttribute("href", "/e/evt_1.ics");
    expect(screen.getByRole("link", { name: "Google Calendar", hidden: true })).toHaveAttribute("href", "https://calendar.google.com/calendar/render?action=TEMPLATE");
  });

  it("offers no calendar for a recurring event", () => {
    render(EventPageIsland, { id: "evt_1", title: "Trivia", shareText: "Tuesdays · A bar" });
    expect(screen.queryByText("Add to calendar")).toBeNull();
  });

  it("shares the page's own link with the date line and venue (#132)", async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, share });
    render(EventPageIsland, { id: "evt_1", title: "A show", lastDay: "2026-10-09", shareText: "Friday, October 9, 7:00 pm · recordBar" });
    await fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(share).toHaveBeenCalledWith({ title: "A show", text: "Friday, October 9, 7:00 pm · recordBar", url: `${location.origin}/e/evt_1` });
    vi.unstubAllGlobals();
  });
});
