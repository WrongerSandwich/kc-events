// @vitest-environment node
import { describe, expect, it } from "vitest";
import { barShares, cronWhen, duration, inWords, roughly, runDay, usd } from "../src/lib/how-it-works";

describe("the how-it-works page's formatting", () => {
  it("writes money to the cent, and says so when it is under one", () => {
    expect(usd(0.6856934849999999)).toBe("$0.69");
    expect(usd(0)).toBe("$0.00");
    expect(usd(0.004)).toBe("under $0.01");
    expect(usd(5)).toBe("$5.00");
  });

  it("writes a run's length in minutes, and in hours once it has one", () => {
    expect(duration(23)).toBe("23 min");
    expect(duration(1)).toBe("1 min");
    expect(duration(60)).toBe("1 h");
    expect(duration(72)).toBe("1 h 12 min");
  });

  it("writes a count up to twelve in words, as the site's prose does, and a larger one in figures", () => {
    expect([0, 1, 4, 12].map(inWords)).toEqual(["zero", "one", "four", "twelve"]);
    expect([13, 52, 70000].map(inWords)).toEqual(["13", "52", "70,000"]);
  });

  it("rounds one run's count to the nearest ten where a sentence speaks of every run", () => {
    expect([4, 19].map(roughly)).toEqual(["four", "19"]);
    expect([52, 59, 64, 100].map(roughly)).toEqual(["about 50", "about 60", "about 60", "about 100"]);
  });

  it("names a run by its month and day", () => {
    expect(runDay("2026-11-16")).toBe("November 16");
  });

  it("reads a cron line's days and time, in the site's form for a time", () => {
    expect(cronWhen("17 6 * * 1")).toEqual({ days: "Mondays", time: "6:17 am" });
    expect(cronWhen("17 6 * * 4")).toEqual({ days: "Thursdays", time: "6:17 am" });
    expect(cronWhen("5 0 * * *")).toEqual({ days: "every day", time: "12:05 am" });
  });

  it("refuses a cron line it cannot say in words", () => {
    expect(() => cronWhen("*/5 * * * *")).toThrow(/cron/);
    expect(() => cronWhen("0 6 1 * *")).toThrow(/cron/);
  });

  it("shares a bar out in whole percents that sum to 100, the smallest stage still wide enough to see", () => {
    const shares = barShares([
      { stage: "curation", calls: 9, usd: 0.3 },
      { stage: "extraction", calls: 136, usd: 0.24 },
      { stage: "own-page", calls: 229, usd: 0.14 },
      { stage: "reverification", calls: 2, usd: 0.005 },
    ]);
    expect(shares.map((s) => s.stage)).toEqual(["curation", "extraction", "own-page", "reverification"]);
    expect(shares.map((s) => s.share).reduce((a, b) => a + b)).toBe(100);
    expect(shares.at(-1)!.share).toBeGreaterThanOrEqual(2);
    expect(shares[0]!.share).toBeGreaterThan(shares[1]!.share);
  });

  it("draws no bar for a run that spent nothing", () => {
    expect(barShares([{ stage: "curation", calls: 1, usd: 0 }])).toEqual([]);
    expect(barShares([])).toEqual([]);
  });

  it("leaves a stage that spent nothing out of a bar the others fill", () => {
    const shares = barShares([{ stage: "curation", calls: 2, usd: 0.3 }, { stage: "discovery", calls: 1, usd: 0 }]);
    expect(shares).toEqual([{ stage: "curation", calls: 2, usd: 0.3, share: 100 }]);
  });
});
