import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/generated/meta", () => ({
  meta: { kinds: ["music"], regions: ["Central KC"], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));

import LandingEvents from "../src/components/LandingEvents.svelte";
import ResultRow from "../src/components/ResultRow.svelte";
import { event } from "./fixtures/event";

// A row's links and Save carry names that differ per row, so a screen reader's list of links does not read
// "screenland.com" forty times (audit 2026-10-21, A6).
describe("ResultRow's names (#181)", () => {
  const show = event({ title: "The Wizard of Oz", venue: "Screenland Armour", primaryUrl: "https://www.screenland.com/armour", kind: "film" });

  it("names the venue as the title's venue", () => {
    render(ResultRow, { event: show, today: "2026-10-05" });
    expect(screen.getByRole("link", { name: "Screenland Armour, venue of The Wizard of Oz" })).toHaveAttribute("href", "/v/screenland-armour");
  });

  it("names Save with the event's day, so the same title on two dates reads as two", async () => {
    render(ResultRow, { event: show, today: "2026-10-05" });
    render(ResultRow, { event: { ...show, id: "evt_000000000002", start: "2026-10-10T19:00:00-05:00" }, today: "2026-10-05" });
    await tick();
    expect(screen.getByRole("button", { name: "Save The Wizard of Oz, Fri Oct 9" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save The Wizard of Oz, Sat Oct 10" })).toBeInTheDocument();
  });

  it("names Save with the title alone for an always-there event, which has no day", async () => {
    render(ResultRow, { event: event({ title: "Weekly trivia", recurrence: "recurring", start: undefined, schedule: "Every Tuesday" }), today: "2026-10-05" });
    await tick();
    expect(screen.getByRole("button", { name: "Save Weekly trivia" })).toBeInTheDocument();
  });

  it("makes the kind chip the link it looks like, to the kind's page, out of the Tab order", () => {
    render(ResultRow, { event: show, today: "2026-10-05" });
    const chip = screen.getByRole("link", { name: "film" });
    expect(chip).toHaveAttribute("href", "/k/film");
    expect(chip).toHaveAttribute("tabindex", "-1");
  });
});

// The scarce width goes to what differs between rows (audit 2026-10-21, B5, A7).
describe("ResultRow's width (#182)", () => {
  it("leaves the host to the event page", () => {
    const { container } = render(ResultRow, { event: event(), today: "2026-10-05" });
    expect(container.querySelector('a[href="https://www.therecordbar.com/shows"]')).toBeNull();
  });

  it("gives the title link the full title, for a title cut at two lines", () => {
    render(ResultRow, { event: event({ title: "Body Forth: incarnation, embodiment, and the Christian imagination" }), today: "2026-10-05" });
    expect(screen.getByRole("link", { name: "Body Forth: incarnation, embodiment, and the Christian imagination" })).toHaveAttribute(
      "title",
      "Body Forth: incarnation, embodiment, and the Christian imagination",
    );
  });

  it("leaves out the verified stamp when the last run checked the event, as the header already says", () => {
    const { container } = render(ResultRow, { event: event({ lastVerified: "2026-10-05T06:40:00-05:00" }), today: "2026-10-05" });
    expect(container.querySelector(".verified")).toBeNull();
  });

  it("shows the stamp, with what it means, when the check is older than the last run", () => {
    const { container } = render(ResultRow, { event: event({ lastVerified: "2026-10-03T21:47:36-05:00" }), today: "2026-10-05" });
    const stamp = container.querySelector(".verified")!;
    expect(stamp).toHaveAttribute("title", "Date and venue verified Oct 3");
    expect(stamp).toHaveTextContent("Date and venue verified Oct 3");
  });

  it("names a place once when the neighborhood is the venue's own name (#186)", () => {
    const { container } = render(ResultRow, { event: event({ venue: "Crown Center", neighborhood: "Crown Center" }), today: "2026-10-05" });
    const where = container.querySelector(".where")!;
    expect(where).toHaveTextContent(/^Crown Center$/);
    expect(where).toHaveAttribute("title", "Crown Center");
  });

  it("says schedule, not date, for a recurring event (#186)", () => {
    const recurring = event({ recurrence: "recurring", start: undefined, schedule: "Tuesdays", lastVerified: "2026-10-03T21:47:36-05:00" });
    const { container } = render(ResultRow, { event: recurring, today: "2026-10-05" });
    expect(container.querySelector(".verified")).toHaveAttribute("title", "Schedule and venue verified Oct 3");
  });

  it("hides the kind chip on the kind's own page", () => {
    render(ResultRow, { event: event({ kind: "film" }), today: "2026-10-05", hide: "kind" });
    expect(screen.queryByRole("link", { name: "film" })).toBeNull();
    expect(screen.getByRole("link", { name: "recordBar, venue of A show" })).toBeInTheDocument();
  });

  it("hides the venue and its neighborhood on the venue's own page, keeping the room", () => {
    const { container } = render(ResultRow, { event: event({ room: "Back room" }), today: "2026-10-05", hide: "venue" });
    expect(container.querySelector("a.venue")).toBeNull();
    expect(container.querySelector(".where")).toHaveTextContent(/^Back room$/);
    expect(screen.getByRole("link", { name: "music" })).toBeInTheDocument();
  });
});

describe("LandingEvents (#182)", () => {
  const groups = [{ key: "2026-10-09", heading: "Fri Oct 9", events: [event()], collapsed: false }];

  it("passes a kind page's hide on to its rows", () => {
    render(LandingEvents, { groups, hide: "kind" });
    expect(screen.queryByRole("link", { name: "music" })).toBeNull();
  });

  it("keeps the chip on a region page", () => {
    render(LandingEvents, { groups });
    expect(screen.getByRole("link", { name: "music" })).toBeInTheDocument();
  });
});
