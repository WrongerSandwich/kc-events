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

describe("DontMissCard's place (#186)", () => {
  it("names the venue and neighborhood, the neighborhood dropped when it is the catch-all", () => {
    render(DontMissCard, { event: event({ dontMiss: true }), today: "2026-10-05" });
    expect(screen.getByText("recordBar, Crossroads")).toBeTruthy();
    render(DontMissCard, { event: event({ id: "evt_000000000002", dontMiss: true, venue: "Powell Gardens", neighborhood: "Elsewhere in the metro", region: "Elsewhere in the metro" }), today: "2026-10-05" });
    expect(screen.getByText("Powell Gardens")).toBeTruthy();
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
    expect(screen.getByRole("link", { name: "Music" })).toHaveAttribute("href", "/k/music");
  });
});

// The pick tag, the reason in the carmine pill, leads the card's why-line; a screen reader hears what the word is (#273).
describe("DontMissCard's pick tag (#273)", () => {
  it("leads the why-line with the reason in the tag, said as a pick to a screen reader", () => {
    const { container } = render(DontMissCard, { event: event({ dontMiss: true, pickReason: "tradition", whyLine: "Once a year." }), today: "2026-10-05" });
    const tag = container.querySelector(".why .dont-miss")!;
    expect(tag).toHaveTextContent(/^Pick: Tradition$/);
    expect(tag.querySelector(".visually-hidden")).toHaveTextContent("Pick:");
    expect(container.querySelector(".why")).toHaveTextContent(/Tradition Once a year\.$/);
  });

  it("says Pick alone on a pick with no reason, which the schema no longer allows", () => {
    const { container } = render(DontMissCard, { event: event({ dontMiss: true, whyLine: "Once a year." }), today: "2026-10-05" });
    expect(container.querySelector(".why .dont-miss")).toHaveTextContent(/^Pick$/);
  });
});
