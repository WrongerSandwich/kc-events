// @vitest-environment node
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPublished } from "../src/build/load-dataset";
import { addDays } from "../src/lib/dates";
import { dayCounts, matches } from "../src/lib/filter";
import { DEFAULT_FILTERS } from "../src/lib/query";
import { tonightLine } from "../src/lib/tonight";

const site = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const table = { from: "2026-10-05", counts: [23, 1, 0] };

describe("tonightLine", () => {
  it("counts today's events, linking to the explorer's Today", () => {
    expect(tonightLine(table, "2026-10-05")).toEqual({ text: "Tonight: 23 events", href: "/explore?when=today" });
    expect(tonightLine(table, "2026-10-05", "2026-10-05T21:59")).toEqual({ text: "Tonight: 23 events", href: "/explore?when=today" });
  });

  it("says one event in the singular, and nothing listed when there is none, with the same link", () => {
    expect(tonightLine(table, "2026-10-06")).toEqual({ text: "Tonight: 1 event", href: "/explore?when=today" });
    expect(tonightLine(table, "2026-10-07")).toEqual({ text: "Nothing listed tonight", href: "/explore?when=today" });
  });

  it("turns to tomorrow from 10 pm", () => {
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
  const counts = dayCounts(events, "2026-10-05", 30);
  const none = new Set<string>();

  it("matches the explorer's when=today, and its when=tomorrow after 10 pm, for the same clock", () => {
    for (let i = 0; i < 29; i++) {
      const today = addDays("2026-10-05", i);
      const onToday = events.filter((e) => matches(e, { ...DEFAULT_FILTERS, when: { preset: "today" } }, today, none)).length;
      const onTomorrow = events.filter((e) => matches(e, { ...DEFAULT_FILTERS, when: { preset: "tomorrow" } }, today, none)).length;
      expect(tonightLine(counts, today)?.text).toMatch(onToday === 0 ? "Nothing listed tonight" : `Tonight: ${onToday} event`);
      expect(tonightLine(counts, today, `${today}T22:15`)?.text).toMatch(onTomorrow === 0 ? "Nothing listed tomorrow" : `Tomorrow: ${onTomorrow} event`);
    }
    expect(counts.counts.some((n) => n > 1)).toBe(true); // the fixture exercises the plural
  });
});
