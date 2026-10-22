import { describe, expect, it } from "vitest";
import { dayTarget, weekDays } from "../src/lib/week";
import { event } from "./fixtures/event";

describe("dayTarget", () => {
  it("is the first pick that starts that day, ahead of a one-off that opened earlier and is still on", () => {
    // Dark Forest ran Thu to Sat; the strip's Fri and Sat both jumped to its Thursday card (audit B3).
    const span = event({ id: "span", title: "Dark Forest", start: "2026-10-22T19:00:00-05:00", end: "2026-10-24" });
    const sat = event({ id: "sat", title: "Graveyard 5K", start: "2026-10-24T08:00:00-05:00" });
    const days = weekDays([span, sat], "2026-10-21", "2026-10-25");
    const on = (date: string) => days.find((d) => d.date === date)!;
    expect(dayTarget(on("2026-10-24"))?.id).toBe("sat");
    // Nothing starts on Friday; the span's card is the only one to go to.
    expect(dayTarget(on("2026-10-23"))?.id).toBe("span");
    expect(dayTarget(on("2026-10-25"))).toBeUndefined();
  });

  it("falls back to a run open that day when no pick is on it", () => {
    const run = event({ id: "run", recurrence: "limited-run", start: "2026-10-01", end: "2026-11-01" });
    const days = weekDays([run], "2026-10-21", "2026-10-25");
    expect(dayTarget(days[1]!)?.id).toBe("run");
  });
});

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

  it("lists every run open on a day as running, opening and closing days included", () => {
    const opens = event({ id: "opens", recurrence: "limited-run", start: "2026-10-08", end: "2026-10-25" });
    const closes = event({ id: "closes", recurrence: "limited-run", start: "2026-09-01", end: "2026-10-10" });
    const lingers = event({ id: "lingers", recurrence: "limited-run", start: undefined, end: "2026-12-13" });
    const show = event({ id: "show", start: "2026-10-06T20:00:00-05:00" });
    const days = weekDays([opens, closes, lingers, show], "2026-10-05", "2026-10-11");
    expect(days.map((d) => d.running.map((e) => e.id))).toEqual([
      ["closes", "lingers"], ["closes", "lingers"], ["closes", "lingers"], ["opens", "closes", "lingers"],
      ["opens", "closes", "lingers"], ["opens", "closes", "lingers"], ["opens", "lingers"],
    ]);
  });

  it("is one day on a Sunday", () => {
    expect(weekDays([], "2026-10-11", "2026-10-11").map((d) => d.date)).toEqual(["2026-10-11"]);
  });
});
