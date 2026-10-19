import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/generated/meta", () => ({
  meta: { kinds: ["music"], regions: ["Central KC"], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));

import ResultRow from "../src/components/ResultRow.svelte";
import VenueEvents from "../src/components/VenueEvents.svelte";
import { event } from "./fixtures/event";

describe("VenueEvents (#137)", () => {
  it("groups a venue's events as the explorer does: on now open, then by day, then always there", () => {
    const { container } = render(VenueEvents, { props: {
      events: [
        event({ id: "evt_a", title: "Saturday show", start: "2026-10-10T20:00:00-05:00" }),
        event({ id: "evt_b", title: "Friday show", start: "2026-10-09T19:00:00-05:00" }),
        event({ id: "evt_c", title: "An exhibition", recurrence: "limited-run", start: "2026-09-01", end: "2026-11-01" }),
        event({ id: "evt_d", title: "Weekly trivia", recurrence: "recurring", start: undefined, schedule: "Every Tuesday" }),
      ],
    } });
    expect([...container.querySelectorAll("h2")].map((h) => h.textContent)).toEqual(["On now", "Fri Oct 9", "Sat Oct 10", "Always there"]);
    expect([...container.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["An exhibition", "Friday show", "Saturday show", "Weekly trivia"]);
    expect(container.querySelector("details")).toBeNull();
  });

  it("shows the room each event was in", () => {
    const { container } = render(VenueEvents, { props: { events: [event({ venue: "Kauffman Center for the Performing Arts", room: "Helzberg Hall" })] } });
    expect(container.querySelector(".venue")!.textContent).toBe("Kauffman Center for the Performing Arts · Helzberg Hall");
  });

  it("says so when the venue has nothing coming up", () => {
    render(VenueEvents, { props: { events: [] } });
    expect(screen.getByText("Nothing listed at the moment.")).toBeTruthy();
  });
});

describe("ResultRow's venue (#137)", () => {
  it("links the venue's page, out of the Tab order", () => {
    const { container } = render(ResultRow, { event: event({ venue: "The Truman", room: "Back room" }), today: "2026-10-05" });
    const link = container.querySelector("a.venue")!;
    expect(link.getAttribute("href")).toBe("/v/truman");
    expect(link.getAttribute("tabindex")).toBe("-1");
    expect(link.textContent).toBe("The Truman · Back room");
  });
});
