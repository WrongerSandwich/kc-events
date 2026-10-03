import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";
import { parseRegistry } from "../src/registry.js";
import { parseDataset, emptyDataset } from "../src/dataset.js";

describe("config", () => {
  it("defaults match the spec", () => {
    const config = parseConfig({});
    expect(config.horizonWeeks).toBe(8);
    expect(config.spendCapUsd).toBe(5);
    expect(config.models).toEqual({ extraction: "openai/gpt-6-luna", curation: "anthropic/claude-sonnet-5.5" });
    expect(config.kinds).toEqual([
      "music",
      "theater/dance",
      "comedy",
      "art/exhibitions",
      "festivals/markets",
      "food/drink",
      "sports",
      "film",
      "talks/readings",
      "outdoors/community",
      "other",
    ]);
    expect(config.neighborhoods).toEqual(["Lawrence", "Elsewhere in the metro"]);
    expect(config.geography).toMatch(/Kansas City metro.*Lawrence/);
  });

  it("rejects a secret written into the config file", () => {
    expect(() => parseConfig({ openRouterApiKey: "sk-or-123" })).toThrow();
  });

  it("rejects a neighborhood list missing the catch-alls", () => {
    expect(() => parseConfig({ neighborhoods: ["Westport"] })).toThrow(/catch-alls/);
  });
});

describe("registry", () => {
  const active = {
    name: "Knuckleheads",
    urls: ["https://knuckleheadskc.com/calendar"],
    kind: "music",
    neighborhood: "East Bottoms",
    status: "active",
  };

  it("accepts active and excluded sources and treats an empty file as an empty registry", () => {
    expect(parseRegistry(null)).toEqual({ sources: [] });
    const registry = parseRegistry({
      sources: [active, { ...active, name: "Blocked Venue", status: "excluded", reason: "robots.txt disallows" }],
    });
    expect(registry.sources.map((s) => s.status)).toEqual(["active", "excluded"]);
  });

  it("rejects an excluded source without a reason", () => {
    expect(() => parseRegistry({ sources: [{ ...active, status: "excluded" }] })).toThrow();
  });

  it("rejects unknown fields, missing urls, and duplicate names", () => {
    expect(() => parseRegistry({ sources: [{ ...active, url: "https://x.test" }] })).toThrow();
    expect(() => parseRegistry({ sources: [{ ...active, urls: [] }] })).toThrow();
    expect(() => parseRegistry({ sources: [active, active] })).toThrow(/unique/);
  });
});

describe("dataset", () => {
  const event = {
    id: "evt_1",
    title: "Big Show",
    start: "2026-10-10T20:00:00-05:00",
    venue: "Knuckleheads",
    neighborhood: "Elsewhere in the metro",
    primaryUrl: "https://knuckleheadskc.com/events/big-show",
    kind: "music",
    recurrence: "one-off",
    dontMiss: false,
    firstSeen: "2026-10-02T22:15:00-05:00",
    lastVerified: "2026-10-02T22:15:00-05:00",
    status: "active",
    verificationFailures: 0,
    lead: { lane: "registry", source: "Knuckleheads" },
    evidence: { date: "Sat Oct 10, show 8pm", venue: "Knuckleheads Saloon" },
  };

  it("accepts the empty dataset and a dataset with a fully specified event", () => {
    expect(parseDataset(emptyDataset())).toEqual(emptyDataset());
    const withEvent = { ...emptyDataset(), events: [event], sourceState: { Knuckleheads: { consecutiveFailures: 0 } } };
    expect(parseDataset(withEvent)).toEqual(withEvent);
  });

  it("rejects an unknown schema version, unknown top-level fields, and unknown event fields", () => {
    expect(() => parseDataset({ ...emptyDataset(), schemaVersion: 2 })).toThrow();
    expect(() => parseDataset({ ...emptyDataset(), extra: true })).toThrow();
    expect(() => parseDataset({ ...emptyDataset(), events: [{ ...event, description: "copied blurb" }] })).toThrow();
  });

  it("rejects an active event missing a cited date or venue, and accepts the same event held unverified", () => {
    const { venue, ...noVenue } = event;
    expect(() => parseDataset({ ...emptyDataset(), events: [noVenue] })).toThrow(/active event/);
    expect(() => parseDataset({ ...emptyDataset(), events: [{ ...event, evidence: { venue: event.evidence.venue } }] })).toThrow(/active event/);
    const { lastVerified, ...held } = { ...noVenue, status: "unverified" };
    expect(parseDataset({ ...emptyDataset(), events: [held] }).events[0]).toEqual(held);
  });

  it("rejects dates without a timezone offset", () => {
    expect(() => parseDataset({ ...emptyDataset(), events: [{ ...event, start: "2026-10-10T20:00:00" }] })).toThrow();
  });
});
