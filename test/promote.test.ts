import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { emptyDataset, type Dataset, type Event } from "../src/dataset.js";
import { parseRegistry, type Registry } from "../src/registry.js";
import { ELSEWHERE_IN_THE_METRO } from "../src/config.js";
import { promotionDraft, withPromoted } from "../src/promote.js";
import { testConfig } from "./fakes/config.js";
import { knuckleheads, WEEK_1_ISO } from "./fakes/fixtures.js";

const EVENTS_PAGE = "https://www.winery.test/events/upcoming";
const PUMPKIN_PAGE = "https://www.winery.test/pumpkin-patch";
const QUERY = "music events in Kansas City, October to November 2026";

let nextId = 0;
function held(title: string, overrides: Partial<Event> = {}): Event {
  return {
    id: `evt_${String(++nextId).padStart(12, "0")}`,
    title,
    start: "2026-10-31T20:00:00-05:00",
    venue: "The Winery",
    neighborhood: "Westport",
    primaryUrl: EVENTS_PAGE,
    kind: "music",
    recurrence: "one-off",
    dontMiss: false,
    firstSeen: WEEK_1_ISO,
    lastVerified: WEEK_1_ISO,
    lastChanged: WEEK_1_ISO,
    status: "unverified",
    heldForPromotion: true,
    verificationFailures: 0,
    consecutiveOutages: 0,
    lead: { lane: "discovery", query: QUERY },
    evidence: { date: "Sat, Oct 31 · 8 PM", venue: "The Winery, 1 Vine St" },
    ...overrides,
  };
}

const REGISTRY: Registry = { sources: [knuckleheads] };

const dataset: Dataset = {
  ...emptyDataset(),
  events: [
    held("Jazz Night"),
    held("Wine Walk", { kind: "food/drink" }),
    held("Blues Night", { neighborhood: "Somewhere Unlisted" }),
    held("Pumpkin Patch", { primaryUrl: PUMPKIN_PAGE, venue: "Winery Pumpkin Patch", kind: "festivals/markets" }),
    held("Elsewhere", { primaryUrl: "https://other.test/show" }),
  ],
  discoveryState: { "winery.test": { runsSeen: 16, lastSeen: WEEK_1_ISO } },
};

const draft = (host: string, registry = REGISTRY, data = dataset) => promotionDraft(host, { dataset: data, registry, config: testConfig(), today: "2026-10-31" });

describe("pnpm promote's draft (#255)", () => {
  it("lists the host's held events and its discovery state, and drafts a stanza from them", () => {
    const result = draft("www.winery.test");

    expect(result.host).toBe("winery.test");
    expect(result.held.map((e) => e.title)).toEqual(["Jazz Night", "Wine Walk", "Blues Night", "Pumpkin Patch"]);
    expect(result.state).toEqual({ runsSeen: 16, lastSeen: WEEK_1_ISO });
    expect(result.stanza).toEqual({
      name: "The Winery",
      urls: [EVENTS_PAGE, PUMPKIN_PAGE],
      kind: "music",
      neighborhood: "Westport",
      checkHints: "",
      status: "active",
      notes: "Promoted 2026-10-31 from discovery: 4 held events on 2 pages.",
    });
  });

  it("takes the host as the name and the catch-all as the neighborhood when no venue or listed neighborhood is there", () => {
    const unnamed: Dataset = { ...emptyDataset(), events: [held("A", { venue: "", neighborhood: "Nowhere Listed" })] };
    const { stanza } = draft("winery.test", REGISTRY, unnamed);
    expect(stanza).toMatchObject({ name: "winery.test", neighborhood: ELSEWHERE_IN_THE_METRO });
  });

  it("refuses a host that is already a source, an aggregator or a platform, and one with nothing held", () => {
    expect(() => draft("knuckleheads.test")).toThrow("already a registry source");
    expect(() => draft("eventbrite.com")).toThrow("a ticketing platform");
    const config = { ...testConfig(), discovery: { ...testConfig().discovery, aggregatorHosts: ["winery.test"] } };
    expect(() => promotionDraft("winery.test", { dataset, registry: REGISTRY, config, today: "2026-10-31" })).toThrow("an aggregator");
    expect(() => draft("nothing.test")).toThrow("no events held for promotion on nothing.test");
  });

  it("drafts a host a source is on only a subdomain of, since that source admits none of its pages", () => {
    const tickets = { ...knuckleheads, name: "Winery Tickets", urls: ["https://tickets.winery.test/calendar"] };
    expect(draft("winery.test", { sources: [tickets] }).held).toHaveLength(4);
  });

  it("--write appends the stanza under one heading, and the registry still parses", () => {
    const registryText = "# The registry\nsources:\n  - name: Knuckleheads\n    urls: [https://knuckleheads.test/calendar]\n    kind: music\n    neighborhood: East Bottoms\n    status: active\n";
    const once = withPromoted(registryText, draft("winery.test").stanza);
    const registry = parseRegistry(parseYaml(once));

    expect(registry.sources.map((s) => s.name)).toEqual(["Knuckleheads", "The Winery"]);
    expect(registry.sources[1]).toEqual(draft("winery.test").stanza);
    expect(once).toContain("\n  # --- Promoted from discovery\n");

    const other: Dataset = { ...emptyDataset(), events: [held("Show", { primaryUrl: "https://other.test/show", venue: "Other Hall" })] };
    const twice = withPromoted(once, draft("other.test", registry, other).stanza);
    expect(twice.match(/# --- Promoted from discovery/g)).toHaveLength(1);
    expect(parseRegistry(parseYaml(twice)).sources.map((s) => s.name)).toEqual(["Knuckleheads", "The Winery", "Other Hall"]);
  });
});
