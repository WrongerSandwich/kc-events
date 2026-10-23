import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/generated/meta", () => ({
  meta: { kinds: ["music"], regions: ["Central KC"], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));

import ResultRow from "../src/components/ResultRow.svelte";
import { event } from "./fixtures/event";

// A row's links and Save carry names that differ per row, so a screen reader's list of links does not read
// "screenland.com" forty times (audit 2026-10-21, A6).
describe("ResultRow's names (#181)", () => {
  const show = event({ title: "The Wizard of Oz", venue: "Screenland Armour", primaryUrl: "https://www.screenland.com/armour", kind: "film" });

  it("names the host as the title's source and the venue as the title's venue", () => {
    render(ResultRow, { event: show, today: "2026-10-05" });
    expect(screen.getByRole("link", { name: "screenland.com, source for The Wizard of Oz" })).toHaveAttribute("href", "https://www.screenland.com/armour");
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
