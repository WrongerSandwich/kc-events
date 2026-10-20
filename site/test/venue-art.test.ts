import { describe, expect, it } from "vitest";
import { venues } from "../src/generated/venues";
import { ART_CUTOFF, ART_MIN_RECORDS, illustrationColours, venueArt } from "../src/lib/venue-art";

const order = ["music", "theater/dance", "comedy", "art/exhibitions", "festivals/markets", "food/drink", "sports", "film", "talks/readings", "outdoors/community", "other"];

describe("illustrationColours", () => {
  it("gives every group the one kind of a single-kind venue", () => {
    expect(illustrationColours({ comedy: 8 }, order)).toEqual({ outline: "comedy", detail: "comedy", accent: "comedy" });
  });

  it("gives the groups the kinds by rank, the top kind the outline", () => {
    expect(illustrationColours({ music: 13, "theater/dance": 4, "talks/readings": 3, film: 2 }, order)).toEqual({ outline: "music", detail: "theater/dance", accent: "talks/readings" });
  });

  it("fills the accent with the top kind for a two-kind venue", () => {
    expect(illustrationColours({ film: 5, "art/exhibitions": 3 }, order)).toEqual({ outline: "film", detail: "art/exhibitions", accent: "film" });
  });

  it("leaves out a kind under the cutoff: a tenth of the records, and at least two of them", () => {
    expect(ART_CUTOFF).toBe(0.1);
    expect(ART_MIN_RECORDS).toBe(2);
    // 2 of 20 is at the cutoff and counts; 2 of 21 is under it; a lone record never counts, however few there are.
    expect(illustrationColours({ comedy: 18, other: 2 }, order)).toEqual({ outline: "comedy", detail: "other", accent: "comedy" });
    expect(illustrationColours({ comedy: 19, other: 2 }, order)).toEqual({ outline: "comedy", detail: "comedy", accent: "comedy" });
    expect(illustrationColours({ comedy: 8, other: 1 }, order)).toEqual({ outline: "comedy", detail: "comedy", accent: "comedy" });
    expect(illustrationColours({ comedy: 1, other: 1 }, order)).toEqual({ outline: "comedy", detail: "comedy", accent: "comedy" });
  });

  it("always takes the top kind, even a lone record", () => {
    expect(illustrationColours({ film: 1 }, order)).toEqual({ outline: "film", detail: "film", accent: "film" });
  });

  it("breaks a tie by the config's order of kinds", () => {
    expect(illustrationColours({ film: 3, music: 3, comedy: 3 }, order)).toEqual({ outline: "music", detail: "comedy", accent: "film" });
  });

  it("ignores a kind the config does not list, which has no colour token, and its records in the total", () => {
    expect(illustrationColours({ zines: 9, film: 2 }, order)).toEqual({ outline: "film", detail: "film", accent: "film" });
    expect(illustrationColours({ film: 18, music: 2, zines: 20 }, order)).toEqual({ outline: "film", detail: "music", accent: "film" });
  });

  it("is all grey for a venue with no record at all, or none of a listed kind", () => {
    expect(illustrationColours({}, order)).toEqual({ outline: "other", detail: "other", accent: "other" });
    expect(illustrationColours({ zines: 1 }, order)).toEqual({ outline: "other", detail: "other", accent: "other" });
  });
});

describe("venueArt", () => {
  it("has a drawing for the three pilot venues, each with the three role groups and no colour of its own", () => {
    expect(Object.keys(venueArt).sort()).toEqual(["bird-comedy-theater", "kauffman-center-for-the-performing-arts", "nelson-atkins-museum-of-art"]);
    // Each keyed on a page the committed dataset and venue table make, so a drawing cannot go unshown by a slug.
    for (const slug of Object.keys(venueArt)) expect(venues.map((v) => v.slug), slug).toContain(slug);
    for (const art of Object.values(venueArt)) {
      expect(art.viewBox).toMatch(/^0 0 \d+ \d+$/);
      for (const role of ["outline", "detail", "accent"] as const) {
        expect(art[role], role).toMatch(/^<(path|circle|rect|line|ellipse|polyline)\b/);
        expect(art[role]).not.toMatch(/stroke=|fill=|style=|class=|<svg|<g\b/);
      }
      // Rounded coordinates, nothing from an editor, and a size a header can carry.
      expect(art.outline + art.detail + art.accent).not.toMatch(/\d\.\d\d|inkscape|sodipodi|xmlns/);
      expect(art.outline.length + art.detail.length + art.accent.length).toBeLessThan(1500);
    }
  });
});
