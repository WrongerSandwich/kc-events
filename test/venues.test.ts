import { describe, expect, it } from "vitest";
import { parseVenueTable, venueNeighborhoods } from "../src/venues.js";

const config = {
  neighborhoods: { "Central KC": ["Westport", "Crossroads"], Lawrence: ["Lawrence"] },
  venueAliases: { "Kauffman Center for the Performing Arts": ["Kauffman Center", "Helzberg Hall"] },
};
const recordBar = { name: "recordBar", address: "1544 Grand Blvd, Kansas City, MO 64108" };

describe("parseVenueTable (ADR 0013, #258)", () => {
  it("reads a row with an address, a position, a site and a neighborhood", () => {
    const row = { ...recordBar, lat: 39.0937, lng: -94.5857, url: "https://www.therecordbar.com/", neighborhood: "Crossroads" };
    expect(parseVenueTable([row], config)).toEqual([row]);
  });

  it("takes a row with an address alone, and a district's row with a position and no address", () => {
    expect(parseVenueTable([recordBar, { name: "Crossroads Arts District", lat: 39.0901, lng: -94.5837 }], config)).toEqual([
      recordBar,
      { name: "Crossroads Arts District", lat: 39.0901, lng: -94.5837 },
    ]);
  });

  it("is no rows for an empty or absent body", () => {
    expect(parseVenueTable(undefined, config)).toEqual([]);
    expect(parseVenueTable(null, config)).toEqual([]);
  });

  it("refuses a body that is not a list of rows", () => {
    expect(() => parseVenueTable({ name: "recordBar" }, config)).toThrow(/not a list of venue rows/);
  });

  it.each([
    ["neither an address nor a position", { name: "recordBar", url: "https://www.therecordbar.com/" }, /row "recordBar": row has neither an address nor a position/],
    ["an address not in the one shape", { name: "recordBar", address: "1544 Grand Blvd, Kansas City MO 64108" }, /row "recordBar": address is not one line/],
    ["a state other than Missouri or Kansas", { name: "recordBar", address: "1544 Grand Blvd, Kansas City, IA 64108" }, /address is not one line/],
    ["lat without lng", { ...recordBar, lat: 39.09 }, /has lat without lng/],
    ["a position outside the metro (a dropped sign)", { ...recordBar, lat: 39.09, lng: 94.58 }, /lng/],
    ["a key it does not know", { ...recordBar, slug: "rb" }, /recordBar/],
    ["a URL that is not http or https", { ...recordBar, url: "javascript:alert(1)" }, /url is not an http or https URL/],
    ["an empty neighborhood", { ...recordBar, neighborhood: " " }, /neighborhood/],
  ])("refuses %s, naming the row", (_, row, message) => {
    expect(() => parseVenueTable([row], config)).toThrow(message);
  });

  it("names a row without a name by its place in the list", () => {
    expect(() => parseVenueTable([recordBar, { address: "1544 Grand Blvd, Kansas City, MO 64108" }], config)).toThrow(/venue table row 2:/);
  });

  it("refuses a neighborhood no region lists, naming the row", () => {
    expect(() => parseVenueTable([{ ...recordBar, neighborhood: "Topeka" }], config)).toThrow(/row "recordBar".*"Topeka".*no region lists/);
  });

  it("refuses the catch-all as a neighborhood, naming the row", () => {
    expect(() => parseVenueTable([{ ...recordBar, neighborhood: "Elsewhere in the metro" }], config)).toThrow(/row "recordBar".*catch-all/);
  });

  it("refuses a row keyed on a name venueAliases files under another venue, naming the key to use", () => {
    expect(() => parseVenueTable([{ name: "Helzberg Hall", address: "1601 Broadway Blvd, Kansas City, MO 64108" }], config)).toThrow(
      'venue table row "Helzberg Hall" is a name venueAliases files under "Kauffman Center for the Performing Arts"; key the row on "Kauffman Center for the Performing Arts"',
    );
  });

  it("refuses two rows for one venue, spelled alike or not", () => {
    expect(() => parseVenueTable([recordBar, { name: "RecordBar", address: "1544 Grand Blvd, Kansas City, MO 64108" }], config)).toThrow(
      'venue table rows "recordBar" and "RecordBar" are one venue; keep one',
    );
  });
});

describe("venueNeighborhoods", () => {
  it("is each row with a neighborhood, by the venue's name", () => {
    const rows = parseVenueTable([{ ...recordBar, neighborhood: "Crossroads" }, { name: "The Bottleneck", address: "737 New Hampshire St, Lawrence, KS 66044" }], config);
    expect(venueNeighborhoods(rows)).toEqual({ recordBar: "Crossroads" });
  });
});
