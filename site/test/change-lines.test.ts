import { describe, expect, it } from "vitest";
import { byKind, emptyLine, goneReason, wasLine } from "../src/lib/changes";
import { event } from "./fixtures/event";

describe("the changes page's lines (#135)", () => {
  it("a moved event says the date it had, with its time when it had one", () => {
    expect(wasLine("2026-10-14T17:30:00-05:00")).toBe("Was Wed Oct 14 · 5:30 pm");
    expect(wasLine("2026-10-14")).toBe("Was Wed Oct 14");
  });

  it("a gone event says why in the page's words", () => {
    expect(goneReason("cancelled")).toBe("Cancelled");
    expect(goneReason("two-strike")).toBe("No longer listed by the venue");
  });

  it("an empty section says None, and a group the run's report did not record says so", () => {
    expect(emptyLine([])).toBe("None.");
    expect(emptyLine(undefined)).toBe("Not recorded for this run.");
    expect(emptyLine([event()])).toBeUndefined();
  });

  it("groups by kind in the config's order, leaving out kinds with none", () => {
    const a = event({ id: "evt_a", kind: "comedy" });
    const b = event({ id: "evt_b", kind: "music" });
    const c = event({ id: "evt_c", kind: "comedy" });
    expect(byKind([a, b, c], ["music", "theater", "comedy"])).toEqual([
      { kind: "music", events: [b] },
      { kind: "comedy", events: [a, c] },
    ]);
  });
});
