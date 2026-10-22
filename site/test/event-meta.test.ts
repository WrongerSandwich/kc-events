import { describe, expect, it } from "vitest";
import { eventDescription, eventJsonLd, frontPageJsonLd, postalAddress } from "../src/lib/event-meta";
import { siteConfig } from "../src/site.config";
import { meta } from "../src/generated/meta";
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

const opts = { image: "https://www.kcthisweek.com/og.png" };

describe("eventJsonLd", () => {
  it("names a one-off's start and end", () => {
    const ld = eventJsonLd(event({ end: "2026-10-09T22:00:00-05:00" }), opts)!;
    expect(ld).toMatchObject({ "@type": "Event", name: "A show", startDate: "2026-10-09T19:00:00-05:00", endDate: "2026-10-09T22:00:00-05:00" });
  });

  it("points at the event's own page when there is one, else the primary page", () => {
    expect(eventJsonLd(event({ eventUrl: "https://www.therecordbar.com/shows/a-show" }), opts)).toMatchObject({ url: "https://www.therecordbar.com/shows/a-show" });
    expect(eventJsonLd(event(), opts)).toMatchObject({ url: "https://www.therecordbar.com/shows" });
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
    expect(eventJsonLd(event(), opts)).not.toHaveProperty("description");
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
    expect(eventDescription(e, today)).toBe("Friday, October 9, 7:00 pm at Kauffman Center for the Performing Arts · Helzberg Hall, Downtown.");
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
    const ld = frontPageJsonLd([], origin) as { "@graph": object[] };
    expect(ld["@graph"][0]).toMatchObject({
      "@type": "WebSite",
      url: "https://www.kcthisweek.com/",
      potentialAction: {
        "@type": "SearchAction",
        target: { urlTemplate: "https://www.kcthisweek.com/explore?q={search_term_string}" },
        "query-input": "required name=search_term_string",
      },
    });
  });

  it("lists the picks' pages in order, leaving out a pick whose page has no Event JSON-LD", () => {
    const startless = event({ id: "evt_run", recurrence: "limited-run", start: undefined, end: "2026-10-31" });
    const ld = frontPageJsonLd([event({ id: "evt_a" }), startless, event({ id: "evt_b" })], origin) as { "@graph": object[] };
    expect(ld["@graph"][1]).toMatchObject({
      "@type": "ItemList",
      itemListElement: [
        { "@type": "ListItem", position: 1, url: "https://www.kcthisweek.com/e/evt_a" },
        { "@type": "ListItem", position: 2, url: "https://www.kcthisweek.com/e/evt_b" },
      ],
    });
  });
});
