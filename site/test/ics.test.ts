// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toIcs } from "../src/lib/ics";
import { event } from "./fixtures/event";

const opts = { siteName: "KC Events", stamp: "2026-10-05T11:30:00Z" };
const fixture = (name: string) => readFileSync(new URL(`./fixtures/ics/${name}.ics`, import.meta.url), "utf8");

describe("toIcs", () => {
  it("writes a timed single event in UTC with a two-hour placeholder end", () => {
    expect(toIcs([event({ dontMiss: true, whyLine: "Rare; see it." })], opts)).toBe(fixture("timed"));
  });

  it("writes a date-only event as all-day with an exclusive end", () => {
    expect(toIcs([event({ start: "2026-10-09" })], opts)).toBe(fixture("all-day"));
  });

  it("drops to all-day when the end is a date and the start a time", () => {
    expect(toIcs([event({ start: "2026-10-02T18:00:00-05:00", end: "2026-10-03" })], opts)).toBe(fixture("mixed"));
  });

  it("writes a start-less run as its last day", () => {
    expect(toIcs([event({ recurrence: "limited-run", start: undefined, end: "2026-10-31" })], opts)).toBe(fixture("last-day"));
  });

  it("puts Last day. before the why-line in a start-less run", () => {
    const out = toIcs([event({ recurrence: "limited-run", start: undefined, end: "2026-10-31", whyLine: "Rare; see it." })], opts);
    expect(out).toContain("DESCRIPTION:Last day.\\n\\nRare\\; see it.\\n\\nVerified");
  });

  it("skips recurring events and writes nothing but the wrapper for none", () => {
    expect(toIcs([event({ recurrence: "recurring", start: undefined, schedule: "Tuesdays" })], opts)).toBe(fixture("empty"));
  });

  it("escapes and folds text", () => {
    const out = toIcs([event({ title: "Comma, semicolon; backslash\\ and a line\nbreak " + "x".repeat(80) })], opts);
    expect(out).toContain("SUMMARY:Comma\\, semicolon\\; backslash\\\\ and a line\\nbreak ");
    for (const line of out.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(out).toContain("\r\n xxx"); // a folded continuation
  });

  it("converts the winter offset too", () => {
    expect(toIcs([event({ start: "2026-11-20T19:00:00-06:00" })], opts)).toContain("DTSTART:20261121T010000Z");
  });
});
