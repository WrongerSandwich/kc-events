import { describe, expect, it } from "vitest";
import { breadcrumbJsonLd, kindLanding, landingJsonLd, landingRange, regionLanding } from "../src/lib/landing";
import { event } from "./fixtures/event";

const today = "2026-10-13";
const origin = "https://www.kcthisweek.com";
const range = landingRange(today, 3);

describe("landingRange", () => {
  it("runs from today through the job's horizon", () => {
    expect(range).toEqual({ from: "2026-10-13", to: "2026-11-03" });
  });
});

const tue = event({ id: "evt_tue", title: "B show", start: "2026-10-13T20:00:00-05:00" });
const tuePick = event({ id: "evt_tuepick", title: "Z show", start: "2026-10-13T21:00:00-05:00", dontMiss: true });
const jazz = event({ id: "evt_jazz", title: "Jazz", start: "2026-10-15T19:00:00-05:00", region: "Johnson County", neighborhood: "Overland Park" });
const play = event({ id: "evt_play", title: "A play", kind: "theater/dance", start: "2026-10-14T19:30:00-05:00", region: "Johnson County", neighborhood: "Olathe" });
const beyond = event({ id: "evt_beyond", title: "Far off", start: "2026-11-04T19:00:00-05:00" });
const trivia = event({ id: "evt_trivia", title: "Trivia", recurrence: "recurring", start: undefined, schedule: "Tuesdays" });
const run = event({ id: "evt_run", title: "A run", kind: "art/exhibitions", recurrence: "limited-run", start: "2026-09-01", end: "2026-10-31" });
const all = [tue, tuePick, jazz, play, beyond, trivia, run];

describe("kindLanding", () => {
  const page = kindLanding("music", all, today, range);

  it("lists the kind's dated events through the horizon by day, picks first in each day", () => {
    expect(page.groups.map((g) => [g.heading, g.events.map((e) => e.id)])).toEqual([
      ["Tue Oct 13", ["evt_tuepick", "evt_tue"]],
      ["Thu Oct 15", ["evt_jazz"]],
    ]);
    expect(page.count).toBe(3);
  });

  it("titles and describes the page from the kind and the count", () => {
    expect(page.heading).toBe("Music in Kansas City");
    expect(page.description).toBe("3 music events this week, 3 through Nov 3, in Kansas City.");
    expect(page.path).toBe("/k/music");
    expect(page.explorePath).toBe("/explore?when=all&kind=music");
  });

  it("names a two-word kind in words and its slug as the explorer's", () => {
    const p = kindLanding("theater/dance", all, today, range);
    expect(p.heading).toBe("Theater and dance in Kansas City");
    expect(p.description).toBe("1 theater and dance event this week, 1 through Nov 3, in Kansas City.");
    expect(p.path).toBe("/k/theater-dance");
    expect(p.explorePath).toBe("/explore?when=all&kind=theater-dance");
  });

  it("keeps a run open today under On now", () => {
    expect(kindLanding("art/exhibitions", all, today, range).groups.map((g) => g.heading)).toEqual(["On now"]);
  });

  it("says so when the kind has nothing listed", () => {
    const p = kindLanding("other", all, today, range);
    expect(p.groups).toEqual([]);
    expect(p.heading).toBe("Other events in Kansas City");
    expect(p.description).toBe("No other events listed in Kansas City, Oct 13–Nov 3.");
  });
});

describe("a hub's lines: this week, then its venues and picks (#302)", () => {
  // This week is the explorer's default: today, a Tuesday, through Sunday the 18th.
  const later = event({ id: "evt_later", title: "Later", start: "2026-10-22T20:00:00-05:00", venue: "Liberty Hall" });

  it("counts this week's events against the range's, and the venues by slug and the picks across them", () => {
    const sameRoom = { ...tuePick, venue: "The RecordBar" };
    const jazzPick = { ...jazz, venue: "Knuckleheads", dontMiss: true };
    const p = kindLanding("music", [tue, sameRoom, jazzPick, later], today, range);
    expect(p.description).toBe("3 music events this week, 4 through Nov 3, in Kansas City.");
    expect([p.weekCount, p.count, p.venueCount, p.pickCount]).toEqual([3, 4, 3, 2]);
    expect(p.venuesAndPicks).toBe("At 3 venues; 2 picks.");
  });

  it("says none this week when the events come later", () => {
    const p = kindLanding("music", [later], today, range);
    expect(p.description).toBe("No music events this week; 1 through Nov 3, in Kansas City.");
    expect(p.venuesAndPicks).toBe("At 1 venue.");
  });

  it("keeps the no-events sentence and leaves out the second line when nothing is listed", () => {
    const p = kindLanding("music", [], today, range);
    expect(p.description).toBe("No music events listed in Kansas City, Oct 13–Nov 3.");
    expect([p.weekCount, p.venueCount, p.pickCount]).toEqual([0, 0, 0]);
    expect(p.venuesAndPicks).toBeUndefined();
  });

  it("uses the singular for one venue and one pick", () => {
    expect(kindLanding("music", [tuePick], today, range).venuesAndPicks).toBe("At 1 venue; 1 pick.");
  });

  it("says today on a Sunday, when this week is only today", () => {
    const sunday = "2026-10-18";
    const show = event({ id: "evt_sun", start: "2026-10-18T19:00:00-05:00" });
    expect(kindLanding("music", [show, later], sunday, landingRange(sunday, 3)).description).toBe("1 music event today, 2 through Nov 8, in Kansas City.");
    expect(kindLanding("music", [later], sunday, landingRange(sunday, 3)).description).toBe("No music events today; 1 through Nov 8, in Kansas City.");
  });

  it("gives a region page the same lines with its own place", () => {
    const p = regionLanding("Johnson County", [{ ...jazz, venue: "Yardley Hall" }, play, { ...later, region: "Johnson County" }], today, range, []);
    expect(p.description).toBe("2 events this week, 3 through Nov 3, in Johnson County.");
    expect(p.venuesAndPicks).toBe("At 3 venues.");
    const elsewhere = regionLanding("Elsewhere in the metro", [{ ...later, region: "Elsewhere in the metro" }], today, range, []);
    expect(elsewhere.description).toBe("No events this week; 1 through Nov 3, elsewhere in the metro.");
  });
});

describe("regionLanding", () => {
  it("lists the region's events and names its neighborhoods", () => {
    const p = regionLanding("Johnson County", all, today, range, ["Overland Park", "Olathe", "Lenexa"]);
    expect(p.groups.map((g) => g.events.map((e) => e.id))).toEqual([["evt_play"], ["evt_jazz"]]);
    expect(p.heading).toBe("Things to do in Johnson County");
    expect(p.description).toBe("2 events this week, 2 through Nov 3, in Johnson County.");
    expect(p.path).toBe("/r/johnson-county");
    expect(p.explorePath).toBe("/explore?when=all&region=johnson-county");
    expect(p.neighborhoods).toEqual(["Overland Park", "Olathe", "Lenexa"]);
  });

  it("leaves out a neighborhood that only repeats the region's name, so the Northland's page has no subline of Northland (#184)", () => {
    expect(regionLanding("Northland", all, today, range, ["Northland"]).neighborhoods).toEqual([]);
    expect(regionLanding("Northland", all, today, range, ["Northland", "Gladstone"]).neighborhoods).toEqual(["Gladstone"]);
  });

  it("reads the catch-all region as a phrase", () => {
    const p = regionLanding("Elsewhere in the metro", [], today, range, []);
    expect(p.heading).toBe("Things to do elsewhere in the metro");
    expect(p.description).toBe("No events listed elsewhere in the metro, Oct 13–Nov 3.");
  });
});

describe("landingJsonLd", () => {
  it("is an ItemList of the listed event pages in page order, each once, leaving out a run with no start, as of the last run (#189)", () => {
    const startless = event({ id: "evt_startless", recurrence: "limited-run", start: undefined, end: "2026-10-31" });
    const multi = event({ id: "evt_multi", start: "2026-10-13", end: "2026-10-14" });
    const p = kindLanding("music", [tue, tuePick, startless, multi], today, range);
    expect(landingJsonLd(p, origin, "2026-10-19T06:40:12-05:00")).toEqual({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Music in Kansas City",
      url: "https://www.kcthisweek.com/k/music",
      dateModified: "2026-10-19T06:40:12-05:00",
      numberOfItems: 3,
      itemListElement: [
        { "@type": "ListItem", position: 1, url: "https://www.kcthisweek.com/e/evt_tuepick" },
        { "@type": "ListItem", position: 2, url: "https://www.kcthisweek.com/e/evt_multi" },
        { "@type": "ListItem", position: 3, url: "https://www.kcthisweek.com/e/evt_tue" },
      ],
    });
  });
});

describe("breadcrumbJsonLd", () => {
  it("is Home, the event's kind page, then the event", () => {
    expect(breadcrumbJsonLd(event({ id: "evt_a", title: "A show", kind: "food/drink" }), origin)).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://www.kcthisweek.com/" },
        { "@type": "ListItem", position: 2, name: "Food and drink", item: "https://www.kcthisweek.com/k/food-drink" },
        { "@type": "ListItem", position: 3, name: "A show", item: "https://www.kcthisweek.com/e/evt_a" },
      ],
    });
  });
});
