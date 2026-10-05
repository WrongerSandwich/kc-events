import { render, screen, within } from "@testing-library/svelte";
import { flushSync, mount, tick, unmount } from "svelte";
import { describe, expect, it, vi } from "vitest";

// vitest hoists vi.mock above every import and declaration, so a factory cannot use a module-level
// variable or a static import: it builds its fixture itself, importing the helper dynamically.
vi.mock("../src/generated/dont-miss", async () => {
  const { event } = await import("./fixtures/event");
  return {
    dontMiss: [
      event({ id: "a", title: "Tuesday show", dontMiss: true, whyLine: "Why A.", start: "2026-10-06T20:00:00-05:00" }),
      event({ id: "b", title: "Closing run", dontMiss: true, whyLine: "Why B.", recurrence: "limited-run", start: "2026-09-01", end: "2026-10-11" }),
      event({ id: "c", title: "Later show", dontMiss: true, whyLine: "Why C.", start: "2026-10-17" }),
      event({ id: "d", title: "Plain show", dontMiss: false, start: "2026-10-06" }),
    ],
  };
});
vi.mock("../src/generated/meta", () => ({
  meta: { kinds: ["music"], regions: ["Central KC"], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));

import DontMissList from "../src/components/DontMissList.svelte";

describe("DontMissList", () => {
  it("hydrates with the build's state, then takes the visitor's date on mount", () => {
    vi.useFakeTimers({ now: new Date("2026-10-12T12:00:00Z") }); // a week after the build
    const target = document.body.appendChild(document.createElement("div"));
    const labels = () => [...target.querySelectorAll("section")].map((s) => s.getAttribute("aria-label"));
    // Svelte's mount renders synchronously but runs no effects (onMount included) until a flush, so this is
    // the first render: it must equal what the server rendered at build, or hydration would mismatch.
    const component = mount(DontMissList, { target });
    expect(labels()).toEqual(["This week, Oct 5–11", "Next two weeks, through Oct 19", "Further out"]);
    expect(target.textContent).toContain("Tuesday show");
    flushSync(); // onMount: the visitor's date
    expect(labels()).toEqual(["This week, Oct 12–18", "Next two weeks, through Oct 26", "Further out"]);
    expect(target.textContent).not.toContain("Tuesday show");
    unmount(component);
    target.remove();
    vi.useRealTimers();
  });

  it("renders every bucket with its heading, cards in order, and the empty line", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") });
    render(DontMissList);
    await tick();
    const sections = screen.getAllByRole("region");
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual(["This week, Oct 5–11", "Next two weeks, through Oct 19", "Further out"]);
    const first = within(sections[0]!).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(first).toEqual(["Tuesday show", "Closing run"]);
    expect(within(sections[0]!).getByText("Why A.")).toBeInTheDocument();
    expect(within(sections[0]!).getByText("On now, closes Sun Oct 11")).toBeInTheDocument();
    expect(within(sections[1]!).getByText("Later show")).toBeInTheDocument();
    expect(within(sections[2]!).getByText(/Nothing flagged yet/)).toBeInTheDocument();
    expect(screen.queryByText("Plain show")).toBeNull();
    vi.useRealTimers();
  });

  it("re-buckets on the visitor's date", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-12T12:00:00Z") }); // the following Monday
    render(DontMissList);
    await tick();
    const sections = screen.getAllByRole("region");
    expect(sections[0]).toHaveAttribute("aria-label", "This week, Oct 12–18");
    expect(within(sections[0]!).getByText("Later show")).toBeInTheDocument();
    expect(screen.queryByText("Tuesday show")).toBeNull(); // past
    vi.useRealTimers();
  });
});
