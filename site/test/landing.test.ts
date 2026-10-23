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
    expect(page.description).toBe("3 music events in Kansas City, Oct 13–Nov 3.");
    expect(page.path).toBe("/k/music");
    expect(page.explorePath).toBe("/explore?when=all&kind=music");
  });

  it("names a two-word kind in words and its slug as the explorer's", () => {
    const p = kindLanding("theater/dance", all, today, range);
    expect(p.heading).toBe("Theater and dance in Kansas City");
    expect(p.description).toBe("1 theater and dance event in Kansas City, Oct 13–Nov 3.");
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

describe("regionLanding", () => {
  it("lists the region's events and names its neighborhoods", () => {
    const p = regionLanding("Johnson County", all, today, range, ["Overland Park", "Olathe", "Lenexa"]);
    expect(p.groups.map((g) => g.events.map((e) => e.id))).toEqual([["evt_play"], ["evt_jazz"]]);
    expect(p.heading).toBe("Things to do in Johnson County");
    expect(p.description).toBe("2 events in Johnson County, Oct 13–Nov 3.");
    expect(p.path).toBe("/r/johnson-county");
    expect(p.explorePath).toBe("/explore?when=all&region=johnson-county");
    expect(p.neighborhoods).toEqual(["Overland Park", "Olathe", "Lenexa"]);
  });

  it("leaves out a neighborhood that only repeats the region's name, so Lawrence's page has no subline of Lawrence (#184)", () => {
    expect(regionLanding("Lawrence", all, today, range, ["Lawrence"]).neighborhoods).toEqual([]);
    expect(regionLanding("Lawrence", all, today, range, ["Lawrence", "Eudora"]).neighborhoods).toEqual(["Eudora"]);
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
