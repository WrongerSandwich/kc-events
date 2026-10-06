import { describe, expect, it } from "vitest";
import { weekDays } from "../src/lib/week";
import { event } from "./fixtures/event";

describe("weekDays", () => {
  it("lays out today through Sunday with each day's picks", () => {
    const show = event({ id: "show", start: "2026-10-06T20:00:00-05:00" });
    const fest = event({ id: "fest", start: "2026-10-09", end: "2026-10-11" });
    const days = weekDays([show, fest], "2026-10-05", "2026-10-11");
    expect(days.map((d) => `${d.weekday} ${d.day}`)).toEqual(["Mon 5", "Tue 6", "Wed 7", "Thu 8", "Fri 9", "Sat 10", "Sun 11"]);
    expect(days.map((d) => d.picks.map((e) => e.id))).toEqual([[], ["show"], [], [], ["fest"], ["fest"], ["fest"]]);
  });

  it("counts a limited run only on its opening and closing days", () => {
    const opens = event({ id: "opens", recurrence: "limited-run", start: "2026-10-08", end: "2026-10-25" });
    const closes = event({ id: "closes", recurrence: "limited-run", start: "2026-09-01", end: "2026-10-10" });
    const lingers = event({ id: "lingers", recurrence: "limited-run", start: undefined, end: "2026-12-13" });
    const days = weekDays([opens, closes, lingers], "2026-10-05", "2026-10-11");
    expect(days.map((d) => d.picks.map((e) => e.id))).toEqual([[], [], [], ["opens"], [], ["closes"], []]);
  });

  it("is one day on a Sunday", () => {
    expect(weekDays([], "2026-10-11", "2026-10-11").map((d) => d.date)).toEqual(["2026-10-11"]);
  });
});
