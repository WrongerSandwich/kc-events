import { render, screen, within } from "@testing-library/svelte";
import { flushSync, mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

// vitest hoists vi.mock above every import and declaration, so a factory cannot use a module-level
// variable or a static import: it builds its fixture itself, importing the helper dynamically.
const { state } = vi.hoisted(() => ({ state: { empty: false } }));
vi.mock("../src/generated/dont-miss", async () => {
  const { event } = await import("./fixtures/event");
  const picks = [
    event({ id: "a", title: "Tuesday show", dontMiss: true, whyLine: "Why A.", start: "2026-10-06T20:00:00-05:00" }),
    event({ id: "b", title: "Closing run", dontMiss: true, whyLine: "Why B.", recurrence: "limited-run", start: "2026-09-01", end: "2026-10-11" }),
    event({ id: "c", title: "Later show", dontMiss: true, whyLine: "Why C.", start: "2026-10-17" }),
    event({ id: "d", title: "Plain show", dontMiss: false, start: "2026-10-06" }),
  ];
  // A getter, so one test can switch to no picks at all.
  return { get dontMiss() { return state.empty ? [] : picks; } };
});
vi.mock("../src/generated/meta", () => ({
  meta: { kinds: ["music"], regions: ["Central KC"], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));

import DontMissList from "../src/components/DontMissList.svelte";

describe("DontMissList", () => {
  afterEach(() => {
    vi.useRealTimers();
    state.empty = false;
  });

  it("hydrates with the build's state, then takes the visitor's date on mount", () => {
    vi.useFakeTimers({ now: new Date("2026-10-12T12:00:00Z") }); // a week after the build
    const target = document.body.appendChild(document.createElement("div"));
    const labels = () => [...target.querySelectorAll("section")].map((s) => s.querySelector("h2")?.textContent);
    // Svelte's mount renders synchronously but runs no effects (onMount included) until a flush, so this is
    // the first render: it must equal what the server rendered at build, or hydration would mismatch.
    const component = mount(DontMissList, { target });
    expect(labels()).toEqual(["This week, Oct 5–11", "Next two weeks, through Oct 19", "Later, after Oct 19"]);
    expect(target.textContent).toContain("Tuesday show");
    expect(target.querySelector(".tile.today, .card.started")).toBeNull();
    flushSync(); // onMount: the visitor's date
    expect(labels()).toEqual(["This week, Oct 12–18", "Next two weeks, through Oct 26", "Later, after Oct 26"]);
    expect(target.textContent).not.toContain("Tuesday show");
    unmount(component);
    target.remove();
  });

  it("renders every bucket with its heading, cards in order, and the empty line", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") });
    render(DontMissList);
    await tick();
    const sections = screen.getAllByRole("region");
    expect(sections.map((s) => within(s).getByRole("heading", { level: 2 }).textContent)).toEqual(["This week, Oct 5–11", "Next two weeks, through Oct 19", "Later, after Oct 19"]);
    const first = within(sections[0]!).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(first).toEqual(["Closing run", "Tuesday show"]); // the run is on now, so it sorts as today
    expect(within(sections[0]!).getByText("Why A.")).toBeInTheDocument();
    // The tile is visual; the full date is in words for screen readers.
    expect(within(sections[0]!).getByText("On now, closes Sun Oct 11.")).toBeInTheDocument();
    expect(within(sections[0]!).getByRole("list", { name: "Picks by kind" })).toHaveTextContent("2 music");
    expect(within(sections[1]!).getByText("Later show")).toBeInTheDocument();
    expect(within(sections[2]!).getByText("Nothing picked further out yet.")).toBeInTheDocument();
    expect(screen.queryByText("Plain show")).toBeNull();
  });

  it("re-buckets on the visitor's date", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-12T12:00:00Z") }); // the following Monday
    render(DontMissList);
    await tick();
    const sections = screen.getAllByRole("region");
    expect(sections[0]).toHaveAccessibleName("This week, Oct 12–18");
    expect(within(sections[0]!).getByText("Later show")).toBeInTheDocument();
    expect(screen.queryByText("Tuesday show")).toBeNull(); // past
  });

  it("reads the clock again when the tab comes back: Today, then Started and dimmed, then the next day", async () => {
    const tz = process.env.TZ;
    process.env.TZ = "Asia/Tokyo"; // the visitor's machine is a zone away; the cards still go by Kansas City time
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    try {
      vi.useFakeTimers({ now: new Date("2026-10-07T00:30:00Z") }); // 7:30 pm Tuesday in Chicago, Wednesday in Tokyo
      render(DontMissList);
      await tick();
      const card = () => screen.getByRole("heading", { name: "Tuesday show" }).closest("article")!;
      expect(card()).not.toHaveClass("started");
      expect(card().querySelector(".tile")).toHaveClass("today");
      expect(card().querySelector(".tile .top")).toHaveTextContent("Today");
      expect(within(card()).getByText("Today, 8:00 pm.")).toBeInTheDocument();

      vi.setSystemTime(new Date("2026-10-07T01:05:00Z")); // 8:05 pm: no timer notices
      await tick();
      expect(card()).not.toHaveClass("started");
      document.dispatchEvent(new Event("visibilitychange"));
      await tick();
      expect(card()).toHaveClass("started");
      expect(within(card()).getByText("Started 8:00 pm")).toBeInTheDocument();
      expect(within(card()).getByText("Today, started 8:00 pm.")).toBeInTheDocument();

      vi.setSystemTime(new Date("2026-10-07T15:00:00Z")); // Wednesday morning: the show is gone
      document.dispatchEvent(new Event("visibilitychange"));
      await tick();
      expect(screen.queryByText("Tuesday show")).toBeNull();
    } finally {
      visibility.mockRestore();
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });

  it("says so and points at the explorer when nothing is picked", async () => {
    state.empty = true;
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") });
    render(DontMissList);
    await tick();
    expect(screen.getByText(/Nothing is picked right now/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse everything" })).toHaveAttribute("href", "/explore");
    expect(screen.queryAllByRole("region")).toEqual([]);
  });
});
