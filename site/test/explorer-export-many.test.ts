import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadText } from "../src/lib/download";

// More events than one tap should put in a calendar without asking (#186): iOS adds a whole file at once.
vi.mock("../src/generated/events", async () => {
  const { event } = await import("./fixtures/event");
  return {
    events: Array.from({ length: 51 }, (_, i) =>
      event({ id: `e${i}`, title: `Show ${i}`, start: `2026-10-${String(6 + (i % 20)).padStart(2, "0")}T19:00:00-05:00` })),
  };
});
vi.mock("../src/generated/meta", () => ({
  meta: { kinds: ["music"], regions: ["Central KC"], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));
vi.mock("../src/lib/download", () => ({ downloadText: vi.fn() }));
import Explorer from "../src/components/Explorer.svelte";

describe("exporting more than 50 events", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") });
    history.replaceState(null, "", "/explore?when=all");
    vi.mocked(downloadText).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("asks first, naming the count, and exports nothing when declined", async () => {
    const ask = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(Explorer);
    await fireEvent.click(screen.getByRole("button", { name: "Export 51 to calendar" }));
    expect(ask).toHaveBeenCalledWith(expect.stringContaining("51 events"));
    expect(downloadText).not.toHaveBeenCalled();
  });

  it("exports them all once confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(Explorer);
    await fireEvent.click(screen.getByRole("button", { name: "Export 51 to calendar" }));
    expect(downloadText).toHaveBeenCalledTimes(1);
    expect(vi.mocked(downloadText).mock.calls[0]![1].match(/BEGIN:VEVENT/g)).toHaveLength(51);
  });

  it("does not ask for 50 or fewer", async () => {
    const ask = vi.spyOn(window, "confirm");
    history.replaceState(null, "", "/explore?when=all&q=Show 1");
    render(Explorer);
    await fireEvent.click(screen.getByRole("button", { name: /^Export \d+ to calendar$/ }));
    expect(ask).not.toHaveBeenCalled();
    expect(downloadText).toHaveBeenCalledTimes(1);
  });
});
