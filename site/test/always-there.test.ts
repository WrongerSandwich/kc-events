import { describe, expect, it } from "vitest";
import { alwaysTherePicks } from "../src/always-there";
import { alwaysThereDetail, pickAlwaysThere } from "../src/lib/always-there";
import { events } from "../src/generated/events";
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

describe("committed data", () => {
  it("finds all but one of the hand-kept picks whose source is up, in the committed dataset", () => {
    // A guard against the list rotting silently: venues retitle and sources change. A pick whose host has no published
    // event at all is a source that is down (the run report flags that; the registry fixes it), not a rotten pick, so
    // it is left out of the count; one miss among the rest is a retitle to catch at leisure, two is rot.
    const hosts = new Set(events.map((e) => new URL(e.primaryUrl).host.replace(/^www\./, "")));
    const up = alwaysTherePicks.filter((p) => hosts.has(p.host));
    expect(up.length, "picks whose source is up").toBeGreaterThanOrEqual(3);
    expect(pickAlwaysThere(events, alwaysTherePicks).length).toBeGreaterThanOrEqual(up.length - 1);
  });

  it("puts the Crossroads' own First Friday on the front page, never a night at The Bird (#197)", () => {
    const rows = pickAlwaysThere(events, alwaysTherePicks).filter((e) => /first friday/i.test(e.title));
    for (const e of rows) expect(e.venue, e.title).toBe("Crossroads Arts District");
  });
});
