import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import { emptyDataset, parseDataset } from "../src/dataset.js";
import { fakePorts } from "./fakes/ports.js";
import { testConfig, testPrompts } from "./fakes/config.js";
import { candidateAt, costing, source, WEEK_1, WEEK_1_ISO, WEEK_2, WEEK_2_ISO } from "./fakes/fixtures.js";

const knuckleheads = source("Knuckleheads", { neighborhood: "East Bottoms", checkHints: "Doors and show times are listed per show." });
const CALENDAR_URL = knuckleheads.urls[0]!;
const candidate = (overrides: Record<string, unknown> = {}) => candidateAt(knuckleheads, overrides);

const runOver = (ports: ReturnType<typeof fakePorts>["ports"], dataset = emptyDataset()) =>
  run({ config: testConfig(), prompts: testPrompts(), dataset, registry: { sources: [knuckleheads] }, ports });

describe("extraction over the registry lane", () => {
  it("a page with a date and venue yields an active event with both evidence snippets", async () => {
    const { ports, requests } = fakePorts(WEEK_1, {
      pages: { [CALENDAR_URL]: { status: 200, body: "<html><body><h2>Big Show</h2><p>Sat, Oct 31</p></body></html>" } },
      completions: [costing(0.0123, candidate())],
    });

    const { dataset, report } = await runOver(ports);

    expect(dataset.events).toEqual([
      {
        id: expect.stringMatching(/^evt_[0-9a-f]{12}$/),
        title: "Big Show",
        start: "2026-10-31T20:00:00-05:00",
        venue: "Knuckleheads",
        neighborhood: "East Bottoms",
        primaryUrl: CALENDAR_URL,
        kind: "music",
        recurrence: "one-off",
        dontMiss: false,
        firstSeen: WEEK_1_ISO,
        lastVerified: WEEK_1_ISO,
        lastChanged: WEEK_1_ISO,
        status: "active",
        verificationFailures: 0,
        lead: { lane: "registry", source: "Knuckleheads" },
        evidence: { date: "Sat, Oct 31 · Doors 7:00 PM · Show 8:00 PM", venue: "Knuckleheads, 1 Main St" },
      },
    ]);
    expect(parseDataset(dataset)).toEqual(dataset);

    expect(report.counts).toMatchObject({ found: 1, new: 1, heldUnverified: 0 });
    expect(report.spend.totalUsd).toBe(0.0123);
    expect(report.sources).toEqual([{ name: "Knuckleheads", result: "fetched", extracted: 1 }]);

    // One extraction call: the configured extraction model, the rules document, the page, and a strict schema.
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.model).toBe("test/extraction");
    expect(request.messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(request.messages[0]!.content).toContain("TEST EXTRACTION RULES");
    expect(request.messages[1]!.content).toContain(CALENDAR_URL);
    expect(request.messages[1]!.content).toContain("Big Show");
    expect(request.messages[1]!.content).not.toContain("<h2>");
    expect(request.responseFormat.schema).toMatchObject({ type: "object", additionalProperties: false });
  });

  it("a page lacking a date yields an unverified event that is counted as held, never as publishable", async () => {
    const { ports } = fakePorts(WEEK_1, {
      pages: { [CALENDAR_URL]: { status: 200, body: "<html><body>Big Show, coming soon</body></html>" } },
      completions: [costing(0.01, candidate({ startDate: null, startTime: null, dateEvidence: null }))],
    });

    const { dataset, report } = await runOver(ports);

    expect(dataset.events).toHaveLength(1);
    expect(dataset.events[0]).toMatchObject({
      title: "Big Show",
      status: "unverified",
      venue: "Knuckleheads",
      evidence: { venue: "Knuckleheads, 1 Main St" },
    });
    expect(dataset.events[0]).not.toHaveProperty("start");
    expect(dataset.events[0]).not.toHaveProperty("lastVerified");
    expect(dataset.events[0]!.evidence).not.toHaveProperty("date");
    expect(parseDataset(dataset)).toEqual(dataset);
    expect(report.counts).toMatchObject({ found: 1, new: 1, heldUnverified: 1 });
  });

  it("a candidate pointing at a primary page that was not fetched is held unverified even with a date and venue", async () => {
    const { ports } = fakePorts(WEEK_1, {
      pages: { [CALENDAR_URL]: { status: 200, body: "<html><body>Big Show</body></html>" } },
      completions: [costing(0.01, candidate({ primaryUrl: "https://knuckleheads.test/events/big-show" }))],
    });

    const { dataset, report } = await runOver(ports);

    expect(dataset.events[0]).toMatchObject({
      status: "unverified",
      primaryUrl: "https://knuckleheads.test/events/big-show",
      start: "2026-10-31T20:00:00-05:00",
      evidence: { date: "Sat, Oct 31 · Doors 7:00 PM · Show 8:00 PM", venue: "Knuckleheads, 1 Main St" },
    });
    expect(dataset.events[0]).not.toHaveProperty("lastVerified");
    expect(report.counts).toMatchObject({ found: 1, heldUnverified: 1 });
  });

  it("a multi-night listing yields one active event with a start and an end", async () => {
    const { ports } = fakePorts(WEEK_1, {
      pages: { [CALENDAR_URL]: { status: 200, body: "<html><body>Two Nights</body></html>" } },
      completions: [
        costing(
          0.01,
          candidate({
            title: "Two Nights",
            startDate: "2026-10-16",
            startTime: "20:00",
            endDate: "2026-10-17",
            endTime: null,
            dateEvidence: "Fri Oct 16 & Sat Oct 17, 8pm",
          }),
        ),
      ],
    });

    const { dataset, report } = await runOver(ports);

    expect(dataset.events).toHaveLength(1);
    expect(dataset.events[0]).toMatchObject({
      title: "Two Nights",
      start: "2026-10-16T20:00:00-05:00",
      end: "2026-10-17",
      status: "active",
      evidence: { date: "Fri Oct 16 & Sat Oct 17, 8pm" },
    });
    expect(parseDataset(dataset)).toEqual(dataset);
    expect(report.counts).toMatchObject({ found: 1, new: 1, heldUnverified: 0 });
  });

  it("a page saying cancelled yields nothing to publish: the candidate is counted as extracted but no event is recorded", async () => {
    const { ports } = fakePorts(WEEK_1, {
      pages: { [CALENDAR_URL]: { status: 200, body: "<html><body>Big Show - CANCELLED</body></html>" } },
      completions: [costing(0.01, candidate({ notice: "cancelled" }))],
    });

    const { dataset, report } = await runOver(ports);

    expect(dataset.events).toEqual([]);
    expect(report.sources).toEqual([{ name: "Knuckleheads", result: "fetched", extracted: 1 }]);
    expect(report.counts).toMatchObject({ found: 0, new: 0, heldUnverified: 0 });
  });

  it("a page naming no venue yields an unverified event with no venue rather than borrowing the source's name", async () => {
    const { ports } = fakePorts(WEEK_1, {
      pages: { [CALENDAR_URL]: { status: 200, body: "<html><body>Big Show, Oct 31</body></html>" } },
      completions: [costing(0.01, candidate({ venue: null, venueEvidence: null }))],
    });

    const { dataset } = await runOver(ports);

    expect(dataset.events[0]).toMatchObject({ status: "unverified", evidence: { date: "Sat, Oct 31 · Doors 7:00 PM · Show 8:00 PM" } });
    expect(dataset.events[0]).not.toHaveProperty("venue");
    expect(parseDataset(dataset)).toEqual(dataset);
  });

  it("the same page and title seen on a later run refreshes the event under its original id instead of duplicating it", async () => {
    const first = fakePorts(WEEK_1, {
      pages: { [CALENDAR_URL]: { status: 200, body: "<html><body>Big Show</body></html>" } },
      completions: [costing(0.01, candidate())],
    });
    const { dataset: after1 } = await runOver(first.ports);

    const second = fakePorts(WEEK_2, {
      pages: { [CALENDAR_URL]: { status: 200, body: "<html><body>Big Show</body></html>" } },
      completions: [costing(0.01, candidate({ startTime: "21:00", dateEvidence: "Sat, Oct 31 · Show 9:00 PM" }))],
    });
    const { dataset: after2, report } = await runOver(second.ports, after1);

    expect(after2.events).toHaveLength(1);
    expect(after2.events[0]).toMatchObject({
      id: after1.events[0]!.id,
      firstSeen: WEEK_1_ISO,
      lastVerified: WEEK_2_ISO,
      start: "2026-10-31T21:00:00-05:00",
      evidence: { date: "Sat, Oct 31 · Show 9:00 PM" },
    });
    expect(report.counts).toMatchObject({ found: 1, new: 0, updated: 1 });
  });

  it("a sighting that cannot be verified leaves a known active event untouched, and a repeat on a second page of the same source counts once", async () => {
    const first = fakePorts(WEEK_1, {
      pages: { [CALENDAR_URL]: { status: 200, body: "<html><body>Big Show</body></html>" } },
      completions: [costing(0.01, candidate())],
    });
    const { dataset: after1 } = await runOver(first.ports);

    const FEED_URL = "https://knuckleheads.test/feed.ics";
    const second = fakePorts(WEEK_2, {
      pages: {
        [CALENDAR_URL]: { status: 200, body: "<html><body>Big Show, date TBA</body></html>" },
        [FEED_URL]: { status: 200, body: "BEGIN:VCALENDAR" },
      },
      completions: [
        costing(0.01, candidate({ title: "BIG  SHOW!", startDate: null, startTime: null, dateEvidence: null })),
        costing(0.01, candidate({ title: "Big Show" })),
      ],
    });
    const { dataset: after2, report } = await run({
      config: testConfig(),
      prompts: testPrompts(),
      dataset: after1,
      registry: { sources: [{ ...knuckleheads, urls: [CALENDAR_URL, FEED_URL] }] },
      ports: second.ports,
    });

    expect(after2.events).toHaveLength(1);
    expect(after2.events[0]).toMatchObject({ id: after1.events[0]!.id, status: "active", start: "2026-10-31T20:00:00-05:00" });
    expect(report.counts).toMatchObject({ found: 1, new: 0, updated: 1, heldUnverified: 0 });
    expect(report.sources).toEqual([{ name: "Knuckleheads", result: "fetched", extracted: 2 }]);
  });

  it("a model reply that is not in the expected shape yields no events from that page and is noted on the source", async () => {
    const { ports } = fakePorts(WEEK_1, {
      pages: { [CALENDAR_URL]: { status: 200, body: "<html><body>Big Show</body></html>" } },
      completions: [costing(0.01, { title: "Big Show" })],
    });

    const { dataset, report } = await runOver(ports);

    expect(dataset.events).toEqual([]);
    expect(report.spend.totalUsd).toBe(0.01);
    expect(report.sources).toEqual([
      { name: "Knuckleheads", result: "fetched", extracted: 0, detail: expect.stringContaining("not in the expected shape") },
    ]);
  });
});
