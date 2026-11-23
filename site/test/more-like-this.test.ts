import { describe, expect, it } from "vitest";
import { moreLikeThis } from "../src/lib/more-like-this";
import { event } from "./fixtures/event";
import type { PublishedEvent } from "../src/lib/types";

const today = "2026-10-05";
const ids = (list: PublishedEvent[]) => list.map((e) => e.id);
const on = (day: string) => `${day}T19:00:00-05:00`;

describe("moreLikeThis (#301)", () => {
  const show = event({ id: "evt_show", venue: "recordBar", kind: "music", start: on("2026-10-09") });

  it("puts what else is at the venue first, soonest first, whatever its kind", () => {
    const events = [
      show,
      event({ id: "evt_far", venue: "The Truman", kind: "music", start: on("2026-10-09") }),
      event({ id: "evt_late", venue: "recordBar", kind: "comedy", start: on("2026-11-20") }),
      event({ id: "evt_soon", venue: "RecordBar", kind: "music", start: on("2026-10-20") }),
    ];
    expect(ids(moreLikeThis(show, events, today))).toEqual(["evt_soon", "evt_late", "evt_far"]);
  });

  it("then the same kind, nearest the event's day on either side", () => {
    const events = [
      show,
      event({ id: "evt_week_on", venue: "The Truman", start: on("2026-10-16") }),
      event({ id: "evt_day_before", venue: "Knuckleheads", start: on("2026-10-08") }),
      event({ id: "evt_month_on", venue: "Uptown Theater", start: on("2026-11-09") }),
      event({ id: "evt_two_on", venue: "The Bird", start: on("2026-10-11") }),
      event({ id: "evt_comedy", venue: "Comedy City", kind: "comedy", start: on("2026-10-09") }),
    ];
    expect(ids(moreLikeThis(show, events, today))).toEqual(["evt_day_before", "evt_two_on", "evt_week_on"]);
  });

  it("then picks, soonest first, when the venue and the kind run short", () => {
    const events = [
      show,
      event({ id: "evt_pick_late", venue: "Union Station", kind: "outdoors/community", dontMiss: true, start: on("2026-11-01") }),
      event({ id: "evt_plain", venue: "Union Station", kind: "outdoors/community", start: on("2026-10-06") }),
      event({ id: "evt_pick_soon", venue: "Nelson-Atkins", kind: "art", dontMiss: true, start: on("2026-10-12") }),
      event({ id: "evt_kind", venue: "The Truman", start: on("2026-12-01") }),
    ];
    expect(ids(moreLikeThis(show, events, today))).toEqual(["evt_kind", "evt_pick_soon", "evt_pick_late"]);
  });

  it("never lists the event itself, anything already begun or undated, or one event twice", () => {
    const events = [
      show,
      event({ id: "evt_begun", venue: "recordBar", start: on("2026-10-01") }),
      event({ id: "evt_weekly", venue: "recordBar", recurrence: "recurring", start: undefined }),
      event({ id: "evt_both", venue: "recordBar", dontMiss: true, start: on("2026-10-10") }),
    ];
    expect(ids(moreLikeThis(show, events, today))).toEqual(["evt_both"]);
  });

  it("lists nothing when nothing else qualifies", () => {
    expect(moreLikeThis(show, [show], today)).toEqual([]);
  });

  it("orders ties by title, then id, whatever the list's order", () => {
    const tied = [
      event({ id: "evt_b2", title: "B", venue: "The Truman", start: on("2026-10-10") }),
      event({ id: "evt_a", title: "A", venue: "Knuckleheads", start: on("2026-10-08") }),
      event({ id: "evt_b1", title: "B", venue: "The Bird", start: on("2026-10-10") }),
    ];
    const expected = ["evt_a", "evt_b1", "evt_b2"];
    expect(ids(moreLikeThis(show, [show, ...tied], today))).toEqual(expected);
    expect(ids(moreLikeThis(show, [...tied].reverse().concat(show), today))).toEqual(expected);
  });

  it("measures nearness from today for an event with no day", () => {
    const weekly = event({ id: "evt_weekly", venue: "Elsewhere", recurrence: "recurring", start: undefined });
    const events = [weekly, event({ id: "evt_late", venue: "A", start: on("2026-11-05") }), event({ id: "evt_soon", venue: "B", start: on("2026-10-06") })];
    expect(ids(moreLikeThis(weekly, events, today))).toEqual(["evt_soon", "evt_late"]);
  });
});
