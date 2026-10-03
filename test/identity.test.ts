import { describe, expect, it } from "vitest";
import { findMatch, normalizeName } from "../src/identity.js";

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
});
