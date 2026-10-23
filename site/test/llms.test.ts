// @vitest-environment node
import { describe, expect, it } from "vitest";
import { EVENTS_JSON_FIELDS, llmsTxt } from "../src/lib/llms";
import { QUERY_KEYS, WHEN_PRESETS } from "../src/lib/query";
import { event } from "./fixtures/event";

const input = {
  origin: "https://www.kcthisweek.com",
  siteName: "KC This Week",
  tagline: "A weekly researched, ad-free list of what's worth doing in Kansas City.",
  repoUrl: "https://github.com/WrongerSandwich/kc-events",
  lastSuccessfulRun: "2026-10-19T11:30:00Z",
  today: "2026-10-08",
  horizonWeeks: 3,
  kinds: ["music", "theater/dance", "comedy"],
  regions: ["Central KC", "Johnson County", "Elsewhere in the metro"],
  neighborhoods: { "Central KC": ["Crossroads"], "Johnson County": ["Overland Park"] },
  venueCount: 97,
  schemaVersion: 2,
  events: [
    event({ id: "evt_pick00000001", title: "A rare show", dontMiss: true, whyLine: "Rare; see it." }),
    event({ id: "evt_plain0000001", title: "A play", kind: "theater/dance", region: "Johnson County", neighborhood: "Overland Park" }),
    event({ id: "evt_alway0000001", title: "Trivia", recurrence: "recurring", start: undefined, schedule: "Tuesdays" }),
  ],
};
const text = llmsTxt(input);
const section = (heading: string) => {
  const start = text.indexOf(`\n## ${heading}\n`);
  expect(start, heading).toBeGreaterThan(-1);
  const end = text.indexOf("\n## ", start + 1);
  return text.slice(start, end === -1 ? undefined : end);
};

describe("llmsTxt (#188)", () => {
  it("keeps the llms.txt shape: an H1, the tagline as a blockquote, the run and count line", () => {
    expect(text.startsWith("# KC This Week\n\n> A weekly researched")).toBe(true);
    expect(text).toContain("Last run: 2026-10-19T11:30:00Z. 3 active events.");
  });

  it("lists the three calendar feed patterns, with the webcal note", () => {
    const s = section("Calendar feeds");
    expect(s).toContain("https://www.kcthisweek.com/calendar.ics");
    expect(s).toContain("https://www.kcthisweek.com/calendar/picks.ics");
    expect(s).toContain("https://www.kcthisweek.com/calendar/<kind>.ics");
    expect(s).toContain("/calendar/theater-dance.ics");
    expect(s).toMatch(/webcal:\/\//);
    expect(s).toContain("From URL");
  });

  it("lists the changes and venues pages and every kind and region page with its current count", () => {
    const s = section("Lists");
    expect(s).toContain("https://www.kcthisweek.com/changes");
    expect(s).toContain("https://www.kcthisweek.com/venues : 97 venues");
    expect(s).toContain("https://www.kcthisweek.com/v/<slug>");
    expect(s).toContain("https://www.kcthisweek.com/k/music : Music in Kansas City, 1 event\n");
    expect(s).toContain("https://www.kcthisweek.com/k/theater-dance : Theater and dance in Kansas City, 1 event\n");
    expect(s).toContain("https://www.kcthisweek.com/k/comedy : Comedy in Kansas City, 0 events\n");
    expect(s).toContain("https://www.kcthisweek.com/r/johnson-county : Things to do in Johnson County, 1 event\n");
    expect(s).toContain("https://www.kcthisweek.com/r/elsewhere-in-the-metro");
  });

  it("documents every explorer query key, one line each, with an example", () => {
    const s = section("Explorer links");
    for (const key of QUERY_KEYS) expect(s, key).toMatch(new RegExp(`\\n- ${key}[=:]`));
    for (const preset of WHEN_PRESETS) expect(s, preset).toContain(`${preset} (`);
    expect(s).toContain("YYYY-MM-DD..YYYY-MM-DD");
    expect(s).toContain("music, theater-dance, comedy");
    expect(s).toContain("central-kc, johnson-county, elsewhere-in-the-metro");
    expect(s).toContain("https://www.kcthisweek.com/explore?kind=music&region=central-kc");
  });

  it("names every events.json field and the schema version", () => {
    const s = section("The dataset");
    expect(s).toContain("schemaVersion (2,");
    for (const key of Object.keys(EVENTS_JSON_FIELDS)) expect(s, key).toMatch(new RegExp(`\\n- ${key}: `));
  });

  it("lists the current picks with their event pages, and no event that is not one", () => {
    const s = section("This week's picks");
    expect(s).toContain("[A rare show](https://www.kcthisweek.com/e/evt_pick00000001)");
    expect(s).toContain("Rare; see it.");
    expect(s).not.toContain("A play");
  });

  it("says how to cite it", () => {
    expect(text).toContain("Cite as: KC This Week, https://www.kcthisweek.com (data under CC BY 4.0)");
  });
});
