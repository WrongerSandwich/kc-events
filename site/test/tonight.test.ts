// @vitest-environment node
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPublished } from "../src/build/load-dataset";
import { addDays } from "../src/lib/dates";
import { firstDay } from "../src/lib/events";
import { dayStarts, matches } from "../src/lib/filter";
import { DEFAULT_FILTERS } from "../src/lib/query";
import { tonightLine } from "../src/lib/tonight";

const site = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
// Monday: a 10 am storytime, shows at 7 and 7:30 pm, and an untimed opening; Tuesday one show; Wednesday none.
const table = { from: "2026-10-05", starts: [[600, 1140, 1170, 1440], [1140], []] };

describe("tonightLine", () => {
  it("counts the whole day before the visitor's clock is read, linking to the explorer's Today", () => {
    expect(tonightLine(table, "2026-10-05")).toEqual({ text: "Tonight: 4 events", href: "/explore?when=today" });
  });

  it("counts what has not yet started by the visitor's clock, an untimed event all day", () => {
    expect(tonightLine(table, "2026-10-05", "2026-10-05T08:00")?.text).toBe("Tonight: 4 events");
    expect(tonightLine(table, "2026-10-05", "2026-10-05T12:00")?.text).toBe("Tonight: 3 events");
    expect(tonightLine(table, "2026-10-05", "2026-10-05T19:00")?.text).toBe("Tonight: 2 events"); // the 7 pm show has begun
    expect(tonightLine(table, "2026-10-05", "2026-10-05T21:59")?.text).toBe("Tonight: 1 event");
  });

  it("says nothing more is listed once the day's events have all begun, and nothing listed on a day with none", () => {
    expect(tonightLine(table, "2026-10-06", "2026-10-06T19:05")).toEqual({ text: "Nothing more listed tonight", href: "/explore?when=today" });
    expect(tonightLine(table, "2026-10-07", "2026-10-07T09:00")).toEqual({ text: "Nothing listed tonight", href: "/explore?when=today" });
  });

  it("turns to tomorrow's whole day from 10 pm", () => {
    expect(tonightLine(table, "2026-10-05", "2026-10-05T22:00")).toEqual({ text: "Tomorrow: 1 event", href: "/explore?when=tomorrow" });
    expect(tonightLine(table, "2026-10-06", "2026-10-06T23:59")).toEqual({ text: "Nothing listed tomorrow", href: "/explore?when=tomorrow" });
  });

  it("says nothing for a day the table does not cover", () => {
    expect(tonightLine(table, "2026-10-04")).toBeUndefined();
    expect(tonightLine(table, "2026-10-08")).toBeUndefined();
    expect(tonightLine(table, "2026-10-07", "2026-10-07T22:30")).toBeUndefined();
  });
});

describe("the count over the fixture dataset", () => {
  const { events } = loadPublished({ datasetPath: site("e2e/fixtures/events.json"), configPath: site("../research.config.yaml"), today: "2026-10-05" });
  const table = dayStarts(events, "2026-10-05", 30);
  const none = new Set<string>();
  // The explorer's results for a preset on a day, less the runs that began before the day the line is about.
  const ownEvents = (preset: "today" | "tomorrow", today: string) => {
    const day = preset === "today" ? today : addDays(today, 1);
    return events.filter((e) => matches(e, { ...DEFAULT_FILTERS, when: { preset } }, today, none) && !(e.recurrence === "limited-run" && firstDay(e) !== day)).length;
  };

  it("is the explorer's when=today for the whole day, and its when=tomorrow after 10 pm, less the runs already under way", () => {
    for (let i = 0; i < 29; i++) {
      const today = addDays("2026-10-05", i);
      const onToday = ownEvents("today", today);
      const onTomorrow = ownEvents("tomorrow", today);
      expect(tonightLine(table, today)?.text).toMatch(onToday === 0 ? "Nothing listed tonight" : `Tonight: ${onToday} event`);
      expect(tonightLine(table, today, `${today}T22:15`)?.text).toMatch(onTomorrow === 0 ? "Nothing listed tomorrow" : `Tomorrow: ${onTomorrow} event`);
    }
    // The line leaves out a run already under way: the explorer's Today on the build's day has more than the line.
    expect(events.filter((e) => matches(e, { ...DEFAULT_FILTERS, when: { preset: "today" } }, "2026-10-05", none)).length).toBeGreaterThan(ownEvents("today", "2026-10-05"));
  });
});
