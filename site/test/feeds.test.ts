// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calendarFeeds, feedIcs, webcalUrl } from "../src/lib/feeds";
import { toIcs } from "../src/lib/ics";
import type { PublishedVenue } from "../src/lib/types";
import { event } from "./fixtures/event";
import { found } from "./fixtures/found";

const TODAY = "2026-10-05";
const kinds = ["music", "theater/dance", "other"];
const feeds = (events: Parameters<typeof calendarFeeds>[0]) => {
  const { allEvents, bySlug } = calendarFeeds(events, { kinds, today: TODAY, horizonWeeks: 3, siteName: "KC This Week" });
  return [allEvents, ...bySlug];
};
const feed = (events: Parameters<typeof calendarFeeds>[0], path: string) => found(feeds(events).find((f) => f.path === path), `the feed ${path}`);
const feedOpts = { siteName: "KC This Week", stamp: "2026-10-05T11:30:00Z", origin: "https://www.kcthisweek.com", venues: [] };
const ids = (events: Parameters<typeof calendarFeeds>[0], path: string) => feed(events, path).events.map((e) => e.id);

describe("calendarFeeds (#136)", () => {
  it("makes the picks' feed, the whole calendar, and one feed per kind by the explorer's slug", () => {
    expect(feeds([]).map((f) => [f.path, f.calendarName])).toEqual([
      ["/calendar.ics", "KC This Week"],
      ["/calendar/picks.ics", "KC This Week · Picks"],
      ["/calendar/music.ics", "KC This Week · Music"],
      ["/calendar/theater-dance.ics", "KC This Week · Theater and dance"],
      ["/calendar/other.ics", "KC This Week · Other events"],
    ]);
  });

  it("puts in the picks' feed only the picks from today through the horizon", () => {
    const events = [
      event({ id: "evt_pick_soon", dontMiss: true, start: "2026-10-09T19:00:00-05:00" }),
      event({ id: "evt_pick_edge", dontMiss: true, start: "2026-10-26" }),
      event({ id: "evt_pick_late", dontMiss: true, start: "2026-10-27" }),
      // A run that opened before today and is still on is in the week's picks.
      event({ id: "evt_pick_run", dontMiss: true, recurrence: "limited-run", start: "2026-09-01", end: "2026-11-30" }),
      event({ id: "evt_pick_after", dontMiss: true, recurrence: "limited-run", end: "2026-10-20" }),
      event({ id: "evt_not_pick", start: "2026-10-09T19:00:00-05:00" }),
    ];
    expect(ids(events, "/calendar/picks.ics")).toEqual(["evt_pick_soon", "evt_pick_edge", "evt_pick_run", "evt_pick_after"]);
  });

  it("puts every dated event in the whole calendar and its kind's feed, and no recurring one", () => {
    const events = [
      event({ id: "evt_show", kind: "music", start: "2026-12-01T19:00:00-06:00" }),
      event({ id: "evt_play", kind: "theater/dance", dontMiss: true }),
      event({ id: "evt_weekly", kind: "music", recurrence: "recurring", start: undefined, schedule: "Tuesdays" }),
    ];
    expect(ids(events, "/calendar.ics")).toEqual(["evt_show", "evt_play"]);
    expect(ids(events, "/calendar/music.ics")).toEqual(["evt_show"]);
    expect(ids(events, "/calendar/theater-dance.ics")).toEqual(["evt_play"]);
    expect(ids(events, "/calendar/other.ics")).toEqual([]);
  });

  it("writes each feed as a named calendar every event of which has a UID, a start, a summary, and its page", () => {
    const events = [
      event({ id: "evt_a", dontMiss: true, title: "A show" }),
      event({ id: "evt_b", kind: "theater/dance", recurrence: "limited-run", start: "2026-10-01", end: "2026-10-25", title: "A play" }),
    ];
    for (const f of feeds(events)) {
      const ics = feedIcs(f, feedOpts).replace(/\r\n[ \t]/g, "");
      expect(ics, f.path).toContain(`X-WR-CALNAME:${f.calendarName}\r\n`);
      const vevents = ics.split("BEGIN:VEVENT").slice(1);
      expect(vevents.length, f.path).toBe(f.events.length);
      for (const [i, v] of vevents.entries()) {
        const id = f.events[i]!.id;
        expect(v).toContain(`UID:${id}@kc-events\r\n`);
        expect(v).toMatch(/\r\nDTSTART[;:]/);
        expect(v).toMatch(/\r\nSUMMARY:./);
        expect(v).toContain(`\r\nURL:https://www.kcthisweek.com/e/${id}\r\n`);
      }
    }
  });
});

describe("feedIcs (#136)", () => {
  const shown = event({ eventUrl: "https://www.therecordbar.com/shows/a-show" });

  it("asks to be refreshed daily, links each event's page on the site, and locates it at its venue's address", () => {
    const venues: PublishedVenue[] = [{ name: "recordBar", slug: "recordbar", region: "Central KC", address: { street: "1520 Grand Blvd", locality: "Kansas City", region: "MO", postalCode: "64108" } }];
    const ics = feedIcs({ path: "/calendar.ics", calendarName: "KC This Week", events: [shown] }, { ...feedOpts, venues }).replace(/\r\n[ \t]/g, "");
    expect(ics).toContain("X-WR-CALNAME:KC This Week\r\nREFRESH-INTERVAL;VALUE=DURATION:P1D\r\nX-PUBLISHED-TTL:P1D\r\n");
    expect(ics).toContain("URL:https://www.kcthisweek.com/e/evt_000000000001\r\n");
    expect(ics).toContain("LOCATION:recordBar\\, 1520 Grand Blvd\\, Kansas City\\, MO 64108\r\n");
    // The notes still send a reader to the event's own page.
    expect(ics).toContain("details at https://www.therecordbar.com/shows/a-show.");
  });

  it("leaves an export as it was: no refresh, and the event's own page as its URL", () => {
    const ics = toIcs([shown], { siteName: "KC This Week", stamp: "2026-10-05T11:30:00Z", calendarName: "KC This Week" }).replace(/\r\n[ \t]/g, "");
    expect(ics).not.toContain("REFRESH-INTERVAL");
    expect(ics).not.toContain("X-PUBLISHED-TTL");
    expect(ics).toContain("URL:https://www.therecordbar.com/shows/a-show\r\n");
  });
});

describe("webcalUrl", () => {
  it("turns the feed's https address into the webcal one a calendar app opens", () => {
    expect(webcalUrl("https://www.kcthisweek.com", "/calendar/picks.ics")).toBe("webcal://www.kcthisweek.com/calendar/picks.ics");
    expect(webcalUrl("http://localhost:4321", "/calendar.ics")).toBe("webcal://localhost:4321/calendar.ics");
  });
});

describe("vercel.json", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
  const calendarSources = config.headers.filter((h) => h.headers.some((x) => x.key === "Content-Type" && x.value === "text/calendar; charset=utf-8")).map((h) => h.source);
  // Vercel's sources are path-to-regexp patterns; these use only literal text, an escaped dot, and the (.*) group.
  const matches = (path: string) => calendarSources.some((source) => new RegExp(`^${source}$`).test(path));

  it("serves every calendar file as UTF-8 text/calendar", () => {
    for (const path of ["/calendar.ics", "/calendar/picks.ics", "/calendar/music.ics", "/e/evt_0123456789ab.ics"]) expect(matches(path), path).toBe(true);
  });

  // An unknown path under /calendar/ or /e/ (say /calendar/nope.ics) still gets the calendar type on its 404:
  // the rule is scoped to the two folders that hold feeds, not to the files the build makes.
  it("leaves an .ics path outside /calendar/ and /e/ to the HTML 404's own type (#192)", () => {
    for (const path of ["/nope.ics", "/v/recordbar.ics", "/k/music.ics"]) expect(matches(path), path).toBe(false);
  });
});
