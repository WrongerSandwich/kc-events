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
    event({ id: "b", title: "Closing run", kind: "art/exhibitions", dontMiss: true, whyLine: "Why B.", recurrence: "limited-run", start: "2026-09-01", end: "2026-10-11" }),
    event({ id: "e", title: "Wednesday show", dontMiss: true, start: "2026-10-07T20:00:00-05:00" }),
    event({ id: "c", title: "Later show", dontMiss: true, whyLine: "Why C.", start: "2026-10-17" }),
    event({ id: "f", title: "Art fair", kind: "art/exhibitions", dontMiss: true, start: "2026-10-19" }),
    event({ id: "d", title: "Plain show", dontMiss: false, start: "2026-10-06" }),
  ];
  // A getter, so one test can switch to no picks at all.
  return { get dontMiss() { return state.empty ? [] : picks; } };
});
vi.mock("../src/generated/meta", () => ({
  meta: { kinds: ["music"], regions: ["Central KC"], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));

import DontMissList from "../src/components/DontMissList.svelte";
import { inTimeZone } from "./fixtures/time-zone";

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

  it("renders every bucket with its heading, cards for this week and one-line rows after it, and the empty line", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") });
    render(DontMissList);
    await tick();
    const sections = screen.getAllByRole("region");
    expect(sections.map((s) => within(s).getByRole("heading", { level: 2 }).textContent)).toEqual(["This week, Oct 5–11", "Next two weeks, through Oct 19", "Later, after Oct 19"]);
    const first = within(sections[0]!).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(first).toEqual(["Closing run", "Tuesday show", "Wednesday show"]); // the run is on now, so it sorts as today
    expect(within(sections[0]!).getByText("Why A.")).toBeInTheDocument();
    // The tile is visual; the full date is in words for screen readers.
    expect(within(sections[0]!).getByText("On now, closes Sun Oct 11.")).toBeInTheDocument();
    expect(within(sections[0]!).getByRole("list", { name: "Picks by kind" })).toHaveTextContent("All 3 2 music1 art/exhibitions");
    // The next two weeks are the later list's one-line rows (#184): no cards, no kind chips.
    expect(within(sections[1]!).queryAllByRole("article")).toEqual([]);
    expect(within(sections[1]!).queryByRole("list", { name: "Picks by kind" })).toBeNull();
    expect(within(sections[1]!).getByRole("link", { name: "Later show, music" })).toHaveAttribute("href", "/e/c");
    expect(within(sections[1]!).getByText("Sat Oct 17")).toBeInTheDocument();
    expect(within(sections[2]!).getByText("Nothing picked further out yet.")).toBeInTheDocument();
    // One link to the explorer's picks on the page, under this week's (#184).
    expect(screen.getAllByRole("link", { name: /in the explorer/ }).map((a) => a.textContent)).toEqual(["This week's picks in the explorer"]);
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

  it("reads the clock again when the tab comes back: Today, then folded away as started, then the next day", async () => {
    // The visitor's machine is a zone away; the cards still go by Kansas City time.
    await inTimeZone("Asia/Tokyo", async () => {
      vi.useFakeTimers({ now: new Date("2026-10-07T00:30:00Z") }); // 7:30 pm Tuesday in Chicago, Wednesday in Tokyo
      render(DontMissList);
      await tick();
      const card = () => screen.queryByRole("heading", { name: "Tuesday show" })?.closest("article");
      expect(card()!.querySelector(".tile")).toHaveClass("today");
      expect(card()!.querySelector(".tile .top")).toHaveTextContent("Today");
      expect(within(card()!).getByText("Today, 8:00 pm.")).toBeInTheDocument();
      expect(document.querySelector("details.started")).toBeNull();

      vi.setSystemTime(new Date("2026-10-07T01:05:00Z")); // 8:05 pm: no timer notices
      await tick();
      expect(card()).toBeTruthy();
      document.dispatchEvent(new Event("visibilitychange"));
      await tick();
      // Started: no longer a card, but a row in the one-line fold at the section's end, after what is still to come.
      expect(card()).toBeFalsy();
      const fold = document.querySelector("details.started")!;
      expect(fold).not.toHaveAttribute("open");
      expect(fold.querySelector("summary")).toHaveTextContent("1 already started today");
      expect(within(fold as HTMLElement).getByRole("link", { name: "Tuesday show, music" })).toHaveAttribute("href", "/e/a");
      expect(within(fold as HTMLElement).getByText("8:00 pm")).toBeInTheDocument();
      const week = screen.getAllByRole("region")[0]!;
      expect(within(week).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Closing run", "Wednesday show"]);
      expect(week.lastElementChild?.previousElementSibling).toBe(fold); // the explorer link follows it

      vi.setSystemTime(new Date("2026-10-07T15:00:00Z")); // Wednesday morning: the show is gone
      document.dispatchEvent(new Event("visibilitychange"));
      await tick();
      expect(screen.queryByText("Tuesday show")).toBeNull();
    });
  });

  it("opens the fold when a link jumps to a started pick", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-07T01:05:00Z") }); // 8:05 pm Tuesday: the show has started
    render(DontMissList);
    await tick();
    const fold = document.querySelector("details.started") as HTMLDetailsElement;
    expect(fold.open).toBe(false);
    Element.prototype.scrollIntoView ??= () => {};
    location.hash = "#pick-a";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(fold.open).toBe(true);
    location.hash = "";
  });

  it("takes a malformed hash in its stride (#93)", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-07T01:05:00Z") });
    render(DontMissList);
    await tick();
    location.hash = "#%E0";
    expect(() => window.dispatchEvent(new HashChangeEvent("hashchange"))).not.toThrow();
    location.hash = "";
  });

  describe("a section's kind filter", () => {
    const titles = (section: HTMLElement) => within(section).queryAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    async function front() {
      vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") });
      render(DontMissList);
      await tick();
      return screen.getAllByRole("region");
    }

    it("narrows only its own section, switches kinds, and clears on a second press", async () => {
      const [week] = await front();
      const music = within(week!).getByRole("button", { name: "2 music" });
      const art = within(week!).getByRole("button", { name: "1 art/exhibitions" });
      expect(music).toHaveAttribute("aria-pressed", "false");

      music.click();
      await tick();
      expect(music).toHaveAttribute("aria-pressed", "true");
      expect(titles(week!)).toEqual(["Tuesday show", "Wednesday show"]);

      art.click();
      await tick();
      expect(music).toHaveAttribute("aria-pressed", "false");
      expect(art).toHaveAttribute("aria-pressed", "true");
      expect(titles(week!)).toEqual(["Closing run"]);

      art.click();
      await tick();
      expect(art).toHaveAttribute("aria-pressed", "false");
      expect(titles(week!)).toEqual(["Closing run", "Tuesday show", "Wednesday show"]);

      // All is pressed whenever no kind is, and lets go of one that is.
      const all = within(week!).getByRole("button", { name: "All 3" });
      expect(all).toHaveAttribute("aria-pressed", "true");
      music.click();
      await tick();
      expect(all).toHaveAttribute("aria-pressed", "false");
      all.click();
      await tick();
      expect(all).toHaveAttribute("aria-pressed", "true");
      expect(music).toHaveAttribute("aria-pressed", "false");
      expect(titles(week!)).toEqual(["Closing run", "Tuesday show", "Wednesday show"]);
    });

    it("moves the cards by a view transition where the browser has one, and filters the same where it has none", async () => {
      // What a card's style was when the browser would capture it, before the update runs.
      let captured: string | null | undefined;
      const start = vi.fn((update: () => Promise<void>) => {
        captured = document.querySelector("section .pick")!.getAttribute("style");
        const done = update();
        return { finished: done, updateCallbackDone: done, ready: done, skipTransition() {} };
      });
      Object.defineProperty(document, "startViewTransition", { value: start, configurable: true });
      try {
        const [week] = await front();
        within(week!).getByRole("button", { name: "2 music" }).click();
        await tick();
        expect(start).toHaveBeenCalledTimes(1);
        expect(titles(week!)).toEqual(["Tuesday show", "Wednesday show"]);
        // Each card carries its own name while the filter moves it, so the transition slides the kept ones into place;
        // afterwards the names are gone, so a navigation to an event page carries only its tile and title.
        expect(captured).toContain("view-transition-name: pick-b");
        await tick();
        await tick();
        expect(week!.querySelector(".pick")!.getAttribute("style") ?? "").not.toContain("view-transition-name");
      } finally {
        delete (document as { startViewTransition?: unknown }).startViewTransition;
      }
    });

    it("is this week's alone, and leaves the rows after it whole", async () => {
      const [week, next] = await front();
      expect(within(next!).queryAllByRole("button")).toEqual([]);
      within(week!).getByRole("button", { name: "1 art/exhibitions" }).click();
      await tick();
      expect(titles(week!)).toEqual(["Closing run"]);
      expect(within(next!).getAllByRole("link").map((a) => a.textContent)).toEqual(["Later show, music", "Art fair, art and exhibitions"]);
    });

    it("carries the kind on the section's explorer link exactly while one is on", async () => {
      const [week] = await front();
      const link = () => within(week!).getByRole("link", { name: /in the explorer/ });
      expect(link()).toHaveAttribute("href", "/explore?when=weekend&picks=1");
      within(week!).getByRole("button", { name: "2 music" }).click();
      await tick();
      expect(link()).toHaveAttribute("href", "/explore?when=weekend&kind=music&picks=1");
      within(week!).getByRole("button", { name: "2 music" }).click();
      await tick();
      expect(link()).toHaveAttribute("href", "/explore?when=weekend&picks=1");
    });

    it("announces what the section now shows", async () => {
      const [week] = await front();
      const status = within(week!).getByRole("status");
      expect(status).toHaveTextContent("");
      within(week!).getByRole("button", { name: "2 music" }).click();
      await tick();
      expect(status).toHaveTextContent("Showing 2 music picks");
      within(week!).getByRole("button", { name: "1 art/exhibitions" }).click();
      await tick();
      expect(status).toHaveTextContent("Showing 1 art and exhibitions pick");
      within(week!).getByRole("button", { name: "1 art/exhibitions" }).click();
      await tick();
      expect(status).toHaveTextContent("Showing all 3 picks");
    });

    it("renders the counts as links to the explorer before hydration", () => {
      vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") });
      const target = document.body.appendChild(document.createElement("div"));
      const component = mount(DontMissList, { target }); // no flush: the server's render
      try {
        const chips = target.querySelector("section .kinds")!;
        expect(chips.querySelectorAll("button")).toHaveLength(0);
        expect([...chips.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([
          "/explore?when=weekend&picks=1",
          "/explore?when=weekend&kind=music&picks=1",
          "/explore?when=weekend&kind=art-exhibitions&picks=1",
        ]);
        flushSync();
        expect(chips.querySelectorAll("a")).toHaveLength(0);
        expect(chips.querySelectorAll("button[aria-pressed]")).toHaveLength(3);
      } finally {
        unmount(component);
        target.remove();
      }
    });
  });

  it("drops a section's filter, and its announcement, once a new day takes that kind's picks away", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") });
    render(DontMissList);
    await tick();
    const week = () => screen.getAllByRole("region")[0]!;
    within(week()).getByRole("button", { name: "1 art/exhibitions" }).click();
    await tick();
    vi.setSystemTime(new Date("2026-10-12T17:00:00Z")); // the run has closed: no art this week
    document.dispatchEvent(new Event("visibilitychange"));
    await tick();
    expect(within(week()).getByRole("status")).toHaveTextContent("");
    vi.setSystemTime(new Date("2026-10-19T17:00:00Z")); // the art fair's week: art is back, the filter is not
    document.dispatchEvent(new Event("visibilitychange"));
    await tick();
    expect(within(week()).getByRole("button", { name: "1 art/exhibitions" })).toHaveAttribute("aria-pressed", "false");
    expect(within(week()).getByRole("link", { name: "This week's picks in the explorer" })).not.toHaveAttribute("href", expect.stringContaining("kind="));
  });

  it("never calls a day empty while a run is open, and follows the kind filter", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") }); // Monday; the closing run is open all week
    render(DontMissList);
    await tick();
    const strip = screen.getByRole("navigation", { name: "This week by day" });
    const days = () => [...strip.querySelectorAll(".day")].map((d) => d.getAttribute("aria-label"));
    expect(days()).toEqual([
      "Mon 5, today: no new picks, 1 run still on", "Tue 6: 1 pick, 1 run still on", "Wed 7: 1 pick, 1 run still on", "Thu 8: no new picks, 1 run still on",
      "Fri 9: no new picks, 1 run still on", "Sat 10: no new picks, 1 run still on", "Sun 11: 1 pick, 1 run still on",
    ]);
    // Today is the inked day, named by its weekday: the card's tile is where "Today" is said (#184).
    expect(strip.querySelector(".day.today .name")).toHaveTextContent("Mon");
    expect(strip).not.toHaveTextContent("Today");
    // A day with only the run open jumps to the run's card, and draws its band.
    expect(within(strip).getByRole("link", { name: "Mon 5, today: no new picks, 1 run still on" })).toHaveAttribute("href", "#pick-b");
    expect(strip.querySelectorAll(".day:first-child .lane.open")).toHaveLength(1);
    within(screen.getAllByRole("region")[0]!).getByRole("button", { name: "2 music" }).click();
    await tick();
    expect(days()[0]).toBe("Mon 5, today: no picks");
    expect(days()[1]).toBe("Tue 6: 1 pick");
  });

  it("says so and points at the explorer when nothing is picked", async () => {
    state.empty = true;
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") });
    render(DontMissList);
    await tick();
    expect(screen.getByText(/Nothing picked right now/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse everything" })).toHaveAttribute("href", "/explore?when=all");
    expect(screen.queryAllByRole("region")).toEqual([]);
  });
});
