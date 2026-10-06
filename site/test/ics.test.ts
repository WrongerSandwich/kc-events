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

  it("escapes a lone carriage return as a newline", () => {
    const out = toIcs([event({ title: "One\rTwo\r\nThree\nFour" })], opts);
    expect(out).toContain("SUMMARY:One\\nTwo\\nThree\\nFour\r\n");
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

  it("folds a multi-byte title at 75 octets without splitting a character, and unfolds intact", () => {
    const title = "Fête des ténèbres — 夜の音楽祭 🎷 ".repeat(6).trim();
    const out = toIcs([event({ title })], opts);
    const lines = out.split("\r\n");
    for (const line of lines) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(lines.some((l) => l.startsWith(" "))).toBe(true);
    const unfolded = out.replace(/\r\n /g, "");
    expect(unfolded).toContain(`SUMMARY:${title}`);
    expect(unfolded).not.toContain("\uFFFD");
  });

  it("writes a timed start with a timed end as both instants in UTC", () => {
    const out = toIcs([event({ start: "2026-10-09T19:00:00-05:00", end: "2026-10-09T22:30:00-05:00" })], opts);
    expect(out).toContain("DTSTART:20261010T000000Z");
    expect(out).toContain("DTEND:20261010T033000Z");
  });

  it("writes a date-only start with a timed end as all-day, ending after the end's local day", () => {
    const out = toIcs([event({ start: "2026-10-09", end: "2026-10-11T15:00:00-05:00" })], opts);
    expect(out).toContain("DTSTART;VALUE=DATE:20261009");
    expect(out).toContain("DTEND;VALUE=DATE:20261012");
  });

  it("converts the winter offset too", () => {
    expect(toIcs([event({ start: "2026-11-20T19:00:00-06:00" })], opts)).toContain("DTSTART:20261121T010000Z");
  });
});
