import { describe, expect, it } from "vitest";
import { pageKey, samePage } from "../src/hosts.js";
import { aliasedVenue, findMatch, genericVenueName,matchSighting, nearDates, normalizeName, sameEvent, sameVenue } from "../src/identity.js";

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
    expect(findMatch({ ...early, start: undefined }, [late, early], {})).toBe(late);
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
