import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadText } from "../src/lib/download";
import { STORAGE_KEY } from "../src/lib/saves";

// vitest hoists vi.mock above every import and declaration, so the factory builds its own fixture.
vi.mock("../src/generated/events", async () => {
  const { event } = await import("./fixtures/event");
  return {
    events: [
      event({ id: "evt_jazz", title: "Friday jazz", start: "2026-10-09T19:00:00-05:00", venue: "recordBar" }),
      event({ id: "evt_talk", title: "Tuesday talk", start: "2026-10-06T18:00:00-05:00", venue: "Library" }),
      event({ id: "evt_film", title: "Saturday film", start: "2026-10-10T20:00:00-05:00", venue: "Screenland", kind: "film" }),
      event({ id: "evt_gone", title: "Last week's show", start: "2026-10-01T19:00:00-05:00" }),
      event({ id: "evt_trivia", title: "Trivia", recurrence: "recurring", start: undefined, schedule: "Tuesdays" }),
    ],
  };
});
vi.mock("../src/generated/meta", () => ({
  meta: { kinds: ["music", "film"], regions: ["Central KC"], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));
vi.mock("../src/lib/download", () => ({ downloadText: vi.fn() }));
import Explorer from "../src/components/Explorer.svelte";

const titles = () => screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent?.trim());

describe("a shortlist link (#132)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") });
    localStorage.removeItem(STORAGE_KEY);
  });
  afterEach(() => vi.useRealTimers());

  it("shows exactly its events, in its order, under Shortlist · N events, dropping unknown and passed ids", async () => {
    history.replaceState(null, "", "/explore?ids=evt_film,evt_nope,evt_trivia,evt_gone,evt_talk");
    render(Explorer);
    await tick();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Shortlist · 3 events");
    expect(titles()).toEqual(["Saturday film", "Trivia", "Tuesday talk"]);
    // The pill counts what the link names that is still to come.
    expect(screen.getByRole("button", { name: "Remove Shortlist (3)" })).toBeInTheDocument();
  });

  it("says so when none of its events is left, rather than passing everything off as the shortlist", async () => {
    history.replaceState(null, "", "/explore?ids=evt_gone,evt_nope");
    render(Explorer);
    await tick();
    expect(screen.getByText("None of this shortlist's events are still to come. Showing everything instead.")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "film" }));
    expect(screen.queryByText(/None of this shortlist's events/)).toBeNull();
  });

  it("narrows by the other filters, and its pill clears only the shortlist", async () => {
    history.replaceState(null, "", "/explore?ids=evt_film,evt_jazz,evt_talk&kind=music");
    render(Explorer);
    await tick();
    expect(titles()).toEqual(["Friday jazz", "Tuesday talk"]);
    await fireEvent.click(screen.getByRole("button", { name: "Remove Shortlist (3)" }));
    expect(location.search).toBe("?when=all&kind=music");
    expect(screen.queryByText(/Shortlist/)).toBeNull();
  });
});

describe("the saved view's Share saved and Export saved (#132)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") });
    vi.mocked(downloadText).mockClear();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: "evt_jazz" }, { id: "evt_gone" }, { id: "evt_trivia" }, { id: "evt_talk" }]));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.removeItem(STORAGE_KEY);
  });

  it("are offered only in the saved view", async () => {
    history.replaceState(null, "", "/explore");
    render(Explorer);
    await tick();
    expect(screen.queryByRole("button", { name: "Share saved" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export saved" })).toBeNull();
    expect(screen.getByRole("button", { name: "Export this view" })).toBeInTheDocument();
  });

  it("Share saved copies a shortlist link of the saves still to come, in date order", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, share: undefined, clipboard: { writeText } });
    history.replaceState(null, "", "/explore?saved=1");
    render(Explorer);
    await tick();
    await fireEvent.click(screen.getByRole("button", { name: "Share saved" }));
    for (let i = 0; i < 5; i++) await tick();
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/explore?ids=evt_talk,evt_jazz,evt_trivia`);
    expect(screen.getByText("Link copied")).toBeInTheDocument();
  });

  it("Export saved downloads the saves still to come as a calendar named for them", async () => {
    history.replaceState(null, "", "/explore?saved=1&kind=film"); // the view's own filters do not narrow what is saved
    render(Explorer);
    await tick();
    await fireEvent.click(screen.getByRole("button", { name: "Export saved" }));
    const [name, text, mime] = vi.mocked(downloadText).mock.calls[0]!;
    expect(name).toBe("kc-this-week-saved.ics");
    expect(mime).toBe("text/calendar");
    expect(text).toContain("X-WR-CALNAME:KC This Week · saved\r\n");
    expect(text).toContain("SUMMARY:Friday jazz");
    expect(text).toContain("SUMMARY:Tuesday talk");
    expect(text).not.toContain("Last week's show");
    expect(text).not.toContain("Trivia");
  });

  it("are disabled when no save is still to come", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: "evt_gone" }]));
    history.replaceState(null, "", "/explore?saved=1");
    render(Explorer);
    await tick();
    expect(screen.getByRole("button", { name: "Share saved" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export saved" })).toBeDisabled();
  });
});
