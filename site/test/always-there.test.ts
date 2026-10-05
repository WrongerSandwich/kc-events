import { describe, expect, it } from "vitest";
import { alwaysTherePicks } from "../src/always-there";
import { pickAlwaysThere } from "../src/lib/always-there";
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

  it("does not match a title word inside another word", () => {
    const e = recurring({ title: "Triviality night", primaryUrl: "https://www.replaylounge.com/" });
    expect(pickAlwaysThere([e], [{ title: "Trivia", host: "replaylounge.com" }])).toEqual([]);
  });

  it("finds most of the hand-kept picks in the committed dataset", () => {
    // A guard against the list rotting silently: venues retitle and sources change.
    expect(pickAlwaysThere(events, alwaysTherePicks).length).toBeGreaterThanOrEqual(5);
  });
});
