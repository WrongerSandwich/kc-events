import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/generated/meta", () => ({
  meta: { kinds: ["music"], regions: ["Central KC"], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));

import DontMissCard from "../src/components/DontMissCard.svelte";
import { event } from "./fixtures/event";

describe("DontMissCard's price and age limit (#133)", () => {
  it("shows them as one plain fact when the own page gave them", () => {
    render(DontMissCard, { event: event({ dontMiss: true, price: "Free", ages: "All ages" }), today: "2026-10-05" });
    expect(screen.getByText("Free · All ages")).toBeTruthy();
  });

  it("shows nothing for them when it gave neither", () => {
    const { container } = render(DontMissCard, { event: event({ dontMiss: true }), today: "2026-10-05" });
    expect(container.querySelector(".admission")).toBeNull();
  });
});

describe("DontMissCard's actions (#181)", () => {
  it("labels Add to calendar in words at every width, its name starting with them", () => {
    render(DontMissCard, { event: event({ dontMiss: true }), today: "2026-10-05" });
    const link = screen.getByRole("link", { name: "Add to calendar: A show" });
    expect(link).toHaveAttribute("href", "/e/evt_000000000001.ics");
    expect(link).toHaveTextContent(/^Add to calendar$/);
  });

  it("names Save with the event's day", async () => {
    render(DontMissCard, { event: event({ dontMiss: true }), today: "2026-10-05" });
    await tick();
    expect(screen.getByRole("button", { name: "Save A show, Fri Oct 9" })).toBeInTheDocument();
  });

  it("makes the kind chip a link to the kind's page", () => {
    render(DontMissCard, { event: event({ dontMiss: true }), today: "2026-10-05" });
    expect(screen.getByRole("link", { name: "music" })).toHaveAttribute("href", "/k/music");
  });
});
