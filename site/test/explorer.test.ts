import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { flushSync, mount, unmount } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "../src/lib/saves";

// vitest hoists vi.mock above every import and declaration, so the factory builds its own fixture.
vi.mock("../src/generated/events", async () => {
  const { event } = await import("./fixtures/event");
  return {
    events: [
      event({ id: "a", title: "Friday jazz", start: "2026-10-09T19:00:00-05:00", kind: "music", region: "Central KC" }),
      event({ id: "b", title: "Saturday film", start: "2026-10-10", kind: "film", region: "Lawrence", neighborhood: "Lawrence", venue: "Liberty Hall" }),
      event({ id: "c", title: "Later talk", start: "2026-10-20T18:00:00-05:00", kind: "talks/readings", region: "Central KC" }),
      event({ id: "d", title: "Exhibition", recurrence: "limited-run", start: "2026-09-01", end: "2026-10-25", kind: "art/exhibitions", region: "Central KC", dontMiss: true, whyLine: "Closing soon." }),
      event({ id: "r", title: "Trivia", recurrence: "recurring", start: undefined, schedule: "Tuesdays", kind: "food/drink", region: "Central KC" }),
    ],
  };
});
vi.mock("../src/generated/meta", () => ({
  meta: { kinds: ["music", "film", "talks/readings", "art/exhibitions", "food/drink"], regions: ["Central KC", "Lawrence", "Elsewhere in the metro"], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));
import Explorer from "../src/components/Explorer.svelte";

const rows = () => screen.getAllByRole("article").map((a) => within(a).getByRole("heading").textContent);

describe("Explorer", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") });
    localStorage.removeItem(STORAGE_KEY);
    history.replaceState(null, "", "/explore");
  });

  it("hydrates with the build's state and default filters, then applies the visitor's date and the URL on mount", () => {
    vi.setSystemTime(new Date("2026-10-10T17:00:00Z")); // Saturday: Friday jazz is past for the visitor
    history.replaceState(null, "", "/explore?region=central-kc");
    const target = document.body.appendChild(document.createElement("div"));
    const titles = () => [...target.querySelectorAll("article h3")].map((h) => h.textContent);
    // Svelte's mount renders synchronously but runs no effects (onMount included) until a flush, so this is
    // the first render: it must equal the server render (build date, default filters) or hydration mismatches.
    const component = mount(Explorer, { target });
    expect(titles()).toEqual(["Exhibition", "Friday jazz", "Saturday film", "Later talk"]);
    flushSync(); // onMount: the visitor's date and the URL's filters
    expect(titles()).toEqual(["Exhibition", "Later talk"]);
    unmount(component);
    target.remove();
  });

  it("renders every dated event grouped by day with the count, and no recurring events", () => {
    render(Explorer);
    expect(screen.getByRole("status")).toHaveTextContent("4 events");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["On now", "Fri Oct 9", "Sat Oct 10", "Tue Oct 20"]);
    expect(rows()).toEqual(["Exhibition", "Friday jazz", "Saturday film", "Later talk"]);
    expect(screen.queryByText("Trivia")).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });

  it("filters by kind chip and writes the URL", async () => {
    render(Explorer);
    await fireEvent.click(screen.getByRole("button", { name: "film" }));
    expect(rows()).toEqual(["Saturday film"]);
    expect(screen.getByRole("button", { name: "film" })).toHaveAttribute("aria-pressed", "true");
    expect(location.search).toBe("?kind=film");
    expect(screen.getByRole("status")).toHaveTextContent("1 event");
  });

  it("reads its state from the URL on mount", () => {
    history.replaceState(null, "", "/explore?when=weekend&kind=music&kind=film");
    render(Explorer);
    expect(rows()).toEqual(["Friday jazz", "Saturday film"]);
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("puts each row's day in its date line under the venue sort, which has no day headings", () => {
    history.replaceState(null, "", "/explore?sort=venue");
    render(Explorer);
    expect(screen.queryByRole("heading", { level: 2, name: "Fri Oct 9" })).toBeNull();
    const jazz = screen.getAllByRole("article").find((a) => within(a).getByRole("heading").textContent === "Friday jazz")!;
    expect(jazz).toHaveTextContent("Fri Oct 9 · 7:00 pm");
    const film = screen.getAllByRole("article").find((a) => within(a).getByRole("heading").textContent === "Saturday film")!;
    expect(film).toHaveTextContent("Sat Oct 10 · all day");
  });

  it("shows a shared custom range in the date inputs", () => {
    history.replaceState(null, "", "/explore?when=2026-10-09..2026-10-10");
    render(Explorer);
    expect(screen.getByLabelText("From")).toHaveValue("2026-10-09");
    expect(screen.getByLabelText("To")).toHaveValue("2026-10-10");
    expect(rows()).toEqual(["Exhibition", "Friday jazz", "Saturday film"]);
  });

  it("searches, includes always-there, and clears", async () => {
    render(Explorer);
    await fireEvent.input(screen.getByRole("searchbox"), { target: { value: "liberty" } });
    expect(rows()).toEqual(["Saturday film"]);
    await fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(rows()).toHaveLength(4);
    await fireEvent.click(screen.getByRole("switch", { name: "Include always-there" }));
    expect(screen.getByText("Trivia")).toBeInTheDocument();
    expect(location.search).toBe("?recurring=1");
  });

  it("says which filters are active when nothing matches, and offers to clear them", async () => {
    render(Explorer);
    await fireEvent.click(screen.getByRole("button", { name: "film" }));
    await fireEvent.input(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(screen.getByRole("status")).toHaveTextContent("0 events");
    const empty = screen.getByText(/No events match/);
    expect(empty).toHaveTextContent("No events match film · “zzz”.");
    await fireEvent.click(within(empty).getByRole("button", { name: "Clear them" }));
    expect(rows()).toHaveLength(4);
    expect(location.search).toBe("");
  });

  it("shows only saved events when asked", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["c"]));
    render(Explorer);
    await fireEvent.click(screen.getByRole("switch", { name: "Saved only" }));
    expect(rows()).toEqual(["Later talk"]);
  });
});
