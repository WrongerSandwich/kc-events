import { describe, expect, it } from "vitest";
import { exportName } from "../src/lib/export-name";
import { DEFAULT_FILTERS, EVERY_DATE } from "../src/lib/query";

const name = (over: Partial<typeof DEFAULT_FILTERS>) => exportName({ ...DEFAULT_FILTERS, ...over }, "KC This Week");

describe("exportName (#190)", () => {
  it("names an export of no slice after the site", () => {
    expect(name({})).toEqual({ calendarName: "KC This Week", filename: "kc-this-week.ics" });
    // The dates narrow a view but are not what it is about: every event in the file carries its own.
    expect(name({ when: EVERY_DATE })).toEqual({ calendarName: "KC This Week", filename: "kc-this-week.ics" });
    expect(name({ when: { from: "2026-10-09", to: "2026-10-11" }, sort: "venue" })).toEqual({ calendarName: "KC This Week", filename: "kc-this-week.ics" });
  });

  it("names an export after its kind, in the kind's own words", () => {
    expect(name({ kinds: ["comedy"] })).toEqual({ calendarName: "KC This Week · Comedy", filename: "kc-this-week-comedy.ics" });
    expect(name({ kinds: ["theater/dance", "music"] })).toEqual({ calendarName: "KC This Week · Theater and dance, Music", filename: "kc-this-week-theater-and-dance-music.ics" });
  });

  it("adds the regions, the picks, a shortlist, and the search, in the pills' order", () => {
    expect(name({ kinds: ["comedy"], regions: ["Johnson County"], dontMiss: true, q: " jazz " })).toEqual({
      calendarName: "KC This Week · Comedy · Johnson County · Picks · “jazz”",
      filename: "kc-this-week-comedy-johnson-county-picks-jazz.ics",
    });
    expect(name({ ids: ["evt_a", "evt_b"] })).toEqual({ calendarName: "KC This Week · Shortlist", filename: "kc-this-week-shortlist.ics" });
  });

  it("keeps the filename to safe characters whatever the search", () => {
    expect(name({ q: "Café/../“x”" }).filename).toBe("kc-this-week-cafe-x.ics");
  });
});
