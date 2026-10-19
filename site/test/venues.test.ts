// @vitest-environment node
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildVenues, readVenueTable, type VenueRow } from "../src/build/venues";
import { loadPublished } from "../src/build/load-dataset";
import { addressLine, mapUrl, NOTHING_LISTED, venueDirectory, venueJsonLd, venuePath, venueSlug } from "../src/lib/venues";
import { activeEvent, configYaml, dataset, write } from "./fixtures/dataset";
import { event } from "./fixtures/event";
import { tempDir } from "./fixtures/temp-dir";

const aliases = { "Kauffman Center for the Performing Arts": ["Kauffman Center", "Helzberg Hall"] };

function table(yaml: string): string {
  const path = join(tempDir("kc-venues-"), "venues.yaml");
  writeFileSync(path, yaml);
  return path;
}

const kauffman: VenueRow = {
  name: "Kauffman Center for the Performing Arts",
  address: { street: "1601 Broadway Blvd", locality: "Kansas City", region: "MO", postalCode: "64108" },
  geo: { lat: 39.0937, lng: -94.5857 },
  url: "https://www.kauffmancenter.org/",
};

describe("venueSlug", () => {
  it("is the name in lowercase words joined by dashes", () => {
    expect(venueSlug("Kauffman Center for the Performing Arts")).toBe("kauffman-center-for-the-performing-arts");
    expect(venueSlug("Kansas City Zoo & Aquarium")).toBe("kansas-city-zoo-aquarium");
    expect(venueSlug("Central Library (Kansas City Public Library)")).toBe("central-library-kansas-city-public-library");
  });

  it("drops a leading The and apostrophes, and ignores case, so spellings of one venue are one page", () => {
    expect(venueSlug("The Truman")).toBe(venueSlug("Truman"));
    expect(venueSlug("ZHOU B ART CENTER KC")).toBe(venueSlug("Zhou B Art Center KC"));
    expect(venueSlug("Mildred’s")).toBe("mildreds");
    expect(venueSlug("St. Paul's Episcopal Church")).toBe("st-pauls-episcopal-church");
  });

  it("keeps a The that is not the first word", () => {
    expect(venueSlug("Theatre in the Park")).toBe("theatre-in-the-park");
  });

  it("is the page's path under /v/", () => {
    expect(venuePath("The Truman")).toBe("/v/truman");
  });
});

describe("readVenueTable", () => {
  it("reads a row, splitting its address", () => {
    const rows = readVenueTable(table(`
- name: Kauffman Center for the Performing Arts
  address: 1601 Broadway Blvd, Kansas City, MO 64108
  lat: 39.0937
  lng: -94.5857
  url: https://www.kauffmancenter.org/
`));
    expect(rows).toEqual([kauffman]);
  });

  it("takes a row with an address alone", () => {
    expect(readVenueTable(table("- name: recordBar\n  address: 1544 Grand Blvd, Kansas City, MO 64108\n"))).toEqual([
      { name: "recordBar", address: { street: "1544 Grand Blvd", locality: "Kansas City", region: "MO", postalCode: "64108" } },
    ]);
  });

  it("takes a district's row with a position and no address", () => {
    expect(readVenueTable(table("- name: Crossroads Arts District\n  lat: 39.0901\n  lng: -94.5837\n"))).toEqual([
      { name: "Crossroads Arts District", geo: { lat: 39.0901, lng: -94.5837 } },
    ]);
  });

  it("refuses a row with neither an address nor a position", () => {
    expect(() => readVenueTable(table("- name: recordBar\n  url: https://www.therecordbar.com/\n"))).toThrow(/row "recordBar": row has neither an address nor a position/);
  });

  it("has no rows when given no table", () => {
    expect(readVenueTable(undefined)).toEqual([]);
  });

  it("refuses a table path with no file there, so a moved table cannot drop every address unnoticed", () => {
    const path = join(tempDir("kc-venues-"), "absent.yaml");
    expect(() => readVenueTable(path)).toThrow(`no venue table at ${path}`);
  });

  it.each([
    ["an address not in the one shape", "  address: 1544 Grand Blvd, Kansas City MO 64108\n", /row "recordBar": address is not one line/],
    ["a state other than Missouri or Kansas", "  address: 1544 Grand Blvd, Kansas City, IA 64108\n", /address is not one line/],
    ["lat without lng", "  address: 1544 Grand Blvd, Kansas City, MO 64108\n  lat: 39.09\n", /has lat without lng/],
    ["a position outside the metro (a dropped sign)", "  address: 1544 Grand Blvd, Kansas City, MO 64108\n  lat: 39.09\n  lng: 94.58\n", /lng/],
    ["a key it does not know", "  address: 1544 Grand Blvd, Kansas City, MO 64108\n  slug: rb\n", /recordBar/],
    ["a URL that is not http or https", "  address: 1544 Grand Blvd, Kansas City, MO 64108\n  url: javascript:alert(1)\n", /url is not an http or https URL/],
  ])("refuses %s, naming the row", (_, rest, message) => {
    expect(() => readVenueTable(table(`- name: recordBar\n${rest}`))).toThrow(message);
  });

  it("names a row without a name by its place in the list", () => {
    expect(() => readVenueTable(table("- address: 1544 Grand Blvd, Kansas City, MO 64108\n"))).toThrow(/venue table row 1:/);
  });
});

describe("buildVenues", () => {
  const build = (over: Partial<Parameters<typeof buildVenues>[0]> = {}) =>
    buildVenues({ rows: [], events: [], recordVenues: [], aliases, ...over });

  it("makes a page for every venue a published event is at, by name, from its events alone", () => {
    const venues = build({
      events: [
        event({ id: "evt_a", venue: "recordBar" }),
        event({ id: "evt_b", venue: "The Truman", neighborhood: "Midtown" }),
        event({ id: "evt_c", venue: "recordBar" }),
      ],
    });
    expect(venues).toEqual([
      { slug: "recordbar", name: "recordBar", neighborhood: "Crossroads", region: "Central KC" },
      { slug: "truman", name: "The Truman", neighborhood: "Midtown", region: "Central KC" },
    ]);
  });

  it("puts spellings of one venue on one page, named as most of its events name it", () => {
    const venues = build({
      events: [
        event({ id: "evt_a", venue: "ZHOU B ART CENTER KC" }),
        event({ id: "evt_b", venue: "Zhou B Art Center KC" }),
        event({ id: "evt_c", venue: "Zhou B Art Center KC" }),
      ],
    });
    expect(venues.map((v) => [v.slug, v.name])).toEqual([["zhou-b-art-center-kc", "Zhou B Art Center KC"]]);
  });

  it("gives a venue with a row its address, position, and site, under the row's name", () => {
    const venues = build({ rows: [kauffman], events: [event({ venue: "KAUFFMAN CENTER FOR THE PERFORMING ARTS", neighborhood: "Downtown" })] });
    expect(venues).toEqual([{ slug: "kauffman-center-for-the-performing-arts", ...kauffman, neighborhood: "Downtown", region: "Central KC" }]);
  });

  it("makes a page for a row whose venue has nothing coming up", () => {
    const venues = build({ rows: [{ name: "recordBar", address: kauffman.address }], recordVenues: ["recordBar"] });
    expect(venues).toEqual([{ slug: "recordbar", name: "recordBar", address: kauffman.address }]);
  });

  it("takes a row for a venueAliases entry no event is at", () => {
    expect(build({ rows: [kauffman] }).map((v) => v.name)).toEqual([kauffman.name]);
  });

  it("knows a venue by any record in the dataset, as the site names it", () => {
    expect(build({ rows: [{ ...kauffman }], recordVenues: ["Helzberg Hall"], aliases: { [kauffman.name]: ["Helzberg Hall"] } })).toHaveLength(1);
  });

  it("refuses a row keyed on an alias, naming the venue to key it on", () => {
    expect(() => build({ rows: [{ ...kauffman, name: "Kauffman Center" }] })).toThrow('venue table row "Kauffman Center" is a name venueAliases files under "Kauffman Center for the Performing Arts"; key the row on "Kauffman Center for the Performing Arts"');
    expect(() => build({ rows: [{ ...kauffman, name: "Helzberg Hall" }] })).toThrow(/key the row on "Kauffman Center for the Performing Arts"/);
  });

  it("refuses a row for a venue nothing in the dataset or the aliases names", () => {
    expect(() => build({ rows: [{ ...kauffman, name: "Knuckleheads" }], recordVenues: ["recordBar"] })).toThrow('venue table row "Knuckleheads" names no venue: no event in the dataset is at it, as spelled, and venueAliases has no entry for it');
  });

  it("refuses a row spelled other than the site spells the venue", () => {
    expect(() => build({ rows: [{ ...kauffman, name: "the truman" }], recordVenues: ["The Truman"] })).toThrow(/"the truman" names no venue/);
  });

  it("refuses two rows for one page", () => {
    const rows = [{ ...kauffman, name: "The Truman" }, { ...kauffman, name: "Truman" }];
    expect(() => build({ rows, recordVenues: ["The Truman", "Truman"] })).toThrow('venue table rows "The Truman" and "Truman" are one venue page, /v/truman; keep one');
  });

  it("refuses a venue name with nothing to make a slug from", () => {
    expect(() => build({ events: [event({ venue: "★" })] })).toThrow(/no letter or digit/);
  });
});

describe("venueDirectory", () => {
  const venue = (slug: string, name: string, region?: string) => ({ slug, name, ...(region !== undefined && { neighborhood: region, region }) });

  it("lists venues under their region in the config's order, by slug within it, with their event counts", () => {
    const groups = venueDirectory(
      [venue("truman", "The Truman", "Central KC"), venue("granada", "The Granada", "Lawrence"), venue("recordbar", "recordBar", "Central KC")],
      [event({ id: "evt_a", venue: "recordBar" }), event({ id: "evt_b", venue: "The Truman" }), event({ id: "evt_c", venue: "recordBar" }), event({ id: "evt_d", venue: "The Granada" })],
      ["Central KC", "Johnson County", "Lawrence"],
    );
    expect(groups.map((g) => [g.heading, g.venues.map((v) => `${v.venue.name} ${v.events}`)])).toEqual([
      ["Central KC", ["recordBar 2", "The Truman 1"]],
      ["Lawrence", ["The Granada 1"]],
    ]);
  });

  it("lists a venue with a row and nothing coming up last, under its own heading", () => {
    const groups = venueDirectory([venue("kauffman", "Kauffman Center"), venue("recordbar", "recordBar", "Central KC")], [event()], ["Central KC"]);
    expect(groups.map((g) => [g.heading, g.venues.map((v) => v.venue.name)])).toEqual([
      ["Central KC", ["recordBar"]],
      [NOTHING_LISTED, ["Kauffman Center"]],
    ]);
  });
});

describe("venue helpers", () => {
  it("writes the address on one line", () => {
    expect(addressLine(kauffman.address!)).toBe("1601 Broadway Blvd, Kansas City, MO 64108");
  });

  it("searches the map by name and address, so it opens the venue's listing, not a bare pin", () => {
    expect(mapUrl({ slug: "k", ...kauffman })).toBe(
      "https://www.google.com/maps/search/?api=1&query=Kauffman%20Center%20for%20the%20Performing%20Arts%2C%201601%20Broadway%20Blvd%2C%20Kansas%20City%2C%20MO%2064108",
    );
  });

  it("searches the map by position for a row with no address, and has no map for a venue with neither", () => {
    expect(mapUrl({ slug: "crossroads", name: "Crossroads Arts District", geo: { lat: 39.0901, lng: -94.5837 } })).toBe("https://www.google.com/maps/search/?api=1&query=39.0901,-94.5837");
    expect(mapUrl({ slug: "recordbar", name: "recordBar" })).toBeUndefined();
  });

  it("describes a venue with a row as a Place with its address, position, and site", () => {
    const ld = venueJsonLd({ slug: "kauffman-center-for-the-performing-arts", ...kauffman }, "https://www.kcthisweek.com/v/kauffman-center-for-the-performing-arts");
    expect(ld).toEqual({
      "@context": "https://schema.org",
      "@type": "Place",
      "@id": "https://www.kcthisweek.com/v/kauffman-center-for-the-performing-arts",
      name: "Kauffman Center for the Performing Arts",
      address: { "@type": "PostalAddress", streetAddress: "1601 Broadway Blvd", addressLocality: "Kansas City", addressRegion: "MO", postalCode: "64108", addressCountry: "US" },
      geo: { "@type": "GeoCoordinates", latitude: 39.0937, longitude: -94.5857 },
      url: "https://www.kauffmancenter.org/",
    });
  });

  it("describes a venue without one by its name alone", () => {
    expect(venueJsonLd({ slug: "recordbar", name: "recordBar" }, "https://www.kcthisweek.com/v/recordbar")).toEqual({
      "@context": "https://schema.org", "@type": "Place", "@id": "https://www.kcthisweek.com/v/recordbar", name: "recordBar",
    });
  });
});

describe("loadPublished's venues", () => {
  it("reads the table beside the dataset and keys it on the venue as the site shows it", () => {
    const config = `${configYaml}venueAliases:\n  ${kauffman.name}: [Helzberg Hall]\n`;
    const paths = write(dataset([activeEvent({ venue: "Helzberg Hall", neighborhood: "Downtown" }), activeEvent({ id: "evt_000000000002" })]), config);
    const venuesPath = table(`- name: ${kauffman.name}\n  address: 1601 Broadway Blvd, Kansas City, MO 64108\n`);
    const p = loadPublished({ ...paths, venuesPath });
    expect(p.venues.map((v) => [v.slug, v.address?.street])).toEqual([
      ["kauffman-center-for-the-performing-arts", "1601 Broadway Blvd"],
      ["recordbar", undefined],
    ]);
  });

  it("fails the build on a row that names an alias", () => {
    const config = `${configYaml}venueAliases:\n  ${kauffman.name}: [Helzberg Hall]\n`;
    const paths = write(dataset([activeEvent()]), config);
    expect(() => loadPublished({ ...paths, venuesPath: table("- name: Helzberg Hall\n  address: 1601 Broadway Blvd, Kansas City, MO 64108\n") })).toThrow(/key the row on/);
  });
});
