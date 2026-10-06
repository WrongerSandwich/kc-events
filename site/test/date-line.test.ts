import { describe, expect, it } from "vitest";
import { longDateLine } from "../src/lib/date-line";
import { event } from "./fixtures/event";

const today = "2026-10-05";

describe("longDateLine", () => {
  it("writes the event page's date line in full", () => {
    expect(longDateLine(event(), today)).toBe("Friday, October 9, 7:00 pm");
    expect(longDateLine(event({ start: "2026-10-09" }), today)).toBe("Friday, October 9");
    expect(longDateLine(event({ recurrence: "limited-run", start: "2026-09-20", end: "2026-11-14" }), today)).toBe("Through Saturday, November 14");
    expect(longDateLine(event({ recurrence: "limited-run", start: undefined, end: "2026-10-31" }), today)).toBe("Through Saturday, October 31");
    expect(longDateLine(event({ recurrence: "limited-run", start: "2026-10-20", end: "2026-11-14" }), today)).toBe("Tuesday, October 20 through Saturday, November 14");
    expect(longDateLine(event({ start: "2026-10-09", end: "2026-10-11" }), today)).toBe("Friday, October 9 through Sunday, October 11");
    expect(longDateLine(event({ recurrence: "recurring", start: undefined, schedule: "Every Tuesday, 7pm" }), today)).toBe("Every Tuesday, 7pm");
  });

  it("still renders a start-less run read after its end, without throwing", () => {
    const over = event({ recurrence: "limited-run", start: undefined, end: "2026-10-31" });
    expect(longDateLine(over, "2026-11-15")).toBe("Through Saturday, October 31");
    const overWithStart = event({ recurrence: "limited-run", start: "2026-09-20", end: "2026-10-31" });
    expect(longDateLine(overWithStart, "2026-11-15")).toBe("Sunday, September 20 through Saturday, October 31");
  });
});
