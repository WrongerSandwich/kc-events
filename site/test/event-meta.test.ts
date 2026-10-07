import { describe, expect, it } from "vitest";
import { eventDescription, eventJsonLd } from "../src/lib/event-meta";
import { event } from "./fixtures/event";

const today = "2026-10-05";

describe("eventDescription", () => {
  it("is the date line, the venue and neighborhood, and the why-line", () => {
    expect(eventDescription(event({ whyLine: "Rare." }), today)).toBe("Friday, October 9, 7:00 pm at recordBar, Crossroads. Rare.");
  });

  it("leaves the date out for a recurring event with no schedule", () => {
    const e = event({ recurrence: "recurring", start: undefined, schedule: undefined });
    expect(eventDescription(e, today)).toBe("At recordBar, Crossroads.");
  });
});

describe("eventJsonLd", () => {
  it("names a one-off's start and end", () => {
    const ld = eventJsonLd(event({ end: "2026-10-09T22:00:00-05:00" }))!;
    expect(ld).toMatchObject({ "@type": "Event", name: "A show", startDate: "2026-10-09T19:00:00-05:00", endDate: "2026-10-09T22:00:00-05:00" });
  });

  it("points at the event's own page when there is one, else the primary page", () => {
    expect(eventJsonLd(event({ eventUrl: "https://www.therecordbar.com/shows/a-show" }))).toMatchObject({ url: "https://www.therecordbar.com/shows/a-show" });
    expect(eventJsonLd(event())).toMatchObject({ url: "https://www.therecordbar.com/shows" });
  });

  it("is omitted for a recurring event, which has no start date to state", () => {
    expect(eventJsonLd(event({ recurrence: "recurring", start: undefined, schedule: "Tuesdays" }))).toBeUndefined();
  });

  it("is omitted for a run with no start, which would carry only an end date", () => {
    expect(eventJsonLd(event({ recurrence: "limited-run", start: undefined, end: "2026-10-31" }))).toBeUndefined();
  });
});
