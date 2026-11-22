import { describe, expect, it } from "vitest";
import { META_MAX } from "../src/lib/event-meta";
import type { PublishedVenue } from "../src/lib/types";
import { venueDescription, venueFacts, venuePageJsonLd, venuePageTitle } from "../src/lib/venue-page";
import { event } from "./fixtures/event";

const origin = "https://www.kcthisweek.com";
/** A Monday: the week runs through Sunday the 11th, a three-week horizon through the 26th. */
const today = "2026-10-05";
const lastSuccessfulRun = "2026-10-05T06:30:00-05:00";

const recordBar: PublishedVenue = { slug: "recordbar", name: "recordBar", neighborhood: "Crossroads", region: "Central KC" };
const kauffman: PublishedVenue = {
  slug: "kauffman-center-for-the-performing-arts",
  name: "Kauffman Center for the Performing Arts",
  address: { street: "1601 Broadway Blvd", locality: "Kansas City", region: "MO", postalCode: "64108" },
  neighborhood: "Downtown",
  region: "Central KC",
};
const lenexa: PublishedVenue = {
  slug: "lenexa-public-market",
  name: "Lenexa Public Market",
  address: { street: "8750 Penrose Ln", locality: "Lenexa", region: "KS", postalCode: "66219" },
  neighborhood: "Lenexa",
  region: "Johnson County",
};

describe("venuePageTitle", () => {
  it("says the page lists the venue's events, in its row's city", () => {
    expect(venuePageTitle(lenexa)).toBe("Lenexa Public Market events, Lenexa");
    expect(venuePageTitle(kauffman)).toBe("Kauffman Center for the Performing Arts events, Kansas City");
  });

  it("says Kansas City for a venue with no row, or a row with no address", () => {
    expect(venuePageTitle(recordBar)).toBe("recordBar events, Kansas City");
  });

  it("does not repeat a city the name already ends with", () => {
    expect(venuePageTitle({ ...recordBar, name: "Union Station Kansas City" })).toBe("Union Station Kansas City events");
    expect(venuePageTitle({ ...lenexa, name: "City of Lenexa" })).toBe("City of Lenexa events");
  });

  it("matches the city only as a whole word", () => {
    const mission = { ...lenexa, name: "Parks Commission", address: { ...lenexa.address!, locality: "Mission" } };
    expect(venuePageTitle(mission)).toBe("Parks Commission events, Mission");
  });
});

describe("venueDescription", () => {
  it("names the next event and counts what is coming up", () => {
    const here = [
      event({ id: "evt_b", title: "Second show", start: "2026-10-17T20:00:00-05:00" }),
      event({ id: "evt_a", title: "First show", start: "2026-10-10T19:00:00-05:00" }),
      event({ id: "evt_c", title: "Weekly jam", start: undefined, recurrence: "recurring", schedule: "Tuesdays" }),
    ];
    expect(venueDescription(recordBar, here, today)).toBe("Next: First show, Sat Oct 10. 3 upcoming events at recordBar, Crossroads.");
  });

  it("says one event in the singular", () => {
    expect(venueDescription(recordBar, [event({ title: "A show" })], today)).toBe("Next: A show, Fri Oct 9. 1 upcoming event at recordBar, Crossroads.");
  });

  it("gives the region when the neighborhood is the venue's own name", () => {
    const v = { ...recordBar, name: "Crown Center", neighborhood: "Crown Center" };
    expect(venueDescription(v, [event({ venue: "Crown Center" })], today)).toMatch(/at Crown Center, Central KC\.$/);
  });

  it("names a run that is on now when nothing starts later", () => {
    const run = event({ title: "An exhibition", recurrence: "limited-run", start: "2026-09-01", end: "2026-12-20" });
    expect(venueDescription(recordBar, [run], today)).toBe("On now: An exhibition. 1 upcoming event at recordBar, Crossroads.");
  });

  it("counts alone when nothing coming up has a date", () => {
    const jam = event({ title: "Weekly jam", start: undefined, recurrence: "recurring", schedule: "Tuesdays" });
    expect(venueDescription(recordBar, [jam], today)).toBe("1 upcoming event at recordBar, Crossroads.");
  });

  it("says nothing is listed, without guessing why, for a venue with no events", () => {
    expect(venueDescription(recordBar, [], today)).toBe("recordBar, Crossroads. Nothing listed right now; see what's on in Kansas City this week.");
    expect(venueDescription({ slug: "x", name: "Somewhere" }, [], today)).toBe("Somewhere. Nothing listed right now; see what's on in Kansas City this week.");
  });

  it("stays within the meta budget for a long name and title, clipping the title and keeping the counts", () => {
    const v = { ...kauffman, name: "The Johnson County Library Central Resource Library and Event Space at the Galleria" };
    const title = "An Evening of Extraordinarily Long Titles: A Retrospective Concert of Music Nobody Could Possibly Fit in a Snippet";
    const here = [event({ title }), event({ id: "evt_2", start: "2026-10-12" })];
    const d = venueDescription(v, here, today);
    expect(d.length).toBeLessThanOrEqual(META_MAX);
    expect(d).toContain("2 upcoming events at");
    expect(d).toMatch(/^Next: An Evening of .*…, Fri Oct 9\. /);
  });

  it("stays within the budget with no events and a long name", () => {
    const v = { slug: "x", name: "A".repeat(150), neighborhood: "Crossroads", region: "Central KC" };
    expect(venueDescription(v, [], today).length).toBeLessThanOrEqual(META_MAX);
  });
});

describe("venueFacts", () => {
  const horizonWeeks = 3;

  it("gives the kinds it hosts and how many events this week and in the horizon", () => {
    const here = [
      event({ id: "evt_1", start: "2026-10-09T19:00:00-05:00", kind: "music" }),
      event({ id: "evt_2", start: "2026-10-10T19:00:00-05:00", kind: "comedy" }),
      event({ id: "evt_3", start: "2026-10-20T19:00:00-05:00", kind: "music" }),
      event({ id: "evt_4", start: "2026-11-30T19:00:00-06:00", kind: "theater/dance" }),
    ];
    expect(venueFacts(here, today, horizonWeeks)).toEqual(["Music, comedy", "2 events this week, 3 through Oct 26"]);
  });

  it("calls the kind other, other events", () => {
    expect(venueFacts([event({ id: "evt_1", kind: "music" }), event({ id: "evt_2", kind: "other" })], today, horizonWeeks)[0]).toBe("Music, other events");
    expect(venueFacts([event({ kind: "other" })], today, horizonWeeks)[0]).toBe("Other events");
  });

  it("leaves out the week when nothing is on this week, and says one in the singular", () => {
    expect(venueFacts([event({ start: "2026-10-20" })], today, horizonWeeks)).toEqual(["Music", "1 event through Oct 26"]);
  });

  it("leaves out the counts when nothing has a date in the horizon, and everything for no events", () => {
    const jam = event({ start: undefined, recurrence: "recurring", schedule: "Tuesdays", kind: "food/drink" });
    expect(venueFacts([jam], today, horizonWeeks)).toEqual(["Food/drink"]);
    expect(venueFacts([], today, horizonWeeks)).toEqual([]);
  });
});

describe("venuePageJsonLd", () => {
  it("is the Place, the trail Home › Venues › the venue, and the upcoming events' pages", () => {
    const here = [event({ id: "evt_b", start: "2026-10-17" }), event({ id: "evt_a", start: "2026-10-10" }), event({ id: "evt_c", start: undefined, recurrence: "recurring", schedule: "Tuesdays" })];
    const [place, trail, list, ...rest] = venuePageJsonLd(kauffman, here, { origin, today, lastSuccessfulRun }) as Record<string, unknown>[];
    expect(rest).toEqual([]);
    expect(place).toMatchObject({ "@type": "Place", name: kauffman.name, "@id": `${origin}/v/${kauffman.slug}` });
    expect(trail).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: "Venues", item: `${origin}/venues` },
        { "@type": "ListItem", position: 3, name: kauffman.name, item: `${origin}/v/${kauffman.slug}` },
      ],
    });
    expect(list).toEqual({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `Events at ${kauffman.name}`,
      url: `${origin}/v/${kauffman.slug}`,
      dateModified: lastSuccessfulRun,
      numberOfItems: 2,
      itemListElement: [
        { "@type": "ListItem", position: 1, url: `${origin}/e/evt_a` },
        { "@type": "ListItem", position: 2, url: `${origin}/e/evt_b` },
      ],
    });
  });

  it("has no ItemList for a venue with nothing coming up", () => {
    const blocks = venuePageJsonLd(kauffman, [], { origin, today, lastSuccessfulRun }) as Record<string, unknown>[];
    expect(blocks.map((b) => b["@type"])).toEqual(["Place", "BreadcrumbList"]);
  });
});
