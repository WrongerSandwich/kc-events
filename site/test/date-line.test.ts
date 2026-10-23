import { describe, expect, it } from "vitest";
import { longDateLine } from "../src/lib/date-line";
import { event } from "./fixtures/event";

const today = "2026-10-05";

describe("longDateLine", () => {
  it("writes the event page's date line in full", () => {
    expect(longDateLine(event(), today)).toBe("Friday, October 9, 7:00 pm");
    expect(longDateLine(event({ start: "2026-10-09" }), today)).toBe("Friday, October 9");
    expect(longDateLine(event({ recurrence: "limited-run", start: "2026-09-20", end: "2026-11-14" }), today)).toBe("Closes Saturday, November 14");
    expect(longDateLine(event({ recurrence: "limited-run", start: undefined, end: "2026-10-31" }), today)).toBe("Closes Saturday, October 31");
    expect(longDateLine(event({ recurrence: "limited-run", start: "2026-10-20", end: "2026-11-14" }), today)).toBe("Opens Tuesday, October 20, closes Saturday, November 14");
    expect(longDateLine(event({ start: "2026-10-09", end: "2026-10-11" }), today)).toBe("Friday, October 9 through Sunday, October 11");
    // A multi-day one-off keeps its first day and time while underway (#90); "through" is for one-offs, "closes" for runs.
    expect(longDateLine(event({ start: "2026-10-09", end: "2026-10-11" }), "2026-10-10")).toBe("Friday, October 9 through Sunday, October 11");
    expect(longDateLine(event({ start: "2026-10-09T20:30:00-05:00", end: "2026-10-10" }), "2026-10-10")).toBe("Friday, October 9, 8:30 pm through Saturday, October 10");
    expect(longDateLine(event({ recurrence: "recurring", start: undefined, schedule: "Every Tuesday, 7pm" }), today)).toBe("Every Tuesday, 7pm");
  });

  it("still renders a start-less run read after its end, without throwing", () => {
    const over = event({ recurrence: "limited-run", start: undefined, end: "2026-10-31" });
    expect(longDateLine(over, "2026-11-15")).toBe("Closed Saturday, October 31");
    const overWithStart = event({ recurrence: "limited-run", start: "2026-09-20", end: "2026-10-31" });
    expect(longDateLine(overWithStart, "2026-11-15")).toBe("Closed Saturday, October 31");
  });
});
