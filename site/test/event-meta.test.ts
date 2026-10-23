import { describe, expect, it } from "vitest";
import { META_MAX, clip, eventDescription, eventJsonLd, eventPageTitle, frontPageJsonLd, organizerLd, postalAddress } from "../src/lib/event-meta";
import { siteConfig } from "../src/site.config";
import { meta } from "../src/generated/meta";
import { event } from "./fixtures/event";

const today = "2026-10-05";

describe("eventDescription (#189)", () => {
  it("names the event, then when and where, then the page's description text", () => {
    expect(eventDescription(event({ whyLine: "Rare." }), today, "A band plays.")).toBe("A show: Friday, October 9, 7:00 pm at recordBar. A band plays.");
  });

  it("takes the why-line when the page gave no description text", () => {
    expect(eventDescription(event({ whyLine: "Rare." }), today)).toBe("A show: Friday, October 9, 7:00 pm at recordBar. Rare.");
    expect(eventDescription(event({ whyLine: "Rare." }), today, " ")).toBe("A show: Friday, October 9, 7:00 pm at recordBar. Rare.");
  });

  it("is the name, date and place alone with neither", () => {
    expect(eventDescription(event(), today)).toBe("A show: Friday, October 9, 7:00 pm at recordBar.");
  });

  it("names the place alone for a recurring event with no schedule", () => {
    const e = event({ recurrence: "recurring", start: undefined, schedule: undefined });
    expect(eventDescription(e, today)).toBe("A show: at recordBar.");
  });

  it("names a long title's kind instead, leaving room for the rest", () => {
    const e = event({ title: "An Evening with the Kansas City Symphony Chamber Players and Friends in the Lobby", kind: "theater/dance" });
    expect(eventDescription(e, today)).toBe("Theater and dance: Friday, October 9, 7:00 pm at recordBar.");
  });

  it("cuts the description text to about 110 characters at a word", () => {
    const about = "A long description of the evening that goes on about the band, the room, the opening act, and the drinks menu at length.";
    const d = eventDescription(event(), today, about);
    expect(d.startsWith("A show: Friday, October 9, 7:00 pm at recordBar. A long description")).toBe(true);
    expect(d.endsWith("…")).toBe(true);
    expect(d.length - "A show: Friday, October 9, 7:00 pm at recordBar. ".length).toBeLessThanOrEqual(110);
  });

  it("stays under 160 characters however long its parts", () => {
    const e = event({
      venue: "Kauffman Center for the Performing Arts",
      room: "Helzberg Hall and the Brandmeyer Great Hall, second floor",
      whyLine: "A why-line that runs long, as a pick's can, about the orchestra, the soloist, the program, and the conductor's last season here.",
    });
    for (const about of [undefined, "x ".repeat(200)]) expect(eventDescription(e, today, about).length).toBeLessThan(META_MAX);
  });

  it("names the room after the venue (#91)", () => {
    const e = event({ venue: "Kauffman Center for the Performing Arts", room: "Helzberg Hall", neighborhood: "Downtown" });
    expect(eventDescription(e, today)).toBe("A show: Friday, October 9, 7:00 pm at Kauffman Center for the Performing Arts · Helzberg Hall.");
  });

  it("tells apart same-night films at one venue by their titles", () => {
    const night = { venue: "Screenland Armour", start: "2026-10-25" };
    expect(eventDescription(event({ ...night, title: "Nosferatu" }), today)).not.toBe(eventDescription(event({ ...night, title: "Halloween" }), today));
  });
});

describe("clip", () => {
  it("leaves short text alone and cuts long text at a word with an ellipsis", () => {
    expect(clip("Short.", 20)).toBe("Short.");
    expect(clip("one two three four five", 14)).toBe("one two three…");
    expect(clip("one two, three four", 10)).toBe("one two…");
  });
});

describe("eventPageTitle (#189)", () => {
  it("is the title when no other published event shares it", () => {
    const e = event({ id: "evt_a", title: "Floating Pumpkin Patch" });
    expect(eventPageTitle(e, [e, event({ id: "evt_b", title: "Pumpkin Patch" })])).toBe("Floating Pumpkin Patch");
  });

  it("adds a short date when another published event has the same title", () => {
    const a = event({ id: "evt_a", title: "Floating Pumpkin Patch", start: "2026-10-25" });
    const b = event({ id: "evt_b", title: "Floating Pumpkin Patch", start: "2026-10-24T18:00:00-05:00" });
    expect(eventPageTitle(a, [a, b])).toBe("Floating Pumpkin Patch, Oct 25");
    expect(eventPageTitle(b, [a, b])).toBe("Floating Pumpkin Patch, Oct 24");
  });
});

const opts = { origin: "https://www.kcthisweek.com", today, image: "https://www.kcthisweek.com/og.png" };

describe("eventJsonLd", () => {
  it("names a one-off's start and end", () => {
    const ld = eventJsonLd(event({ end: "2026-10-09T22:00:00-05:00" }), opts)!;
    expect(ld).toMatchObject({ "@type": "Event", name: "A show", startDate: "2026-10-09T19:00:00-05:00", endDate: "2026-10-09T22:00:00-05:00" });
  });

  it("is the site's own page, by url and @id, with the venue's page as sameAs (#189)", () => {
    const ld = eventJsonLd(event({ id: "evt_87ced2675ef5", eventUrl: "https://www.therecordbar.com/shows/a-show" }), opts);
    expect(ld).toMatchObject({
      "@id": "https://www.kcthisweek.com/e/evt_87ced2675ef5",
      url: "https://www.kcthisweek.com/e/evt_87ced2675ef5",
      sameAs: "https://www.therecordbar.com/shows/a-show",
    });
    expect(eventJsonLd(event(), opts)).toMatchObject({ sameAs: "https://www.therecordbar.com/shows" });
  });

  it("keeps the venue's page as the offers' url", () => {
    expect(eventJsonLd(event({ eventUrl: "https://www.therecordbar.com/shows/a-show", price: "$20" }), opts)).toMatchObject({
      offers: { url: "https://www.therecordbar.com/shows/a-show" },
    });
  });

  it("never invents an end: a timed start with none states none", () => {
    expect(eventJsonLd(event(), opts)).not.toHaveProperty("endDate");
  });

  it("gives a timed start with a later date-only end as two dates (#189)", () => {
    const ld = eventJsonLd(event({ recurrence: "limited-run", start: "2026-10-22T19:00:00-05:00", end: "2026-10-24" }), opts);
    expect(ld).toMatchObject({ startDate: "2026-10-22", endDate: "2026-10-24" });
  });

  it("leaves out a date-only end on a timed start's own day, which the start already says", () => {
    const ld = eventJsonLd(event({ start: "2026-10-22T19:00:00-05:00", end: "2026-10-22" }), opts);
    expect(ld).toMatchObject({ startDate: "2026-10-22T19:00:00-05:00" });
    expect(ld).not.toHaveProperty("endDate");
  });

  it("gives a run that plays only some weekdays a weekly schedule over its span (#189)", () => {
    const e = event({ recurrence: "limited-run", start: "2026-10-14", end: "2026-11-01", days: [5, 6, 0], daysLine: "Fri–Sun" });
    expect(eventJsonLd(e, opts)).toMatchObject({
      startDate: "2026-10-14",
      endDate: "2026-11-01",
      eventSchedule: {
        "@type": "Schedule",
        byDay: ["https://schema.org/Friday", "https://schema.org/Saturday", "https://schema.org/Sunday"],
        startDate: "2026-10-14",
        endDate: "2026-11-01",
      },
    });
    expect(eventJsonLd(event({ recurrence: "limited-run", start: "2026-10-14", end: "2026-11-01" }), opts)).not.toHaveProperty("eventSchedule");
  });

  it("offers a stated price: free, one price, or a range, in dollars (#133)", () => {
    const at = { eventUrl: "https://www.therecordbar.com/shows/a-show" };
    expect(eventJsonLd(event({ ...at, price: "Free" }), opts)).toMatchObject({
      offers: { "@type": "Offer", price: 0, priceCurrency: "USD", url: "https://www.therecordbar.com/shows/a-show" },
    });
    expect(eventJsonLd(event({ ...at, price: "$30 advance" }), opts)).toMatchObject({ offers: { "@type": "Offer", price: 30, priceCurrency: "USD" } });
    expect(eventJsonLd(event({ ...at, price: "$25.50 – $45" }), opts)).toMatchObject({
      offers: { "@type": "AggregateOffer", lowPrice: 25.5, highPrice: 45, priceCurrency: "USD" },
    });
  });

  it("offers nothing for no price, or one it cannot state as a number", () => {
    for (const price of [undefined, "Pay what you can", "Free with museum admission", "€20"]) {
      expect(eventJsonLd(event(price === undefined ? {} : { price }), opts)).not.toHaveProperty("offers");
    }
  });

  it("is omitted for a recurring event, which has no start date to state", () => {
    expect(eventJsonLd(event({ recurrence: "recurring", start: undefined, schedule: "Tuesdays" }), opts)).toBeUndefined();
  });

  it("is omitted for a run with no start, which would carry only an end date", () => {
    expect(eventJsonLd(event({ recurrence: "limited-run", start: undefined, end: "2026-10-31" }), opts)).toBeUndefined();
  });
});

describe("eventJsonLd's fields for Google's Event result", () => {
  it("states a scheduled, in-person event with the share image", () => {
    expect(eventJsonLd(event(), opts)).toMatchObject({
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      image: ["https://www.kcthisweek.com/og.png"],
    });
  });

  it("describes the event with the page's description text, then the why-line", () => {
    expect(eventJsonLd(event({ whyLine: "Rare." }), { ...opts, description: "A band plays." })).toMatchObject({ description: "A band plays. Rare." });
    expect(eventJsonLd(event(), { ...opts, description: "A band plays." })).toMatchObject({ description: "A band plays." });
    expect(eventJsonLd(event({ whyLine: "Rare." }), opts)).toMatchObject({ description: "Rare." });
  });

  it("falls back to the date-and-place sentence, so the description is never empty (#189)", () => {
    expect(eventJsonLd(event(), opts)).toMatchObject({ description: "Friday, October 9, 7:00 pm at recordBar." });
  });

  it("names the venue as organizer when the event was read from the venue's own site (#189)", () => {
    const venue = { slug: "recordbar", name: "recordBar", url: "https://www.therecordbar.com/" };
    expect(eventJsonLd(event(), { ...opts, venue })).toMatchObject({ organizer: { "@type": "Organization", name: "recordBar", url: "https://www.therecordbar.com/" } });
  });

  it("names no organizer when the page was elsewhere, or the venue's row has no site", () => {
    const venue = { slug: "recordbar", name: "recordBar", url: "https://www.therecordbar.com/" };
    expect(eventJsonLd(event({ primaryUrl: "https://www.kansascitymusic.com/calendar" }), { ...opts, venue })).not.toHaveProperty("organizer");
    expect(eventJsonLd(event(), { ...opts, venue: { slug: "recordbar", name: "recordBar" } })).not.toHaveProperty("organizer");
    expect(eventJsonLd(event(), opts)).not.toHaveProperty("organizer");
  });

  it("names the place with its neighborhood and addresses it to the city", () => {
    expect(eventJsonLd(event(), opts)).toMatchObject({
      location: { "@type": "Place", name: "recordBar, Crossroads", address: { "@type": "PostalAddress", addressLocality: "Kansas City", addressRegion: "MO", addressCountry: "US" } },
    });
  });

  it("gives the street address and position when the venue's table row has them (#137)", () => {
    const venue = {
      slug: "recordbar", name: "recordBar",
      address: { street: "1544 Grand Blvd", locality: "Kansas City", region: "MO" as const, postalCode: "64108" },
      geo: { lat: 39.0921, lng: -94.5813 },
    };
    expect((eventJsonLd(event(), { ...opts, venue }) as { location: object }).location).toEqual({
      "@type": "Place",
      name: "recordBar, Crossroads",
      address: { "@type": "PostalAddress", streetAddress: "1544 Grand Blvd", addressLocality: "Kansas City", addressRegion: "MO", postalCode: "64108", addressCountry: "US" },
      geo: { "@type": "GeoCoordinates", latitude: 39.0921, longitude: -94.5813 },
    });
  });

  it("addresses the place to the city when the venue's page has no row", () => {
    expect(eventJsonLd(event(), { ...opts, venue: { slug: "recordbar", name: "recordBar" } })).toMatchObject({
      location: { address: { addressLocality: "Kansas City", addressRegion: "MO" } },
    });
  });

  it("names the venue, not the room the page named (#91)", () => {
    const e = event({ venue: "Kauffman Center for the Performing Arts", room: "Helzberg Hall", neighborhood: "Downtown" });
    expect(eventJsonLd(e, opts)).toMatchObject({ location: { name: "Kauffman Center for the Performing Arts, Downtown" } });
  });
});

describe("organizerLd", () => {
  const venue = { slug: "lied-center", name: "Lied Center", url: "https://lied.ku.edu/" };

  it("matches the venue's site with or without www, and its subdomains", () => {
    expect(organizerLd(event({ primaryUrl: "https://lied.ku.edu/events" }), venue)).toBeDefined();
    expect(organizerLd(event({ primaryUrl: "https://www.lied.ku.edu/events" }), venue)).toBeDefined();
    expect(organizerLd(event({ primaryUrl: "https://tickets.lied.ku.edu/e/1" }), venue)).toBeDefined();
  });

  it("does not take a parent domain, or a host that merely ends in the same letters, for the venue's", () => {
    expect(organizerLd(event({ primaryUrl: "https://ku.edu/events" }), venue)).toBeUndefined();
    expect(organizerLd(event({ primaryUrl: "https://notlied.ku.edu/events" }), venue)).toBeUndefined();
  });
});

describe("postalAddress", () => {
  it("puts a Kansas City neighborhood in Kansas City, Missouri", () => {
    expect(postalAddress(event({ neighborhood: "Waldo", region: "Central KC" }))).toEqual({ addressLocality: "Kansas City", addressRegion: "MO" });
  });

  it("gives a suburb its own city, but the Northland and Kansas City, Kansas are Kansas City", () => {
    expect(postalAddress(event({ neighborhood: "Overland Park", region: "Johnson County" }))).toEqual({ addressLocality: "Overland Park", addressRegion: "KS" });
    expect(postalAddress(event({ neighborhood: "Lawrence", region: "Lawrence" }))).toEqual({ addressLocality: "Lawrence", addressRegion: "KS" });
    expect(postalAddress(event({ neighborhood: "Kansas City, Kansas", region: "Kansas City, Kansas" }))).toEqual({ addressLocality: "Kansas City", addressRegion: "KS" });
    expect(postalAddress(event({ neighborhood: "Northland", region: "Northland" }))).toEqual({ addressLocality: "Kansas City", addressRegion: "MO" });
  });

  it("states no city or state for the catch-all, which spans both states and reaches outside the city", () => {
    // Powell Gardens is in Kingsville, thirty miles east: "Kansas City" would be a false address, worse than none.
    expect(postalAddress(event({ neighborhood: "Elsewhere in the metro", region: "Elsewhere in the metro" }))).toEqual({});
  });

  it("has an address for every region the config names but the catch-all", () => {
    const named = meta.regions.slice(0, -1); // the config's regions, then the catch-all (PublishedMeta.regions)
    expect(Object.keys(siteConfig.regionAddress).sort()).toEqual([...named].sort());
  });
});

describe("frontPageJsonLd", () => {
  const origin = "https://www.kcthisweek.com";

  it("declares the site with a search action into the explorer", () => {
    const ld = frontPageJsonLd([], origin, "2026-10-19T06:40:12-05:00") as { "@graph": object[] };
    expect(ld["@graph"][0]).toMatchObject({
      "@type": "WebSite",
      url: "https://www.kcthisweek.com/",
      dateModified: "2026-10-19T06:40:12-05:00",
      potentialAction: {
        "@type": "SearchAction",
        target: { urlTemplate: "https://www.kcthisweek.com/explore?when=all&q={search_term_string}" },
        "query-input": "required name=search_term_string",
      },
    });
  });

  it("lists the picks' pages in order, leaving out a pick whose page has no Event JSON-LD", () => {
    const startless = event({ id: "evt_run", recurrence: "limited-run", start: undefined, end: "2026-10-31" });
    const ld = frontPageJsonLd([event({ id: "evt_a" }), startless, event({ id: "evt_b" })], origin, "2026-10-19T06:40:12-05:00") as { "@graph": object[] };
    expect(ld["@graph"][1]).toMatchObject({
      "@type": "ItemList",
      name: "Picks",
      dateModified: "2026-10-19T06:40:12-05:00",
      itemListElement: [
        { "@type": "ListItem", position: 1, url: "https://www.kcthisweek.com/e/evt_a" },
        { "@type": "ListItem", position: 2, url: "https://www.kcthisweek.com/e/evt_b" },
      ],
    });
  });
});
