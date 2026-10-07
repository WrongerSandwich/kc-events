import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
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
// The live count is announced once input settles (Explorer's SETTLE_MS, 500 ms), so read it after the wait.
const announced = () => { vi.advanceTimersByTime(500); flushSync(); return screen.getByRole("status"); };
// What Tab reaches, in order: no tabindex="-1", nothing disabled.
// Dispatches a keydown and says whether a handler prevented it (testing-library's fireEvent is async here).
const prevented = (el: Element, key: string, init: KeyboardEventInit = {}) => { const ok = el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })); flushSync(); return !ok; };
const tabStops = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>("a[href], button, input, select, summary")].filter((el) => el.getAttribute("tabindex") !== "-1" && !(el as HTMLButtonElement).disabled);

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
    expect(announced()).toHaveTextContent("4 events");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["On now", "Fri Oct 9", "Sat Oct 10", "Tue Oct 20"]);
    expect(rows()).toEqual(["Exhibition", "Friday jazz", "Saturday film", "Later talk"]);
    expect(screen.queryByText("Trivia")).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });

  it("leads with dated days: On now is one closed line with its count, a native disclosure that opens to its rows", async () => {
    render(Explorer);
    const onNow = screen.getByRole("heading", { level: 2, name: "On now" }).closest("details")!;
    expect(onNow).not.toHaveAttribute("open");
    const summary = onNow.querySelector("summary")!;
    expect(summary).toHaveTextContent("On now · 1 event");
    expect(within(onNow).getByRole("article")).toHaveTextContent("Exhibition");
    // Nothing but the disclosure comes before the first day's heading.
    expect(onNow.compareDocumentPosition(screen.getByRole("heading", { level: 2, name: "Fri Oct 9" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await fireEvent.click(summary);
    expect(onNow).toHaveAttribute("open");
  });

  it("keeps On now as an open day group under a when-filter", () => {
    history.replaceState(null, "", "/explore?when=30d");
    render(Explorer);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["On now", "Fri Oct 9", "Sat Oct 10", "Tue Oct 20"]);
    expect(document.querySelector(".results details")).toBeNull();
  });

  it("offers This weekend, Friday to Sunday, beside Through Sunday", async () => {
    render(Explorer);
    await fireEvent.click(screen.getByRole("button", { name: "This weekend" }));
    expect(location.search).toBe("?when=fri-sun");
    expect(rows()).toEqual(["Exhibition", "Friday jazz", "Saturday film"]);
    expect(screen.getByRole("button", { name: "Through Sunday" })).toHaveAttribute("aria-pressed", "false");
  });

  it("filters by kind chip and writes the URL", async () => {
    render(Explorer);
    await fireEvent.click(screen.getByRole("button", { name: "film" }));
    expect(rows()).toEqual(["Saturday film"]);
    expect(screen.getByRole("button", { name: "film" })).toHaveAttribute("aria-pressed", "true");
    expect(location.search).toBe("?kind=film");
    expect(announced()).toHaveTextContent("1 event");
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

  it("puts a heading over each venue's rows under the venue sort", () => {
    history.replaceState(null, "", "/explore?sort=venue");
    render(Explorer);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Liberty Hall", "recordBar"]);
  });

  it("labels a don't-miss row in words, not by colour alone", () => {
    history.replaceState(null, "", "/explore?when=30d"); // On now open, so its rows show
    render(Explorer);
    const row = (title: string) => screen.getAllByRole("article").find((a) => within(a).getByRole("heading").textContent === title)!;
    expect(within(row("Exhibition")).getByText("Don't miss")).toBeVisible();
    expect(within(row("Friday jazz")).queryByText("Don't miss")).toBeNull();
  });

  it("keeps the From and To fields behind Custom dates…, open when the link carries a range", () => {
    render(Explorer);
    const custom = screen.getByText("Custom dates…").closest("details")!;
    expect(custom).not.toHaveAttribute("open");
    expect(custom).toContainElement(screen.getByLabelText("From"));
    expect(custom).toContainElement(screen.getByLabelText("To"));
    cleanup();
    history.replaceState(null, "", "/explore?when=2026-10-09..2026-10-10");
    render(Explorer);
    expect(screen.getByText("Custom dates…").closest("details")).toHaveAttribute("open");
  });

  it("renders the phone filter sheet closed from the first render, behind a Filters button that opens it", async () => {
    history.replaceState(null, "", "/explore?kind=music");
    const target = document.body.appendChild(document.createElement("div"));
    const component = mount(Explorer, { target });
    // The first render is the server's: closed already, so nothing closes on hydration.
    const toggle = within(target).getByRole("button", { name: /^Filters/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const sheet = target.querySelector(`#${toggle.getAttribute("aria-controls")}`)!;
    expect(sheet).not.toHaveClass("open");
    flushSync();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("Filters (1)");
    await fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(sheet).toHaveClass("open");
    unmount(component);
    target.remove();
  });

  it("names the active filters as pills in the bar, each removing only its own filter", async () => {
    history.replaceState(null, "", "/explore?when=weekend&kind=music&kind=film");
    render(Explorer);
    const bar = document.querySelector(".bar") as HTMLElement;
    const pills = within(bar).getAllByRole("button", { name: /^Remove / });
    expect(pills.map((p) => p.textContent?.trim())).toEqual(["Through Sunday", "music", "film"]);
    await fireEvent.click(within(bar).getByRole("button", { name: "Remove music" }));
    expect(location.search).toBe("?when=weekend&kind=film");
    expect(rows()).toEqual(["Saturday film"]);
    expect(screen.getByRole("button", { name: "music" })).toHaveAttribute("aria-pressed", "false");
    await fireEvent.click(within(bar).getByRole("button", { name: "Remove Through Sunday" }));
    expect(location.search).toBe("?kind=film");
    expect(within(bar).getAllByRole("button", { name: /^Remove / }).map((p) => p.textContent?.trim())).toEqual(["film"]);
  });

  it("keeps keyboard focus in the bar when a pill goes: on the next pill, else the one before, else search", async () => {
    history.replaceState(null, "", "/explore?when=weekend&kind=music&kind=film");
    render(Explorer);
    await fireEvent.click(screen.getByRole("button", { name: "Remove music" }));
    expect(screen.getByRole("button", { name: "Remove film" })).toHaveFocus();
    await fireEvent.click(screen.getByRole("button", { name: "Remove film" }));
    expect(screen.getByRole("button", { name: "Remove Through Sunday" })).toHaveFocus();
    await fireEvent.click(screen.getByRole("button", { name: "Remove Through Sunday" }));
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveFocus();
  });

  it("returns to the top of the results when a filter changes below it, and stays put above it", async () => {
    const scrolled = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    let top = -4000;
    const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return { top: this.id === "results" ? top : 0 } as DOMRect;
    });
    try {
      render(Explorer);
      await fireEvent.click(screen.getByRole("button", { name: "film" }));
      // jsdom lays nothing out, so the bar measures 0 px and the results' top is the whole distance.
      expect(scrolled).toHaveBeenCalledExactlyOnceWith({ top: -4000, behavior: "instant" });
      top = 300;
      await fireEvent.click(screen.getByRole("button", { name: "music" }));
      expect(scrolled).toHaveBeenCalledTimes(1);
    } finally {
      rect.mockRestore();
      scrolled.mockRestore();
    }
  });

  it("shows a shared custom range in the date inputs", () => {
    history.replaceState(null, "", "/explore?when=2026-10-09..2026-10-10");
    render(Explorer);
    expect(screen.getByLabelText("From")).toHaveValue("2026-10-09");
    expect(screen.getByLabelText("To")).toHaveValue("2026-10-10");
    expect(rows()).toEqual(["Exhibition", "Friday jazz", "Saturday film"]);
  });

  it("keeps a half-entered range when another filter changes", async () => {
    render(Explorer);
    const from = screen.getByLabelText("From");
    await fireEvent.input(from, { target: { value: "2026-10-09" } });
    await fireEvent.change(from);
    await fireEvent.click(screen.getByRole("button", { name: "film" }));
    expect(screen.getByLabelText("From")).toHaveValue("2026-10-09");
  });

  it("drops an applied range when one of its dates is cleared", async () => {
    history.replaceState(null, "", "/explore?when=2026-10-09..2026-10-10");
    render(Explorer);
    // A browser fires input, then change, which is what binds and then applies the value.
    const from = screen.getByLabelText("From");
    await fireEvent.input(from, { target: { value: "" } });
    await fireEvent.change(from);
    flushSync();
    expect(screen.getByLabelText("From")).toHaveValue("");
    expect(screen.getByLabelText("To")).toHaveValue("");
    expect(location.search).toBe("");
  });

  it("searches, includes always-there, and clears", async () => {
    render(Explorer);
    await fireEvent.input(screen.getByRole("searchbox"), { target: { value: "liberty" } });
    expect(rows()).toEqual(["Saturday film"]);
    await fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(rows()).toHaveLength(4);
    await fireEvent.click(screen.getByRole("checkbox", { name: "Include always-there" }));
    expect(screen.getByText("Trivia")).toBeInTheDocument();
    expect(location.search).toBe("?recurring=1");
  });

  it("says which filters are active when nothing matches, and offers to clear them", async () => {
    render(Explorer);
    await fireEvent.click(screen.getByRole("button", { name: "film" }));
    await fireEvent.input(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(announced()).toHaveTextContent("0 events");
    const empty = screen.getByText(/No events match/);
    expect(empty).toHaveTextContent("No events match film · “zzz”.");
    await fireEvent.click(within(empty).getByRole("button", { name: "Clear them" }));
    expect(rows()).toHaveLength(4);
    expect(location.search).toBe("");
  });

  it("shows only saved events when asked", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["c"]));
    render(Explorer);
    await fireEvent.click(screen.getByRole("checkbox", { name: "Saved only" }));
    expect(rows()).toEqual(["Later talk"]);
  });

  it("leads with search, then a link that skips the filters to the results", () => {
    const { container } = render(Explorer);
    const [first, second] = tabStops(container);
    expect(first).toBe(screen.getByRole("searchbox", { name: "Search" }));
    expect(second).toBe(screen.getByRole("link", { name: "Skip to results" }));
    expect(second).toHaveAttribute("href", "#results");
    const results = container.querySelector("#results")!;
    expect(results).toBe(screen.getByRole("region", { name: "Events" }));
    // Focusable only by the link, so it is not a Tab stop of its own.
    expect(results).toHaveAttribute("tabindex", "-1");
    // Search is outside the phone's filter sheet.
    expect(screen.getByRole("searchbox").closest("details")).toBeNull();
  });

  it("gives every row at most two Tab stops, its title and Save, with the host still a link", () => {
    render(Explorer);
    for (const row of screen.getAllByRole("article")) {
      expect(tabStops(row).length).toBeLessThanOrEqual(2);
      expect(row.querySelector("a.host")).toHaveAttribute("href");
    }
  });

  it("shows the count at once but announces it once, when typing settles", async () => {
    render(Explorer);
    const status = announced();
    expect(status).toHaveTextContent("4 events");
    const changes = new MutationObserver(() => {});
    changes.observe(status, { childList: true, characterData: true, subtree: true });
    const search = screen.getByRole("searchbox");
    for (const q of ["f", "fr", "fri", "frid", "frida"]) {
      await fireEvent.input(search, { target: { value: q } });
      vi.advanceTimersByTime(150);
      flushSync();
    }
    expect(rows()).toEqual(["Friday jazz"]);
    expect(document.querySelector(".count")).toHaveTextContent("1 event");
    expect(status).toHaveTextContent("4 events");
    expect(changes.takeRecords()).toHaveLength(0);
    vi.advanceTimersByTime(500);
    flushSync();
    expect(status).toHaveTextContent("1 event");
    expect(changes.takeRecords()).toHaveLength(1);
    changes.disconnect();
  });
  it("focuses search on / from outside a text field, without typing it; a modified / and / in a field are left alone", () => {
    render(Explorer);
    const search = screen.getByRole("searchbox", { name: "Search" });
    expect(search).toHaveAttribute("aria-keyshortcuts", "/");
    expect(prevented(document.body, "/")).toBe(true);
    expect(search).toHaveFocus();
    expect(search).toHaveValue("");
    search.blur();
    for (const mod of ["ctrlKey", "metaKey", "altKey"]) {
      expect(prevented(document.body, "/", { [mod]: true })).toBe(false);
      expect(search).not.toHaveFocus();
    }
    const checkbox = screen.getAllByRole("checkbox")[0]!;
    checkbox.focus();
    expect(prevented(checkbox, "/")).toBe(false);
    expect(checkbox).toHaveFocus();
    search.focus();
    expect(prevented(search, "/")).toBe(false);
  });

  it("clears a non-empty search on Esc, dropping q from the URL, and leaves an empty one on the next", async () => {
    render(Explorer);
    const search = screen.getByRole("searchbox", { name: "Search" });
    search.focus();
    await fireEvent.input(search, { target: { value: "jazz" } });
    expect(location.search).toBe("?q=jazz");
    expect(rows()).toEqual(["Friday jazz"]);
    // Prevented, so a type=search field's own Esc clear does not run as well.
    expect(prevented(search, "Escape")).toBe(true);
    expect(search).toHaveValue("");
    expect(location.search).toBe("");
    expect(rows()).toEqual(["Exhibition", "Friday jazz", "Saturday film", "Later talk"]);
    expect(search).toHaveFocus();
    prevented(search, "Escape");
    expect(search).not.toHaveFocus();
  });
});
