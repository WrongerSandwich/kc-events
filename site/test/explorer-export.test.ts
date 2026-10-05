import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadText } from "../src/lib/download";

// vitest hoists vi.mock above every import and declaration, so the factory builds its own fixture.
vi.mock("../src/generated/events", async () => {
  const { event } = await import("./fixtures/event");
  return {
    events: [
      event({ id: "a", title: "Friday jazz", start: "2026-10-09T19:00:00-05:00" }),
      event({ id: "r", title: "Trivia", recurrence: "recurring", start: undefined, schedule: "Tuesdays" }),
    ],
  };
});
vi.mock("../src/generated/meta", () => ({
  meta: { kinds: ["music"], regions: ["Central KC"], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));
vi.mock("../src/lib/download", () => ({ downloadText: vi.fn() }));
import Explorer from "../src/components/Explorer.svelte";

describe("export this view", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") });
    history.replaceState(null, "", "/explore");
    vi.mocked(downloadText).mockClear();
  });

  it("downloads the current results as a calendar", async () => {
    history.replaceState(null, "", "/explore?recurring=1"); // the recurring event is in the view but has no date to export
    render(Explorer);
    await fireEvent.click(screen.getByRole("button", { name: "Export this view" }));
    expect(downloadText).toHaveBeenCalledTimes(1);
    const [name, text, mime] = vi.mocked(downloadText).mock.calls[0]!;
    expect(name).toBe("kc-events.ics");
    expect(mime).toBe("text/calendar");
    expect(text).toContain("SUMMARY:Friday jazz");
    expect(text).not.toContain("Trivia");
  });

  it("is disabled with nothing to export", () => {
    history.replaceState(null, "", "/explore?q=zzz");
    render(Explorer);
    expect(screen.getByRole("button", { name: "Export this view" })).toBeDisabled();
  });
});

describe("downloadText", () => {
  it("creates an object URL, clicks an anchor, and revokes", async () => {
    const { downloadText: real } = await vi.importActual<typeof import("../src/lib/download")>("../src/lib/download");
    const a = { href: "", download: "", click: vi.fn() };
    const deps = { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn(), createAnchor: () => a as unknown as HTMLAnchorElement, makeBlob: (parts: string[], type: string) => ({ parts, type }) as unknown as Blob };
    real("f.ics", "BEGIN:VCALENDAR", "text/calendar", deps);
    expect(a.download).toBe("f.ics");
    expect(a.href).toBe("blob:x");
    expect(a.click).toHaveBeenCalled();
    expect(deps.revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });
});
