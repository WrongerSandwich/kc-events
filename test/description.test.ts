import { describe, expect, it } from "vitest";
import { emptyDataset, parseDataset } from "../src/dataset.js";
import { candidateAt, knuckleheads, PAGE, reply, WEEK_1, WEEK_1_ISO, WEEK_2, WEEK_2_ISO } from "./fakes/fixtures.js";
import { runWith } from "./fakes/run.js";

const CALENDAR_URL = knuckleheads.urls[0]!;
const candidate = (overrides: Record<string, unknown> = {}) => candidateAt(knuckleheads, overrides);
const runAt = (now: Date, dataset = emptyDataset(), completions = [reply(candidate())]) =>
  runWith(now, dataset, { sources: [knuckleheads], pages: { [CALENDAR_URL]: PAGE }, completions });
const ABOUT = "A three-piece from Lawrence playing songs from their first record.";

/**
 * The description is what the page says the event is, written by extraction as it reads the page. A
 * listing line says nothing beyond itself, so a later reading of a list does not wipe what an earlier
 * reading of a fuller page gave; and it is not part of what curation re-judges on.
 */
describe("the event's description", () => {
  it("the extraction schema asks for a description, null allowed", async () => {
    const { requests } = await runAt(WEEK_1);
    const schema = requests.find((r) => r.model === "test/extraction")!.responseFormat.schema as { properties: { events: { items: { properties: Record<string, { type: unknown }>; required: string[] } } } };
    expect(schema.properties.events.items.properties.description!.type).toEqual(["string", "null"]);
    expect(schema.properties.events.items.required).toContain("description");
  });

  it("a reading with a description stores it on the event, trimmed; a null or blank one stores none", async () => {
    const { dataset } = await runAt(WEEK_1, emptyDataset(), [
      reply(candidate({ description: `  ${ABOUT} ` }), candidate({ title: "Other Band", description: null }), candidate({ title: "Third Act", description: "  " })),
    ]);
    expect(dataset.events[0]!.description).toBe(ABOUT);
    expect(dataset.events[1]).not.toHaveProperty("description");
    expect(dataset.events[2]).not.toHaveProperty("description");
  });

  it("a later reading with no description keeps the stored one", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [reply(candidate({ description: ABOUT }))]);
    const second = await runAt(WEEK_2, first.dataset, [reply(candidate({ description: null }))]);
    expect(second.dataset.events).toEqual([{ ...first.dataset.events[0], lastVerified: WEEK_2_ISO }]);
  });

  it("a later reading with a description replaces the stored one, without a change for curation", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), [reply(candidate({ description: ABOUT }))]);
    const second = await runAt(WEEK_2, first.dataset, [reply(candidate({ description: "A new description." }))]);
    expect(second.dataset.events).toEqual([{ ...first.dataset.events[0], description: "A new description.", lastVerified: WEEK_2_ISO, lastChanged: WEEK_1_ISO }]);
    expect(second.requests.filter((r) => r.model === "test/curation")).toEqual([]);
  });

  it("a first description on a known event is no change for curation either", async () => {
    const first = await runAt(WEEK_1);
    expect(first.dataset.events[0]).not.toHaveProperty("description");
    const second = await runAt(WEEK_2, first.dataset, [reply(candidate({ description: ABOUT }))]);
    expect(second.dataset.events[0]).toMatchObject({ description: ABOUT, lastChanged: WEEK_1_ISO });
  });

  it("a dataset whose events carry no description still loads, and one that does keeps it", () => {
    const event = { id: "evt_1", title: "A", neighborhood: "Crossroads", primaryUrl: "https://a.test/", kind: "music", recurrence: "one-off", dontMiss: false, firstSeen: WEEK_1_ISO, status: "unverified", verificationFailures: 0, lead: { lane: "registry", source: "A" }, evidence: {} };
    const raw = { ...emptyDataset(), events: [event, { ...event, id: "evt_2", description: ABOUT }] };
    expect(parseDataset(raw).events.map((e) => e.description)).toEqual([undefined, ABOUT]);
  });
});
