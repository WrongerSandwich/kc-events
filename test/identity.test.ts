import { describe, expect, it } from "vitest";
import { findMatch, normalizeName, sameVenue } from "../src/identity.js";

const CALENDAR = "https://venue.test/calendar";

const known = {
  primaryUrl: CALENDAR,
  title: "Big Show",
  venue: "Knuckleheads Saloon",
  start: "2026-10-10T20:00:00-05:00",
};

describe("event identity", () => {
  it("normalization ignores case, punctuation, and whitespace", () => {
    expect(normalizeName("  BIG   Show!! ")).toBe(normalizeName("big show"));
    expect(normalizeName("Rock & Roll: Live")).toBe(normalizeName("rock roll live"));
  });

  it("the same primary URL and title match, even when the date moved", () => {
    const moved = { ...known, title: "big show.", start: "2026-11-20T20:00:00-06:00" };
    expect(findMatch(moved, [known])).toBe(known);
  });

  it("a shared calendar URL with a different title is a new event", () => {
    expect(findMatch({ ...known, title: "Other Band" }, [known])).toBeUndefined();
  });

  it("the same title and venue with a date two days off match from a different page", () => {
    const elsewhere = { primaryUrl: "https://promoter.test/big-show", title: "BIG SHOW", venue: "knuckleheads saloon", start: "2026-10-12" };
    expect(findMatch(elsewhere, [known])).toBe(known);
  });

  it("the same title and venue more than a few days apart, or at a different venue, do not match from a different page", () => {
    const elsewhere = { primaryUrl: "https://promoter.test/big-show", title: "Big Show", venue: "Knuckleheads Saloon" };
    expect(findMatch({ ...elsewhere, start: "2026-10-17" }, [known])).toBeUndefined();
    expect(findMatch({ ...elsewhere, venue: "recordBar", start: "2026-10-10" }, [known])).toBeUndefined();
    expect(findMatch({ ...elsewhere }, [known])).toBeUndefined();
  });

  it("a title the page gives in full one week and cut short the next matches at the same venue and date", () => {
    const full = { ...known, title: "“At the Heart of Kansas City” / UMKC Conservatory Symphony Orchestra and Choirs" };
    const short = { ...known, title: "“At the Heart of Kansas City”" };
    expect(findMatch(short, [full])).toBe(full);
    expect(findMatch(full, [short])).toBe(short);
    expect(findMatch({ ...short, title: "At the Heart" + "land" }, [full])).toBeUndefined();
  });

  it("an exact match wins over an earlier fuzzy one", () => {
    const fuzzy = { ...known, primaryUrl: "https://promoter.test/big-show" };
    expect(findMatch(known, [fuzzy, known])).toBe(known);
  });

  it("an exact match wins over a fuzzy one through a venue alias", () => {
    const fuzzy = { ...known, primaryUrl: "https://promoter.test/big-show", venue: "Knuckleheads Garage" };
    expect(findMatch(known, [fuzzy, known], { Knuckleheads: ["Knuckleheads Saloon", "Knuckleheads Garage"] })).toBe(known);
  });
});

/** The seed alias list from the run config, as #16 gave it. */
const ALIASES = {
  "Kauffman Center for the Performing Arts": ["Muriel Kauffman Theatre", "Helzberg Hall"],
  "Nelson-Atkins Museum of Art": ["Atkins Auditorium", "Tivoli Cinema"],
  "Kansas City Convention Center": ["Bartle Hall", "Bartle Exhibit Hall"],
};

describe("the same venue", () => {
  it("is a building and a room inside it when the alias list names both under one venue", () => {
    const room = { primaryUrl: "https://www.kauffmancenter.org/events/", title: "Wizard of Oz", venue: "Muriel Kauffman Theatre", start: "2026-10-16" };
    const building = { primaryUrl: "https://kcballet.org/", title: "Wizard of Oz", venue: "Kauffman Center for the Performing Arts", start: "2026-10-16" };
    expect(findMatch(building, [room], ALIASES)).toBe(room);
    expect(findMatch(building, [room])).toBeUndefined();
    expect(sameVenue("Tivoli Cinema", "Atkins Auditorium", ALIASES)).toBe(true);
    expect(sameVenue("Tivoli Cinema", "Helzberg Hall", ALIASES)).toBe(false);
  });

  it("is a name contained in the other at word boundaries, with no alias needed", () => {
    const listed = { primaryUrl: "https://www.midlandkc.com/events", title: "Taking Back Sunday", venue: "The Midland", start: "2026-10-04T19:00:00-05:00" };
    const elsewhere = { ...listed, primaryUrl: "https://promoter.test/tbs", venue: "The Midland Theatre - MO" };
    expect(findMatch(elsewhere, [listed])).toBe(listed);
    expect(sameVenue("recordBar", "record", {})).toBe(false);
    expect(sameVenue("Midlands Pub", "The Midland", {})).toBe(false);
  });

  it("applies containment to alias entries too", () => {
    expect(sameVenue("Bartle Exhibit Hall (A – E)", "Kansas City Convention Center", ALIASES)).toBe(true);
    expect(sameVenue("Kauffman Center", "Helzberg Hall", ALIASES)).toBe(true);
  });

  it("is not two different bars that share nothing but a word", () => {
    const a = { primaryUrl: "https://bara.test/", title: "Open Mic", venue: "Bar A", start: "2026-10-14" };
    const b = { primaryUrl: "https://barb.test/", title: "Open Mic", venue: "Bar B", start: "2026-10-14" };
    expect(findMatch(b, [a], ALIASES)).toBeUndefined();
  });
});

describe("a sighting with no venue", () => {
  const kauffman = { primaryUrl: "https://www.kauffmancenter.org/events/", title: "Interstellar Live", venue: "Helzberg Hall", start: "2026-10-23", status: "active" as const };
  const venueless = { primaryUrl: "https://www.kcsymphony.org/upcoming-events/", title: "Interstellar Live", start: "2026-10-23" };

  it("matches the one known event with that title on that calendar date", () => {
    expect(findMatch(venueless, [kauffman])).toBe(kauffman);
    expect(findMatch({ ...venueless, start: "2026-10-23T19:00:00-05:00" }, [kauffman])).toBe(kauffman);
    expect(findMatch({ ...venueless, start: "2026-10-24" }, [kauffman])).toBeUndefined();
  });

  it("matches none when two known events qualify", () => {
    const other = { ...kauffman, primaryUrl: "https://other.test/", venue: "Starlight Theatre" };
    expect(findMatch(venueless, [kauffman, other])).toBeUndefined();
  });

  it("counts only events not expired as candidates", () => {
    const expired = { ...kauffman, primaryUrl: "https://other.test/", venue: "Starlight Theatre", status: "expired" as const };
    expect(findMatch(venueless, [expired, kauffman])).toBe(kauffman);
    expect(findMatch(venueless, [expired])).toBeUndefined();
  });

  it("never matches a recurring event, which has no date", () => {
    const recurring = { primaryUrl: "https://bar.test/", title: "Trivia Night", venue: "Bar A" };
    expect(findMatch({ primaryUrl: "https://elsewhere.test/", title: "Trivia Night" }, [recurring])).toBeUndefined();
  });
});
