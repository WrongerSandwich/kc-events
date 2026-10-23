import { describe, expect, it } from "vitest";
import { alwaysTherePicks } from "../src/always-there";
import { alwaysThereDetail, alwaysThereWarnings, pickAlwaysThere } from "../src/lib/always-there";
import { event } from "./fixtures/event";

const recurring = (over: Parameters<typeof event>[0]) => event({ recurrence: "recurring", start: undefined, schedule: "Weekly", ...over });

describe("pickAlwaysThere", () => {
  it("matches by host and title words, in pick order, ignoring case and punctuation", () => {
    const tours = recurring({ id: "t", title: "Main Gallery Tours (Nov. 2026)", primaryUrl: "https://www.theworldwar.org/events" });
    const trivia = recurring({ id: "q", title: "PADDY O’TRIVIA HOSTED BY AVERY", primaryUrl: "https://www.replaylounge.com/calendar-full/" });
    const picks = [{ title: "Trivia", host: "replaylounge.com" }, { title: "main gallery tours", host: "theworldwar.org" }];
    expect(pickAlwaysThere([tours, trivia], picks).map((e) => e.id)).toEqual(["q", "t"]);
  });

  it("needs the host to match, skips a pick with no match, and never takes a dated event or one twice", () => {
    const market = recurring({ id: "m", title: "Farmers Market", primaryUrl: "https://thecitymarket.org/" });
    const elsewhere = recurring({ id: "x", title: "Farmers Market", primaryUrl: "https://example.org/" });
    const dated = event({ id: "d", title: "Farmers Market", primaryUrl: "https://thecitymarket.org/" });
    const picks = [
      { title: "Farmers Market", host: "thecitymarket.org" },
      { title: "Farmers Market", host: "thecitymarket.org" },
      { title: "Nothing", host: "nowhere.org" },
    ];
    expect(pickAlwaysThere([dated, elsewhere, market], picks).map((e) => e.id)).toEqual(["m"]);
  });

  it("needs the venue to match too when the pick names one, ignoring case and punctuation", () => {
    const comedy = recurring({ id: "c", title: "Free First Friday Comedy", venue: "The Bird Comedy Theater", primaryUrl: "https://kccrossroads.org/" });
    const district = recurring({ id: "f", title: "First Friday", venue: "Crossroads Arts District", primaryUrl: "https://kccrossroads.org/" });
    const pick = { title: "First Friday", host: "kccrossroads.org", venue: "crossroads arts district." };
    expect(pickAlwaysThere([comedy, district], [pick]).map((e) => e.id)).toEqual(["f"]);
    expect(pickAlwaysThere([comedy], [pick])).toEqual([]);
  });

  it("does not match a title word inside another word", () => {
    const e = recurring({ title: "Triviality night", primaryUrl: "https://www.replaylounge.com/" });
    expect(pickAlwaysThere([e], [{ title: "Trivia", host: "replaylounge.com" }])).toEqual([]);
  });
});

describe("alwaysThereDetail", () => {
  const detailOf = (title: string, schedule: string | undefined) => alwaysThereDetail(recurring({ title, schedule, venue: "Crossroads Arts District" }));

  it("leaves out a schedule equal to the title once case and punctuation are folded", () => {
    expect(detailOf("First Friday", "first friday.")).toBe("Crossroads Arts District");
  });

  it("leaves out a schedule the title already holds as whole words", () => {
    expect(detailOf("First Friday in the Crossroads", "First Friday")).toBe("Crossroads Arts District");
  });

  it("keeps a schedule that says more than the title", () => {
    expect(detailOf("First Friday", "First Friday of every month")).toBe("First Friday of every month · Crossroads Arts District");
  });

  it("keeps a schedule found in the title only inside a word", () => {
    expect(detailOf("Weeklyish Jam", "Weekly")).toBe("Weekly · Crossroads Arts District");
  });

  it("shows the venue line alone when there is no schedule", () => {
    expect(detailOf("First Friday", undefined)).toBe("Crossroads Arts District");
    expect(alwaysThereDetail(recurring({ schedule: undefined, venue: "Union Station", room: "Gallery" }))).toBe("Union Station · Gallery");
  });
});

describe("alwaysThereWarnings", () => {
  const picks = [
    { title: "First Friday", host: "kccrossroads.org", venue: "Crossroads Arts District" },
    { title: "Farmers Market", host: "thecitymarketkc.org" },
    { title: "Main Gallery Tours", host: "theworldwar.org" },
  ];
  const firstFriday = recurring({ id: "f", title: "First Friday", venue: "Crossroads Arts District", primaryUrl: "https://kccrossroads.org/" });
  const market = recurring({ id: "m", title: "Farmers Market", primaryUrl: "https://thecitymarketkc.org/" });
  const tours = recurring({ id: "t", title: "Main Gallery Tours", primaryUrl: "https://www.theworldwar.org/events" });

  it("says nothing when every pick finds its event", () => {
    expect(alwaysThereWarnings([firstFriday, market, tours], picks)).toEqual([]);
  });

  it("names a pick whose source publishes events but none it matches, and one whose source publishes nothing (#191)", () => {
    const retitled = recurring({ id: "m2", title: "The Market", primaryUrl: "https://thecitymarketkc.org/" });
    const bird = recurring({ id: "b", title: "Free First Friday Comedy", venue: "The Bird Comedy Theater", primaryUrl: "https://kccrossroads.org/" });
    expect(alwaysThereWarnings([bird, retitled], picks)).toEqual([
      'Always there: "First Friday" (kccrossroads.org, at Crossroads Arts District) matches no published recurring event, though its source publishes some: retitled? Edit site/src/always-there.ts.',
      'Always there: "Farmers Market" (thecitymarketkc.org) matches no published recurring event, though its source publishes some: retitled? Edit site/src/always-there.ts.',
      'Always there: "Main Gallery Tours" (theworldwar.org) is left off the front page: its source publishes no event this week (down? see Failing sources).',
    ]);
  });
});

describe("alwaysTherePicks", () => {
  it("names the Crossroads' own First Friday by its venue, so a night at The Bird is never taken (#197)", () => {
    expect(alwaysTherePicks.find((p) => p.title === "First Friday")?.venue).toBe("Crossroads Arts District");
  });
});
