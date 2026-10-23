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
import { events } from "../src/generated/events";
import { event } from "./fixtures/event";
import { found } from "./fixtures/found";

const rows = () => screen.getAllByRole("article").map((a) => within(a).getByRole("heading").textContent);
// The live count is announced once input settles (Explorer's SETTLE_MS, 500 ms), so read it after the wait.
const announced = () => { vi.advanceTimersByTime(500); flushSync(); return screen.getByRole("status"); };
// Dispatches a keydown and says whether a handler prevented it (testing-library's fireEvent is async here).
const prevented = (el: Element, key: string, init: KeyboardEventInit = {}) => { const ok = el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })); flushSync(); return !ok; };
// What Tab reaches, in order: no tabindex="-1", nothing disabled.
const tabStops = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>("a[href], button, input, select, summary")].filter((el) => el.getAttribute("tabindex") !== "-1" && !(el as HTMLButtonElement).disabled);

describe("Explorer", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") });
    localStorage.removeItem(STORAGE_KEY);
    history.replaceState(null, "", "/explore");
  });

  it("hydrates with the build's state and default filters, then applies the visitor's date and the URL on mount", () => {
    vi.setSystemTime(new Date("2026-10-10T17:00:00Z")); // Saturday: Friday jazz is past for the visitor
    history.replaceState(null, "", "/explore?when=all&region=central-kc");
    const target = document.body.appendChild(document.createElement("div"));
    const titles = () => [...target.querySelectorAll("article h3")].map((h) => h.textContent);
    // Svelte's mount renders synchronously but runs no effects (onMount included) until a flush, so this is
    // the first render: it must equal the server render (build date, default filters: the build's week) or hydration
    // mismatches.
    const component = mount(Explorer, { target });
    expect(titles()).toEqual(["Exhibition", "Friday jazz", "Saturday film"]);
    flushSync(); // onMount: the visitor's date and the URL's filters
    expect(titles()).toEqual(["Exhibition", "Later talk"]);
    unmount(component);
    target.remove();
  });

  it("opens on the week, today through Sunday, grouped by day with the count, and no recurring events (#183)", () => {
    render(Explorer);
    expect(announced()).toHaveTextContent("3 events");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["On now", "Fri Oct 9", "Sat Oct 10"]);
    expect(rows()).toEqual(["Exhibition", "Friday jazz", "Saturday film"]);
    expect(screen.queryByText("Trivia")).toBeNull();
    expect(screen.getByRole("button", { name: "Through Sunday" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });

  it("shows every date at ?when=all", () => {
    history.replaceState(null, "", "/explore?when=all");
    render(Explorer);
    expect(rows()).toEqual(["Exhibition", "Friday jazz", "Saturday film", "Later talk"]);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("link", { name: /Keep going/ })).toBeNull();
  });

  it("folds On now past six rows into one closed line with its count, a native disclosure that opens to its rows (#183)", async () => {
    const runs = Array.from({ length: 6 }, (_, i) => event({ id: `run${i}`, title: `Run ${i}`, recurrence: "limited-run", start: "2026-09-01", end: "2026-11-30" }));
    events.push(...runs);
    try {
      render(Explorer);
      const onNow = screen.getByRole("heading", { level: 2, name: "On now" }).closest("details")!;
      expect(onNow).not.toHaveAttribute("open");
      const summary = onNow.querySelector("summary")!;
      expect(summary).toHaveTextContent("On now · 7 events");
      // Plain text: some screen readers flatten a heading inside a summary; the heading is in the group (#194).
      expect(summary.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
      expect(within(onNow).getAllByRole("article")[0]).toHaveTextContent("Exhibition");
      // Nothing but the disclosure comes before the first day's heading.
      expect(onNow.compareDocumentPosition(screen.getByRole("heading", { level: 2, name: "Fri Oct 9" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      await fireEvent.click(summary);
      expect(onNow).toHaveAttribute("open");
    } finally {
      events.splice(events.length - runs.length);
    }
  });

  it("keeps a short On now as an open day group, under any when-filter", () => {
    history.replaceState(null, "", "/explore?when=30d");
    render(Explorer);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["On now", "Fri Oct 9", "Sat Oct 10", "Tue Oct 20"]);
    expect(document.querySelector(".results details")).toBeNull();
  });

  it("offers Fri, Sat and Sun from Thursday, each a one-day range, pressed when the filter is that day (#183)", async () => {
    render(Explorer); // a Monday: none
    expect(screen.queryByRole("button", { name: "Fri" })).toBeNull();
    cleanup();
    vi.setSystemTime(new Date("2026-10-09T17:00:00Z")); // Friday: Today covers Friday
    render(Explorer);
    // One group named When, the fieldset; its buttons were once in a second, so "When" was said twice (#194).
    const when = screen.getByRole("group", { name: "When" });
    expect(within(when).getAllByRole("button").map((b) => b.textContent)).toEqual(["Today", "Sat", "Sun", "This weekend", "Through Sunday", "Next 7 days", "Next 30 days", "All"]);
    await fireEvent.click(within(when).getByRole("button", { name: "Sat" }));
    expect(location.search).toBe("?when=2026-10-10..2026-10-10");
    expect(rows()).toEqual(["Exhibition", "Saturday film"]);
    expect(within(when).getByRole("button", { name: "Sat" })).toHaveAttribute("aria-pressed", "true");
    expect(within(when).getByRole("button", { name: "Sun" })).toHaveAttribute("aria-pressed", "false");
    // A chip's range is on its chip, so Custom dates… stays closed.
    expect(screen.getByText("Custom dates…").closest("details")).not.toHaveAttribute("open");
  });

  it("keeps going to next week below the last day, a link that adds the days in place, with every date beside it (#183)", async () => {
    const scrolled = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    vi.setSystemTime(new Date("2026-10-15T17:00:00Z")); // Thursday: Friday jazz and Saturday film are over, Later talk is next week
    try {
      const { container } = render(Explorer);
      const keep = screen.getByRole("link", { name: /^Keep going/ });
      expect(keep).toHaveTextContent("Keep going: next week · 1 event");
      expect(keep).toHaveAttribute("href", "/explore?when=2026-10-15..2026-10-25");
      const all = screen.getByRole("link", { name: "or see all 2" });
      expect(all).toHaveAttribute("href", "/explore?when=all");
      // After the last row of the week (here On now's).
      const lastRow = [...container.querySelectorAll("article")].at(-1)!;
      expect(lastRow.compareDocumentPosition(keep) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      await fireEvent.click(keep);
      expect(location.search).toBe("?when=2026-10-15..2026-10-25");
      expect(rows()).toEqual(["Exhibition", "Later talk"]);
      // The new first day takes focus, and the page is not sent back to the results' top.
      expect(screen.getByRole("heading", { level: 2, name: "Tue Oct 20" })).toHaveFocus();
      expect(scrolled).toHaveBeenCalledExactlyOnceWith({ top: 0, behavior: "instant" });
      // Nothing lies past the new end: no button, and no every-date link, which would show the same.
      expect(screen.queryByRole("link", { name: /Keep going/ })).toBeNull();
      expect(screen.queryByRole("link", { name: /see all/ })).toBeNull();
    } finally {
      scrolled.mockRestore();
    }
  });

  it("names the day it keeps going to when that is not a whole week: Today on a Monday runs on to Sunday", () => {
    history.replaceState(null, "", "/explore?when=today");
    render(Explorer);
    expect(screen.getByRole("link", { name: /^Keep going/ })).toHaveTextContent("Keep going: through Sun Oct 11 · 2 events");
  });

  it("sits above Always there, and leaves a modified click to the browser", async () => {
    history.replaceState(null, "", "/explore?recurring=1");
    vi.setSystemTime(new Date("2026-10-15T17:00:00Z"));
    render(Explorer);
    const keep = screen.getByRole("link", { name: /^Keep going/ });
    expect(keep.compareDocumentPosition(screen.getByRole("heading", { level: 2, name: "Always there" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(keep).toHaveAttribute("href", "/explore?when=2026-10-15..2026-10-25&recurring=1");
    expect(screen.getByRole("link", { name: "or see all 3" })).toHaveAttribute("href", "/explore?when=all&recurring=1");
    // Skip past results lands after the last dated row, just before Keep going (#194).
    expect(screen.getByRole("link", { name: "Skip past results" })).toHaveAttribute("href", "#past-results");
    const target = document.getElementById("past-results")!;
    const rowsBefore = [...document.querySelectorAll("article.row")].filter((r) => r.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(rowsBefore.map((r) => within(r as HTMLElement).getByRole("heading").textContent)).toEqual(["Exhibition"]);
    expect(target.compareDocumentPosition(keep) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await fireEvent.click(keep, { ctrlKey: true });
    expect(location.search).toBe("?recurring=1");
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
    const jazz = found(screen.getAllByRole("article").find((a) => within(a).getByRole("heading").textContent === "Friday jazz"), "the Friday jazz row");
    expect(jazz).toHaveTextContent("Fri Oct 9 · 7:00 pm");
    const film = found(screen.getAllByRole("article").find((a) => within(a).getByRole("heading").textContent === "Saturday film"), "the Saturday film row");
    expect(film).toHaveTextContent("Sat Oct 10 · no time listed");
  });

  it("puts a heading over each venue's rows under the venue sort", () => {
    history.replaceState(null, "", "/explore?sort=venue");
    render(Explorer);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Liberty Hall", "recordBar"]);
  });

  it("labels a don't-miss row in words, not by colour alone", () => {
    history.replaceState(null, "", "/explore?when=30d"); // On now open, so its rows show
    render(Explorer);
    const row = (title: string) => found(screen.getAllByRole("article").find((a) => within(a).getByRole("heading").textContent === title), `the ${title} row`);
    // Twice in the markup, one shown by width (#184); jsdom has no media queries, so both are there.
    expect(within(row("Exhibition")).getAllByText("Don't miss")).toHaveLength(2);
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
    expect(toggle).toHaveTextContent("Filters (2)");
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
    expect(location.search).toBe("?kind=film");
    expect(rows()).toEqual(["Saturday film"]);
    expect(screen.getByRole("button", { name: "music" })).toHaveAttribute("aria-pressed", "false");
    await fireEvent.click(within(bar).getByRole("button", { name: "Remove Through Sunday" }));
    expect(location.search).toBe("?when=all&kind=film");
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
    expect(rows()).toHaveLength(3); // back to the week;
    await fireEvent.click(screen.getByRole("checkbox", { name: "Include always-there" }));
    expect(screen.getByRole("heading", { level: 3, name: "Trivia" })).toBeInTheDocument();
    expect(location.search).toBe("?recurring=1");
  });

  it("says which filters are active when nothing matches, and offers to clear them", async () => {
    render(Explorer);
    await fireEvent.click(screen.getByRole("button", { name: "film" }));
    await fireEvent.input(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(announced()).toHaveTextContent("0 events");
    const empty = screen.getByText(/No events match/);
    expect(empty).toHaveTextContent("No events match Through Sunday · film · “zzz”.");
    await fireEvent.click(within(empty).getByRole("button", { name: "Clear filters" }));
    expect(rows()).toHaveLength(4);
    expect(location.search).toBe("?when=all");
  });

  it("shows only saved events when asked", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: "c", last: "2026-10-20" }]));
    history.replaceState(null, "", "/explore?when=all");
    render(Explorer);
    await fireEvent.click(screen.getByRole("checkbox", { name: "Saved only" }));
    expect(rows()).toEqual(["Later talk"]);
  });

  it("says nothing is saved yet, and how to save, when the saved view is opened with no saves (audit B1, F4)", async () => {
    // The header's Saved link lands here on a first visit; "No events match saved only" read as a failed filter.
    history.replaceState(null, "", "/explore?saved=1");
    render(Explorer);
    flushSync();
    const empty = screen.getByText(/Nothing saved yet/);
    expect(empty).toHaveTextContent("Nothing saved yet. Save any event and it appears here; saves stay in this browser, with no account.");
    expect(screen.queryByText(/No events match/)).toBeNull();
    expect(within(empty).getByRole("link", { name: "the picks" })).toHaveAttribute("href", "/");
  });

  it("shows a save that has passed as passed in the saved view, and keeps it out of the export (#93)", async () => {
    vi.setSystemTime(new Date("2026-10-10T17:00:00Z")); // Saturday: Friday jazz is over
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: "a", last: "2026-10-09" }]));
    history.replaceState(null, "", "/explore?saved=1");
    render(Explorer);
    expect(rows()).toEqual(["Friday jazz"]);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Already happened"]);
    const row = screen.getByRole("article");
    expect(within(row).getByText("Passed")).toBeInTheDocument();
    expect(row.querySelector(".when")).toHaveTextContent("Fri Oct 9 · 7:00 pm"); // no day heading carries it
    expect(screen.getByRole("button", { name: "Export saved to calendar" })).toBeDisabled();
  });

  it("brings saves' last days up to the dataset's on mount", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: "c" }, { id: "gone", last: "2026-10-01" }]));
    render(Explorer);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([{ id: "c", last: "2026-10-20" }, { id: "gone", last: "2026-10-01" }]);
  });

  it("moves to the visitor's new day when the tab comes back into view (#93)", async () => {
    vi.setSystemTime(new Date("2026-10-09T17:00:00Z")); // Friday
    history.replaceState(null, "", "/explore?when=today");
    render(Explorer);
    expect(rows()).toEqual(["Exhibition", "Friday jazz"]);
    vi.setSystemTime(new Date("2026-10-10T17:00:00Z")); // reopened Saturday
    document.dispatchEvent(new Event("visibilitychange"));
    flushSync();
    expect(rows()).toEqual(["Exhibition", "Saturday film"]);
  });

  it("compiles without a state_referenced_locally warning: the live region's seed is untracked on purpose", async () => {
    const { compile } = await import("svelte/compiler");
    const { default: source } = await import("../src/components/Explorer.svelte?raw");
    const { warnings } = compile(source, { filename: "Explorer.svelte" });
    expect(warnings.map((w) => w.code)).toEqual([]);
  }, 20_000); // loading the compiler takes seconds when the whole suite runs at once

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

  it("gives every row at most two Tab stops, its title and Save, with the venue still a link", () => {
    render(Explorer);
    for (const row of screen.getAllByRole("article")) {
      expect(tabStops(row).length).toBeLessThanOrEqual(2);
      expect(row.querySelector("a.venue")).toHaveAttribute("href");
    }
  });

  it("shows the count at once but announces it once, when typing settles", async () => {
    render(Explorer);
    const status = announced();
    expect(status).toHaveTextContent("3 events");
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
    expect(status).toHaveTextContent("3 events");
    expect(changes.takeRecords()).toHaveLength(0);
    vi.advanceTimersByTime(500);
    flushSync();
    expect(status).toHaveTextContent("1 event");
    expect(changes.takeRecords()).toHaveLength(1);
    changes.disconnect();
  });
  it("focuses search on / from outside a text field, without typing it; a modified / and / in a text field are left alone", () => {
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
    // A checkbox takes no text, so / from a filter still jumps.
    const checkbox = screen.getAllByRole("checkbox")[0]!;
    checkbox.focus();
    expect(prevented(checkbox, "/")).toBe(true);
    expect(search).toHaveFocus();
    expect(prevented(search, "/")).toBe(false);
    expect(prevented(document.body, "/", { isComposing: true })).toBe(false);
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
    expect(rows()).toEqual(["Exhibition", "Friday jazz", "Saturday film"]);
    expect(search).toHaveFocus();
    expect(prevented(search, "Escape", { isComposing: true })).toBe(false);
    expect(search).toHaveFocus();
    prevented(search, "Escape");
    expect(search).not.toHaveFocus();
  });
});
