import { render, screen } from "@testing-library/svelte";
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
