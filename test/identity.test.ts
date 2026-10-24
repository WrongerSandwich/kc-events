import { describe, expect, it } from "vitest";
import { pageKey, samePage } from "../src/hosts.js";
import type { EventIdentity } from "../src/identity.js";
import { aliasedVenue, findMatch, genericVenueName, matchSighting, nearDates, normalizeName, ruledTitle, sameEvent, sameVenue, venueAndRoom } from "../src/identity.js";

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
    expect(findMatch(moved, [known], {})).toBe(known);
  });

  it("a shared calendar URL with a different title is a new event", () => {
    expect(findMatch({ ...known, title: "Other Band" }, [known], {})).toBeUndefined();
  });

  it("the same title and venue with a date two days off match from a different page", () => {
    const elsewhere = { primaryUrl: "https://promoter.test/big-show", title: "BIG SHOW", venue: "knuckleheads saloon", start: "2026-10-12" };
    expect(findMatch(elsewhere, [known], {})).toBe(known);
  });

  it("the same title and venue more than a few days apart, or at a different venue, do not match from a different page", () => {
    const elsewhere = { primaryUrl: "https://promoter.test/big-show", title: "Big Show", venue: "Knuckleheads Saloon" };
    expect(findMatch({ ...elsewhere, start: "2026-10-17" }, [known], {})).toBeUndefined();
    expect(findMatch({ ...elsewhere, venue: "recordBar", start: "2026-10-10" }, [known], {})).toBeUndefined();
    expect(findMatch({ ...elsewhere }, [known], {})).toBeUndefined();
  });

  it("a title the page gives in full one week and cut short the next matches at the same venue and date", () => {
    const full = { ...known, title: "“At the Heart of Kansas City” / UMKC Conservatory Symphony Orchestra and Choirs" };
    const short = { ...known, title: "“At the Heart of Kansas City”" };
    expect(findMatch(short, [full], {})).toBe(full);
    expect(findMatch(full, [short], {})).toBe(short);
    expect(findMatch({ ...short, title: "At the Heart" + "land" }, [full], {})).toBeUndefined();
  });

  describe("a series name in front of the title", () => {
    // The 2026-10-05 dataset's WWI Museum twins (#32): one reading names the series, the other does not.
    const museum = { primaryUrl: "https://www.theworldwar.org/events", venue: "National WWI Museum and Memorial", start: "2026-10-21T18:30:00-05:00" };
    const prefixed = { ...museum, title: "Pershing Lecture Series | The Wars Before the War: The American Civil War" };
    const bare = { ...museum, title: "The Wars Before the War: The American Civil War" };

    it("matches the title without it, either way round, at the same venue and date", () => {
      expect(findMatch(bare, [prefixed], {})).toBe(prefixed);
      expect(findMatch(prefixed, [bare], {})).toBe(bare);
      expect(sameEvent(prefixed, bare, [prefixed, bare], {})).toBe(true);
    });

    it.each(["2026 Exchange Program Concert Series | KKS Youth Jazz Orchestra", "Concert Series: KKS Youth Jazz Orchestra", "Concert Series – KKS Youth Jazz Orchestra", "Concert Series — KKS Youth Jazz Orchestra", "Concert Series - KKS Youth Jazz Orchestra"])(
      "after any separator: %s",
      (title) => {
        const jazz = { ...museum, title: "KKS Youth Jazz Orchestra" };
        expect(findMatch(jazz, [{ ...museum, title }], {})).toBeDefined();
      },
    );

    it("does not merge two events in the same series", () => {
      const boer = { ...museum, title: "Pershing Lecture Series | The Wars Before the War: The Boer Wars" };
      expect(findMatch(boer, [prefixed], {})).toBeUndefined();
      expect(findMatch({ ...boer, title: "The Wars Before the War: The Boer Wars" }, [prefixed], {})).toBeUndefined();
    });

    it("needs a separator: a title that merely ends in the other's words is another event", () => {
      expect(findMatch({ ...museum, title: "Jazz Orchestra" }, [{ ...museum, title: "KKS Youth Jazz Orchestra" }], {})).toBeUndefined();
      expect(findMatch({ ...museum, title: "Orchestra" }, [{ ...museum, title: "Jazz-Orchestra" }], {})).toBeUndefined();
    });

    it("needs the same venue and the same calendar date, not just a nearby one", () => {
      expect(findMatch({ ...bare, venue: "Union Station" }, [prefixed], {})).toBeUndefined();
      expect(findMatch({ ...bare, start: "2026-10-23T18:30:00-05:00" }, [prefixed], {})).toBeUndefined();
      const openMic = { ...museum, title: "Open Mic", start: "2026-10-20T19:00:00-05:00" };
      expect(findMatch(openMic, [{ ...openMic, title: "Comedy Night: Open Mic", start: "2026-10-22T19:00:00-05:00" }], {})).toBeUndefined();
    });

    it("matches a venue-less sighting on that date too", () => {
      const { venue: _venue, ...venueless } = bare;
      expect(findMatch(venueless, [prefixed], {})).toBe(prefixed);
    });
  });

  it("an exact match wins over an earlier fuzzy one", () => {
    const fuzzy = { ...known, primaryUrl: "https://promoter.test/big-show" };
    expect(findMatch(known, [fuzzy, known], {})).toBe(known);
  });

  it("an exact match wins over a fuzzy one through a venue alias", () => {
    const fuzzy = { ...known, primaryUrl: "https://promoter.test/big-show", venue: "Knuckleheads Garage" };
    expect(findMatch(known, [fuzzy, known], { Knuckleheads: ["Knuckleheads Saloon", "Knuckleheads Garage"] })).toBe(known);
  });
});

/** The seed alias list from the run config, as #16 gave it, with the Kauffman short form #77 added. */
const ALIASES = {
  "Kauffman Center for the Performing Arts": ["Kauffman Center", "Muriel Kauffman Theatre", "Helzberg Hall"],
  "Nelson-Atkins Museum of Art": ["Atkins Auditorium", "Tivoli Cinema"],
  "Kansas City Convention Center": ["Bartle Hall", "Bartle Exhibit Hall"],
};

describe("the same venue", () => {
  it("is a building and a room inside it when the alias list names both under one venue", () => {
    const room = { primaryUrl: "https://www.kauffmancenter.org/events/", title: "Wizard of Oz", venue: "Muriel Kauffman Theatre", start: "2026-10-16" };
    const building = { primaryUrl: "https://kcballet.org/", title: "Wizard of Oz", venue: "Kauffman Center for the Performing Arts", start: "2026-10-16" };
    expect(findMatch(building, [room], ALIASES)).toBe(room);
    expect(findMatch(building, [room], {})).toBeUndefined();
    expect(sameVenue("Tivoli Cinema", "Atkins Auditorium", ALIASES)).toBe(true);
    expect(sameVenue("Tivoli Cinema", "Helzberg Hall", ALIASES)).toBe(false);
  });

  it("is a name contained in the other at word boundaries, with no alias needed", () => {
    const listed = { primaryUrl: "https://www.midlandkc.com/events", title: "Taking Back Sunday", venue: "The Midland", start: "2026-10-04T19:00:00-05:00" };
    const elsewhere = { ...listed, primaryUrl: "https://promoter.test/tbs", venue: "The Midland Theatre - MO" };
    expect(findMatch(elsewhere, [listed], {})).toBe(listed);
    expect(sameVenue("recordBar", "record", {})).toBe(false);
    expect(sameVenue("Midlands Pub", "The Midland", {})).toBe(false);
  });

  it("goes by an alias entry with a label added, but a name shorter than the entry is not the entry (#77)", () => {
    expect(sameVenue("Bartle Exhibit Hall (A – E)", "Kansas City Convention Center", ALIASES)).toBe(true);
    expect(sameVenue("Kauffman Center", "Helzberg Hall", ALIASES)).toBe(true);
    const shortForms = { ...ALIASES, "Kauffman Center for the Performing Arts": ["Muriel Kauffman Theatre", "Helzberg Hall"] };
    expect(sameVenue("Kauffman Center", "Helzberg Hall", shortForms)).toBe(false);
    // "Kansas City" is in two alias groups' names; before #77 it was every venue in both.
    expect(sameVenue("Kansas City", "Bartle Hall", ALIASES)).toBe(false);
    expect(sameVenue("Kansas City", "Kansas City Power & Light", { "Kansas City Power & Light District": ["Kansas City Power & Light", "PBR Big Sky"] })).toBe(true);
    expect(sameVenue("Kansas City", "PBR Big Sky", { "Kansas City Power & Light District": ["Kansas City Power & Light", "PBR Big Sky"] })).toBe(false);
  });

  it("is the same words in another order, with no alias needed (#28)", () => {
    const calendar = {
      primaryUrl: "https://www.americanroyal.com/calendar/",
      title: "127th Livestock Show",
      venue: "New American Royal Campus",
      start: "2026-10-08",
      end: "2026-10-25",
    };
    const showPage = { ...calendar, primaryUrl: "https://www.americanroyal.com/events/fall-livestock-show/", venue: "American Royal New Campus", start: "2026-10-09" };
    expect(findMatch(showPage, [calendar], {})).toBe(calendar);
    expect(sameEvent(calendar, showPage, [calendar, showPage], {})).toBe(true);
    expect(sameVenue("The Hall at Union Station", "Union Station Hall", {})).toBe(false);
    expect(sameVenue("Royal American Campus", "American Royal New Campus", {})).toBe(false);
  });

  it("is not two rooms whose letter or number labels are swapped", () => {
    expect(sameVenue("Studio A Room B", "Studio B Room A", {})).toBe(false);
    expect(sameVenue("Hall 1, Level 2", "Hall 2, Level 1", {})).toBe(false);
  });

  it("applies word order to alias entries too", () => {
    expect(sameVenue("Hall Helzberg", "Kauffman Center for the Performing Arts", ALIASES)).toBe(true);
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
    expect(findMatch(venueless, [kauffman], {})).toBe(kauffman);
    expect(findMatch({ ...venueless, start: "2026-10-23T19:00:00-05:00" }, [kauffman], {})).toBe(kauffman);
    expect(findMatch({ ...venueless, start: "2026-10-24" }, [kauffman], {})).toBeUndefined();
  });

  it("matches none when two known events qualify", () => {
    const other = { ...kauffman, primaryUrl: "https://other.test/", venue: "Starlight Theatre" };
    expect(findMatch(venueless, [kauffman, other], {})).toBeUndefined();
  });

  it("counts only events not expired as candidates", () => {
    const expired = { ...kauffman, primaryUrl: "https://other.test/", venue: "Starlight Theatre", status: "expired" as const };
    expect(findMatch(venueless, [expired, kauffman], {})).toBe(kauffman);
    expect(findMatch(venueless, [expired], {})).toBeUndefined();
  });

  it("never matches a recurring event, which has no date", () => {
    const recurring = { primaryUrl: "https://bar.test/", title: "Trivia Night", venue: "Bar A" };
    expect(findMatch({ primaryUrl: "https://elsewhere.test/", title: "Trivia Night" }, [recurring], {})).toBeUndefined();
  });
});

describe("one page under several URLs (#77)", () => {
  const stored = { primaryUrl: "https://www.powerandlightdistrict.com/events", title: "PBR Outlaw Days Festival", venue: "PBR Big Sky", start: "2026-10-23T16:00:00-05:00" };

  it.each([
    ["without www.", "https://powerandlightdistrict.com/events"],
    ["over http", "http://www.powerandlightdistrict.com/events"],
    ["with a trailing slash", "https://www.powerandlightdistrict.com/events/"],
    ["with a fragment", "https://www.powerandlightdistrict.com/events#list"],
    ["in another case of host", "https://WWW.PowerAndLightDistrict.com/events"],
  ])("matches the same title on the same page written %s, whatever the venue and date", (_how, primaryUrl) => {
    const sighting = { primaryUrl, title: "PBR OUTLAW DAYS FESTIVAL", start: "2026-11-01" };
    expect(findMatch(sighting, [stored], {})).toBe(stored);
    expect(sameEvent(stored, { ...stored, primaryUrl }, [stored], {})).toBe(true);
  });

  it("keeps a query string and a path apart: some sites keep their events behind one", () => {
    const sighting = { title: stored.title, start: "2026-11-01" };
    expect(findMatch({ ...sighting, primaryUrl: "https://www.powerandlightdistrict.com/events?month=11" }, [stored], {})).toBeUndefined();
    expect(findMatch({ ...sighting, primaryUrl: "https://www.powerandlightdistrict.com/events/all" }, [stored], {})).toBeUndefined();
  });

  it("takes an unparseable URL as its own page", () => {
    expect(pageKey("not a url")).toBe("not a url");
    expect(samePage("not a url", "not a url")).toBe(true);
  });
});

describe("one title listed twice on one page (#77)", () => {
  const page = "https://www.kcwineco.com/events/upcoming-events";
  const early = { primaryUrl: page, title: "Dueling Pianos (FREE Show)", venue: "KC Wine Co", start: "2026-11-07T17:30:00-06:00" };
  const late = { ...early, start: "2026-11-27T17:30:00-06:00" };

  it("matches a sighting to the record whose date is nearest, and any record when none is near", () => {
    expect(findMatch({ ...early, start: "2026-11-26" }, [early, late], {})).toBe(late);
    expect(findMatch({ ...early, start: "2026-11-08" }, [late, early], {})).toBe(early);
    expect(findMatch({ ...early, start: "2026-12-20" }, [early, late], {})).toBe(late);
    expect(findMatch({ ...early, start: "2026-11-15" }, [late, early], {})).toBe(early);
    expect(findMatch({ ...early, start: undefined }, [late, early], {})).toBe(early);
  });

  describe("two records equally near the sighting (#177)", () => {
    const inEitherOrder = (sighting: EventIdentity, a: EventIdentity, b: EventIdentity) => [findMatch(sighting, [a, b], {}), findMatch(sighting, [b, a], {})];

    it("prefers the one whose venue is the sighting's, in either order", () => {
      // The property test's shrunk counterexample: both titles normalize to the sighting's "hall".
      const calendar = "https://a.test/calendar/";
      const theHall = { primaryUrl: calendar, title: "the  THE  Hall", venue: "!:théâtre", start: "2026-10-02" };
      const hall = { primaryUrl: calendar, title: "Hall", venue: ", jazz", start: "2026-10-06" };
      const sighting = { primaryUrl: calendar, title: "the  THE  Hall!", venue: "!:théâtre", start: "2026-10-04" };
      expect(inEitherOrder(sighting, theHall, hall)).toEqual([theHall, theHall]);
      expect(inEitherOrder(sighting, { ...hall, venue: "!:théâtre" }, { ...theHall, venue: ", jazz" })).toEqual([
        { ...hall, venue: "!:théâtre" },
        { ...hall, venue: "!:théâtre" },
      ]);
    });

    it("prefers the earlier start when neither venue is the sighting's, in either order", () => {
      const midway = { ...early, venue: "Somewhere Else", start: "2026-11-17" };
      expect(inEitherOrder(midway, early, late)).toEqual([early, early]);
    });

    it("picks the same record for an undated sighting, in either order", () => {
      const undated = { ...early, start: undefined };
      expect(inEitherOrder(undated, early, late)).toEqual([early, early]);
      const noDate = { ...late, start: undefined };
      expect(inEitherOrder(undated, late, noDate)).toEqual([late, late]);
      expect(inEitherOrder(undated, { ...early, id: "b" }, { ...early, id: "a" })).toEqual([{ ...early, id: "a" }, { ...early, id: "a" }]);
    });
  });

  it("is two records when their dates are outside the fuzzy window, one when inside", () => {
    expect(sameEvent(early, late, [early, late], {})).toBe(false);
    expect(sameEvent(early, { ...early, start: "2026-11-09" }, [early], {})).toBe(true);
    expect(sameEvent(early, { ...early, start: undefined }, [early], {})).toBe(true);
  });

  it("says whether two events' dates are near", () => {
    expect(nearDates(early, { ...early, start: "2026-11-10" })).toBe(true);
    expect(nearDates(early, { ...early, start: "2026-11-11" })).toBe(false);
    expect(nearDates(early, { ...early, start: undefined })).toBe(true);
  });
});

describe("a sighting with no venue and several candidates (#77)", () => {
  const kauffman = { primaryUrl: "https://www.kauffmancenter.org/events/", title: "Interstellar Live", venue: "Helzberg Hall", start: "2026-10-23", eventUrl: "https://tickets.kauffmancenter.org/overview/25068" };
  const twin = { primaryUrl: "https://www.kcsymphony.org/upcoming-events/", title: "Interstellar Live", start: "2026-10-23" };
  const sighting = { primaryUrl: "https://kcsymphony.org/", title: "Interstellar Live", start: "2026-10-23" };

  it("prefers the candidate on its own host, so a program's venue-less twin takes the program's sighting", () => {
    expect(findMatch(sighting, [kauffman, twin], {})).toBe(twin);
    expect(findMatch(sighting, [twin, kauffman], {})).toBe(twin);
  });

  it("then prefers the candidate with its own page", () => {
    const linked = { ...sighting, primaryUrl: "https://kclivearts.org/", eventUrl: "http://tickets.kauffmancenter.org/overview/25068/" };
    expect(findMatch(linked, [kauffman, twin], {})).toBe(kauffman);
  });

  it("prefers the candidate on its own page first: a twin on the sighting's page under a longer title", () => {
    const onPage = { ...twin, primaryUrl: "https://kcsymphony.org/", title: "Interstellar Live | Film with Orchestra" };
    expect(findMatch(sighting, [twin, onPage], {})).toBe(onPage);
  });

  it("is ambiguous when neither narrows the candidates to one, and matches none", () => {
    const elsewhere = { ...sighting, primaryUrl: "https://kclivearts.org/" };
    expect(findMatch(elsewhere, [kauffman, twin], {})).toBeUndefined();
    expect(matchSighting(elsewhere, [kauffman, twin], {})).toEqual({ kind: "ambiguous" });
    const twins = [twin, { ...twin, primaryUrl: "https://www.kcsymphony.org/" }];
    expect(matchSighting({ ...sighting, primaryUrl: "https://kcsymphony.org/concerts" }, [kauffman, ...twins], {})).toEqual({ kind: "ambiguous" });
    expect(matchSighting(sighting, [kauffman], {})).toEqual({ kind: "matched", event: kauffman, rule: "venueless" });
    expect(matchSighting({ ...sighting, title: "Other" }, [kauffman, twin], {})).toEqual({ kind: "none" });
  });

  it("folds the twin into the one candidate left once its own host's other twin is gone", () => {
    const other = { ...twin, primaryUrl: "https://www.kcsymphony.org/" };
    expect(sameEvent(twin, other, [kauffman, twin, other], {})).toBe(true);
    expect(sameEvent(kauffman, twin, [kauffman, twin, other], {})).toBe(false);
    expect(sameEvent(kauffman, twin, [kauffman, twin], {})).toBe(true);
  });
});

describe("a record folded as a duplicate (#77)", () => {
  const kept = { id: "evt_kept", primaryUrl: "https://www.kauffmancenter.org/events/", title: "Interstellar Live", venue: "Kauffman Center for the Performing Arts", start: "2026-10-23", status: "active" as const };
  const duplicate = { id: "evt_dup", primaryUrl: "https://www.kcsymphony.org/upcoming-events/", title: "Interstellar Live", venue: "Helzberg Hall", start: "2026-10-23", status: "expired" as const, duplicateOf: "evt_kept" };
  const sighting = { primaryUrl: "https://www.kcsymphony.org/upcoming-events/", title: "Interstellar Live", venue: "Symphony Hall", start: "2026-10-23" };

  it("stands for the record it was folded into: a match on it is a match on that record", () => {
    expect(findMatch(sighting, [duplicate, kept], {})).toBe(kept);
    expect(matchSighting(sighting, [kept, duplicate], {})).toEqual({ kind: "matched", event: kept, rule: "page-and-title" });
    expect(findMatch(sighting, [kept], {})).toBeUndefined();
  });

  it("follows a chain of folds, and a chain that leaves the known events or loops points at no record", () => {
    const first = { ...kept, id: "evt_first", primaryUrl: "https://kcballet.org/", venue: "Kansas City Ballet" };
    const chained = { ...kept, status: "expired" as const, duplicateOf: "evt_first" };
    expect(findMatch(sighting, [duplicate, chained, first], {})).toBe(first);
    expect(findMatch(sighting, [duplicate], {})).toBeUndefined();
    expect(findMatch(sighting, [duplicate, { ...chained, duplicateOf: "evt_dup" }], {})).toBeUndefined();
  });

  it("goes on to the other rules when a pointer leads nowhere, and compares the kept record's date", () => {
    const { venue: _venue, ...venueless } = sighting;
    expect(findMatch(venueless, [duplicate, kept], {})).toBe(kept);
    const elsewhere = { ...kept, id: "evt_elsewhere", primaryUrl: "https://kclivearts.org/" };
    expect(findMatch(venueless, [duplicate, elsewhere], {})).toBe(elsewhere);
    const moved = { ...kept, start: "2026-10-30" };
    const other = { ...kept, id: "evt_other", primaryUrl: duplicate.primaryUrl, venue: "Symphony Hall", start: "2026-10-23" };
    expect(findMatch(sighting, [duplicate, moved, other], {})).toBe(other);
  });
});

describe("one month of a recurring event (#77)", () => {
  const page = "https://www.theworldwar.org/events";
  const recurring = { primaryUrl: page, title: "Main Gallery Tours", venue: "National WWI Museum and Memorial", recurrence: "recurring" as const, status: "active" as const };
  const month = { primaryUrl: page, title: "Main Gallery Tours (Oct. 2026)", venue: "National WWI Museum and Memorial", start: "2026-10-09", recurrence: "limited-run" as const };

  it("matches the recurring event on its page as a confirmation, after every other rule", () => {
    expect(matchSighting(month, [recurring], {})).toEqual({ kind: "matched", event: recurring, rule: "month" });
    const dated = { ...month, recurrence: "limited-run" as const, status: "active" as const };
    expect(matchSighting(month, [recurring, dated], {})).toMatchObject({ rule: "page-and-title" });
  });

  it("matches no recurring event on another page and none expired; the untagged title is the page-and-title match it always was", () => {
    expect(findMatch({ ...month, primaryUrl: "https://unionstation.org/" }, [recurring], {})).toBeUndefined();
    expect(findMatch(month, [{ ...recurring, status: "expired" as const }], {})).toBeUndefined();
    expect(matchSighting({ ...month, title: "Main Gallery Tours" }, [recurring], {})).toMatchObject({ rule: "page-and-title" });
  });
});

describe("the venue an alias names (#91)", () => {
  const aliases = {
    "Kauffman Center for the Performing Arts": ["Kauffman Center", "Helzberg Hall"],
    "Lied Center of Kansas": ["Main Auditorium", "Pavilion"],
  };

  it("names the venue for its own name, an alias, or either with a label added", () => {
    expect(aliasedVenue("The Kauffman Center for the Performing Arts", aliases)).toBe("Kauffman Center for the Performing Arts");
    expect(aliasedVenue("helzberg hall", aliases)).toBe("Kauffman Center for the Performing Arts");
    expect(aliasedVenue("Helzberg Hall (Orchestra Level)", aliases)).toBe("Kauffman Center for the Performing Arts");
    expect(aliasedVenue("Main Auditorium", aliases)).toBe("Lied Center of Kansas");
  });

  it("splits a room from its venue, but not the venue's own name or a form of it", () => {
    expect(venueAndRoom("Helzberg Hall", aliases)).toEqual({ venue: "Kauffman Center for the Performing Arts", room: "Helzberg Hall" });
    expect(venueAndRoom("The Kauffman Center for the Performing Arts", aliases)).toEqual({ venue: "Kauffman Center for the Performing Arts" });
    expect(venueAndRoom("Kauffman Center", aliases)).toEqual({ venue: "Kauffman Center for the Performing Arts" });
    expect(venueAndRoom("recordBar", aliases)).toEqual({ venue: "recordBar" });
  });

  it("names none for a name the list does not hold, or one shorter than an entry", () => {
    expect(aliasedVenue("recordBar", aliases)).toBeUndefined();
    expect(aliasedVenue("Kauffman", aliases)).toBeUndefined();
  });

  it("holds a generic alias to that name alone: another venue's pavilion is not the Lied Center's", () => {
    expect(aliasedVenue("Pavilion", aliases)).toBe("Lied Center of Kansas");
    expect(aliasedVenue("Swope Park Pavilion", aliases)).toBeUndefined();
    expect(aliasedVenue("Folly Theater Main Auditorium", aliases)).toBeUndefined();
    expect(sameVenue("Swope Park Pavilion", "Lied Center of Kansas", aliases)).toBe(false);
    expect(sameVenue("Pavilion", "Lied Center of Kansas", aliases)).toBe(true);
  });

  it("calls a name generic when every word in it could be a room anywhere", () => {
    expect(["Galleries", "Main Auditorium", "The Pavilion", "Online", "Plaza Branch"].filter((n) => genericVenueName(n))).toHaveLength(5);
    expect(["Helzberg Hall", "Bloch Lobby", "recordBar", "Copaken Stage", ""].filter((n) => genericVenueName(n))).toEqual([]);
  });
});

describe("the same own page on one date (#66)", () => {
  const page = "https://www.midlandkc.com/events";
  const detail = "https://www.midlandkc.com/events/detail/1525431";
  const stored = { primaryUrl: page, title: "An Evening With Kenny G", venue: "The Midland Theatre", start: "2026-11-19T20:00:00-06:00", eventUrl: detail };
  const retitled = { ...stored, title: "Kenny G" };

  it("matches a sighting titled otherwise, by the own-page rule, whatever its venue", () => {
    expect(matchSighting(retitled, [stored], {})).toEqual({ kind: "matched", event: stored, rule: "own-page" });
    expect(findMatch({ ...retitled, venue: "Marble & Canvas" }, [stored], {})).toBe(stored);
    expect(findMatch({ ...retitled, venue: undefined }, [stored], {})).toBe(stored);
    expect(sameEvent(stored, retitled, [stored, retitled], {})).toBe(true);
  });

  it("takes the own page as a page is: without www., over http, with a trailing slash or a fragment", () => {
    for (const eventUrl of ["https://midlandkc.com/events/detail/1525431", "http://www.midlandkc.com/events/detail/1525431/", `${detail}#tickets`]) {
      expect(findMatch({ ...retitled, eventUrl }, [stored], {})).toBe(stored);
    }
    expect(findMatch({ ...retitled, eventUrl: `${detail}?night=2` }, [stored], {})).toBeUndefined();
  });

  it("matches when only one gives a time, and not when the times differ: a matinee and an evening show", () => {
    const bareDate = { ...stored, start: "2026-11-19" };
    expect(findMatch({ ...retitled, start: "2026-11-19" }, [stored], {})).toBe(stored);
    expect(findMatch(retitled, [bareDate], {})).toBe(bareDate);
    expect(findMatch({ ...retitled, start: "2026-11-19T14:00:00-06:00" }, [stored], {})).toBeUndefined();
    expect(sameEvent(stored, { ...retitled, start: "2026-11-19T14:00:00-06:00" }, [stored], {})).toBe(false);
  });

  it("is two records on two dates: an exhibition's page or a series page serves several", () => {
    expect(findMatch({ ...retitled, start: "2026-11-20T20:00:00-06:00" }, [stored], {})).toBeUndefined();
    expect(sameEvent(stored, { ...retitled, start: "2026-11-20" }, [stored], {})).toBe(false);
  });

  it("needs an own page and a date on both, and never a recurring record", () => {
    expect(findMatch({ ...retitled, eventUrl: undefined }, [stored], {})).toBeUndefined();
    expect(findMatch(retitled, [{ ...stored, eventUrl: undefined }], {})).toBeUndefined();
    expect(findMatch({ ...retitled, start: undefined }, [stored], {})).toBeUndefined();
    expect(findMatch(retitled, [{ ...stored, start: undefined }], {})).toBeUndefined();
    const recurring = { ...stored, recurrence: "recurring" as const };
    expect(findMatch(retitled, [recurring], {})).toBeUndefined();
    expect(sameEvent(recurring, retitled, [recurring, retitled], {})).toBe(false);
  });

  it("comes after the match on page and title: that record wins even when another shares the own page", () => {
    const other = { ...stored, title: "Kenny G" };
    expect(matchSighting({ ...stored, start: "2026-11-19" }, [other, stored], {})).toEqual({ kind: "matched", event: stored, rule: "page-and-title" });
  });
});

describe("the same end date of a limited run (#68)", () => {
  // The 2026-10-12 dataset's Nerman cluster: the opening on the museum's exhibitions page, the day artsjoco listed it, and no start on the homepage.
  const nerman = "Nerman Museum of Contemporary Art";
  const opening = { primaryUrl: "https://www.nermanmuseum.org/exhibitions/", title: "Sport and Spectator", venue: nerman, start: "2026-06-12", end: "2026-12-06" };
  const listed = { ...opening, primaryUrl: "https://artsjoco.org/acjc/calendar-of-events/", start: "2026-09-25" };
  const homepage = { ...opening, primaryUrl: "https://www.nermanmuseum.org/", start: undefined };

  it("matches a record with no start to one with a start, the venue worded otherwise", () => {
    const campus = { primaryUrl: "https://americanroyal.com/livestock/", title: "American Royal Livestock Show", venue: "New American Royal Campus", start: "2026-10-08", end: "2026-10-18" };
    const discovered = { ...campus, primaryUrl: "https://kcparent.test/royal", venue: "American Royal New Campus", start: undefined };
    expect(matchSighting(discovered, [campus], {})).toEqual({ kind: "matched", event: campus, rule: "same-end" });
    expect(findMatch(campus, [discovered], {})).toBe(discovered);
    expect(sameEvent(campus, discovered, [campus, discovered], {})).toBe(true);
    expect(matchSighting(homepage, [opening], {})).toEqual({ kind: "matched", event: opening, rule: "same-end" });
  });

  it("matches starts 105 days apart; a time on the end is ignored, but another end date is another run", () => {
    expect(matchSighting(listed, [opening], {})).toEqual({ kind: "matched", event: opening, rule: "same-end" });
    expect(sameEvent(opening, listed, [opening, listed], {})).toBe(true);
    expect(findMatch({ ...listed, end: "2026-12-06T17:00:00-06:00" }, [opening], {})).toBe(opening);
    expect(findMatch({ ...listed, end: "2026-12-05" }, [opening], {})).toBeUndefined();
  });

  it("is two events at two venues", () => {
    const elsewhere = { ...listed, venue: "Kemper Museum of Contemporary Art" };
    expect(findMatch(elsewhere, [opening], {})).toBeUndefined();
    expect(sameEvent(opening, elsewhere, [opening, elsewhere], {})).toBe(false);
  });

  it("never matches a record with no venue", () => {
    const venueless = { ...homepage, venue: undefined };
    expect(findMatch(venueless, [opening], {})).toBeUndefined();
    expect(findMatch(opening, [venueless], {})).toBeUndefined();
    expect(sameEvent(opening, venueless, [opening, venueless], {})).toBe(false);
  });

  it("leaves a pair with no end on one side to the other rules: starts outside the window stay two events", () => {
    const noEnd = { ...listed, end: undefined };
    expect(findMatch(noEnd, [opening], {})).toBeUndefined();
    expect(findMatch(listed, [{ ...opening, end: undefined }], {})).toBeUndefined();
    expect(sameEvent(opening, noEnd, [opening, noEnd], {})).toBe(false);
  });
});

describe("two recurring records at one venue (#119)", () => {
  // The 2026-10-12 dataset's two published pairs: a market read from two hosts of its own site, and a district's night under its short and full names on one page.
  const district = "Crossroads Arts District";
  const short = { primaryUrl: "https://kccrossroads.org/", title: "First Friday", venue: district, recurrence: "recurring" as const };
  const full = { ...short, title: "First Friday in the Crossroads", eventUrl: "https://kccrossroads.org/this-first-friday/" };
  const market = { primaryUrl: "https://thecitymarket.org/events", title: "Farmers Market", venue: "City Market", recurrence: "recurring" as const };
  const otherHost = { ...market, primaryUrl: "https://thecitymarketkc.org/events" };

  it("matches the same title on two hosts at one venue", () => {
    expect(matchSighting(otherHost, [market], {})).toEqual({ kind: "matched", event: market, rule: "recurring" });
    expect(sameEvent(market, otherHost, [market, otherHost], {})).toBe(true);
  });

  it("matches a shortened title on one page at one venue, the venue worded otherwise", () => {
    expect(matchSighting(full, [short], {})).toEqual({ kind: "matched", event: short, rule: "recurring" });
    expect(matchSighting({ ...short, venue: "The Crossroads Arts District" }, [full], {})).toEqual({ kind: "matched", event: full, rule: "recurring" });
    expect(sameEvent(short, full, [short, full], {})).toBe(true);
  });

  it("is two events when a shortened title is on another page", () => {
    const openMic = { primaryUrl: "https://bar.test/calendar", title: "Open Mic", venue: "Bar A", recurrence: "recurring" as const };
    const comedy = { ...openMic, primaryUrl: "https://bar.test/comedy", title: "Open Mic Comedy" };
    expect(findMatch(comedy, [openMic], {})).toBeUndefined();
    expect(sameEvent(openMic, comedy, [openMic, comedy], {})).toBe(false);
  });

  it("is two events at two venues", () => {
    const gallery = { ...otherHost, venue: "Apex Artspace" };
    expect(findMatch(gallery, [market], {})).toBeUndefined();
    expect(sameEvent(market, gallery, [market, gallery], {})).toBe(false);
  });

  it("never matches a record with no venue", () => {
    const venueless = { ...otherHost, venue: undefined };
    expect(findMatch(venueless, [market], {})).toBeUndefined();
    expect(findMatch(market, [venueless], {})).toBeUndefined();
    expect(sameEvent(market, venueless, [market, venueless], {})).toBe(false);
  });

  it("never joins a recurring record and a dated one", () => {
    const dated = { ...otherHost, recurrence: "one-off" as const, start: "2026-10-17" };
    expect(findMatch(dated, [market], {})).toBeUndefined();
    expect(findMatch(market, [dated], {})).toBeUndefined();
    expect(sameEvent(market, dated, [market, dated], {})).toBe(false);
  });
});

describe("ruledTitle (#217)", () => {
  it("takes the form without the venue behind it, the venue as either reading names it", () => {
    const venues = ["Union Station Kansas City"];
    expect(ruledTitle("The Berlin Wall. A World Divided. Exhibition at Union Station", "The Berlin Wall. A World Divided.", venues)).toBe("The Berlin Wall. A World Divided.");
    expect(ruledTitle("Mitski at The Truman", "Mitski", ["The Truman"])).toBe("Mitski");
    expect(ruledTitle("Jazz at the Kauffman Center", "Jazz", ["Kauffman Center for the Performing Arts"])).toBe("Jazz");
  });

  it("takes the form without the sponsor behind it, the venue kept", () => {
    const yoga = "Yoga at the Kauffman Center";
    expect(ruledTitle(`${yoga} Presented by Premier Partner Saint Luke’s`, yoga, ["Kauffman Center for the Performing Arts"])).toBe(yoga);
  });

  it("is none for an 'at' that names somewhere else, a venue sharing only its first word, or only a kind of place", () => {
    expect(ruledTitle("Breakfast", "Breakfast at Tiffany's", ["Screenland Armour"])).toBeUndefined();
    expect(ruledTitle("Lights", "Lights at Union Hill", ["Union Station Kansas City"])).toBeUndefined();
    expect(ruledTitle("Concert", "Concert at the Gallery", ["Gallery"])).toBeUndefined();
  });

  it("is none when more than one word stands before the venue: they may be the act", () => {
    expect(ruledTitle("Breakfast", "Breakfast with Santa at Crown Center", ["Crown Center"])).toBeUndefined();
  });

  it("weighs the two forms as normalized, whatever their punctuation", () => {
    expect(ruledTitle("Big Show at Knuckleheads", "The Big Show!!!!!!!!!!!!!!!!!!!!", ["Knuckleheads"])).toBe("The Big Show!!!!!!!!!!!!!!!!!!!!");
  });

  it("is none for two titles that are not one cut short of the other", () => {
    expect(ruledTitle("EMAS Presents", "Lilah Powlas", [])).toBeUndefined();
    expect(ruledTitle("Big Show", "BIG SHOW!", [])).toBeUndefined();
  });
});

describe("one game under two forms of its title (#227)", () => {
  const park = { primaryUrl: "https://www.sportingkc.com/schedule", venue: "Children's Mercy Park", kind: "sports", recurrence: "one-off" as const };
  const game = (title: string, start = "2026-10-24T19:30:00-05:00", overrides: Partial<EventIdentity> = {}) => ({ ...park, title, start, ...overrides });

  it("matches the club's forms of one matchup on one day at one venue, from any page", () => {
    const stored = game("Sporting Kansas City vs. Austin FC");
    for (const title of ["Sporting KC vs Austin", "Kansas City vs Austin", "SPORTING KC V. AUSTIN"]) {
      expect(matchSighting(game(title), [stored], {})).toEqual({ kind: "matched", event: stored, rule: "game" });
      expect(findMatch(game(title, "2026-10-24", { primaryUrl: "https://kcsoccer.test/games" }), [stored], {})).toBe(stored);
    }
    expect(sameEvent(game("Sporting KC vs Austin"), game("Kansas City vs Austin", "2026-10-24"), [], {})).toBe(true);
  });

  it("matches a home game written visitor @ home, the separator in any case", () => {
    const rink = { primaryUrl: "https://www.kcmavericks.com/schedule", venue: "Cable Dahmer Arena", kind: "Sports", recurrence: "one-off" as const, start: "2026-11-27T19:05:00-06:00" };
    const stored = { ...rink, title: "Kansas City Mavericks vs Wichita Thunder" };
    expect(findMatch({ ...rink, title: "Wichita Thunder @ Kansas City Mavericks" }, [stored], {})).toBe(stored);
    expect(findMatch({ ...rink, title: "Wichita Thunder AT Kansas City Mavericks" }, [stored], {})).toBe(stored);
  });

  it("matches at a venue under its alias", () => {
    const aliases = { "Children's Mercy Park": ["Sporting Park"] };
    expect(findMatch(game("Sporting KC vs Austin", undefined, { venue: "Sporting Park" }), [game("Sporting Kansas City vs. Austin FC")], aliases)).toBeDefined();
  });

  it("keeps two games at one venue on one day at different times apart: a doubleheader", () => {
    const first = game("Royals vs Tigers", "2026-10-24T13:10:00-05:00");
    const second = game("Kansas City Royals vs. Detroit Tigers", "2026-10-24T18:40:00-05:00");
    expect(findMatch(second, [first], {})).toBeUndefined();
    expect(sameEvent(first, second, [], {})).toBe(false);
  });

  it("does not match a title that is not a matchup, a record not of kind sports, another day, or another venue", () => {
    const stored = game("Sporting Kansas City vs. Austin FC");
    expect(findMatch(game("Sporting KC Fan Fest"), [stored], {})).toBeUndefined();
    expect(findMatch(game("Sporting KC vs Austin", undefined, { kind: "music" }), [stored], {})).toBeUndefined();
    expect(findMatch(game("Sporting KC vs Austin", "2026-10-25T19:30:00-05:00"), [stored], {})).toBeUndefined();
    expect(findMatch(game("Sporting KC vs Austin", undefined, { venue: "Legends Field" }), [stored], {})).toBeUndefined();
    const studio = { primaryUrl: "https://studio.test/classes", venue: "Clay Studio", kind: "arts", recurrence: "one-off" as const, start: "2026-10-24T18:00:00-05:00" };
    expect(findMatch({ ...studio, title: "Pottery vs Painting" }, [{ ...studio, title: "Painting vs Pottery" }], {})).toBeUndefined();
  });

  it("never matches a recurring record or a limited run", () => {
    expect(findMatch(game("Sporting KC vs Austin"), [game("Sporting Kansas City vs. Austin FC", undefined, { recurrence: "limited-run" })], {})).toBeUndefined();
    expect(findMatch(game("Sporting KC vs Austin", undefined, { recurrence: "recurring" }), [game("Sporting Kansas City vs. Austin FC")], {})).toBeUndefined();
  });
});
