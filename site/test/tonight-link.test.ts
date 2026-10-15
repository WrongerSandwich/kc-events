import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

// Literals only inside a vi.mock factory: vitest hoists the call above every import and declaration.
vi.mock("../src/generated/meta", () => ({
  meta: { kinds: [], regions: [], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));
// Monday: a 10 am storytime, a 7 pm show, and an untimed opening; Tuesday a 7 pm show; Wednesday none.
vi.mock("../src/generated/tonight", () => ({ tonight: { from: "2026-10-05", starts: [[600, 1140, 1440], [1140], []] } }));
import TonightLink from "../src/components/TonightLink.svelte";

describe("TonightLink", () => {
  afterEach(() => vi.useRealTimers());

  it("counts what is still to start on the visitor's day, not the build's", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-06T17:00:00Z") }); // Tuesday noon in Kansas City
    render(TonightLink);
    await tick();
    expect(screen.getByRole("link")).toHaveTextContent("Tonight: 1 event");
    expect(screen.getByRole("link")).toHaveAttribute("href", "/explore?when=today");
  });

  it("leaves out what has begun", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-05T17:00:00Z") }); // Monday noon: the storytime is over
    render(TonightLink);
    await tick();
    expect(screen.getByRole("link")).toHaveTextContent("Tonight: 2 events");
  });

  it("turns to tomorrow at 10 pm in Kansas City", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-06T03:30:00Z") }); // Monday 10:30 pm in Kansas City
    render(TonightLink);
    await tick();
    expect(screen.getByRole("link")).toHaveTextContent("Tomorrow: 1 event");
    expect(screen.getByRole("link")).toHaveAttribute("href", "/explore?when=tomorrow");
  });

  it("catches up when a tab left open comes back later", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-05T14:00:00Z") }); // Monday 9 am
    render(TonightLink);
    await tick();
    expect(screen.getByRole("link")).toHaveTextContent("Tonight: 3 events");
    vi.setSystemTime(new Date("2026-10-07T17:00:00Z"));
    document.dispatchEvent(new Event("visibilitychange"));
    await tick();
    expect(screen.getByRole("link")).toHaveTextContent("Nothing listed tonight");
  });

  it("is absent on a day past the table", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-09T17:00:00Z") });
    render(TonightLink);
    await tick();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
