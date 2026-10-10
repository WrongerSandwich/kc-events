import { describe, expect, it } from "vitest";
import { emptyDataset, type Dataset } from "../src/dataset.js";
import { candidateAt, knuckleheads, PAGE, reply, source, WEEK_1, WEEK_2 } from "./fakes/fixtures.js";
import { runWith } from "./fakes/run.js";

const CALENDAR_URL = knuckleheads.urls[0]!;
const truman = source("The Truman", { neighborhood: "Westport" });
const pages = { [CALENDAR_URL]: PAGE, [truman.urls[0]!]: PAGE };
/** Knuckleheads' calendar lists these candidates; the Truman's lists nothing. */
const runAt = (now: Date, dataset: Dataset, ...candidates: Record<string, unknown>[]) =>
  runWith(now, dataset, { sources: [knuckleheads, truman], pages, completions: [reply(...candidates.map((c) => candidateAt(knuckleheads, c))), reply()] });

/**
 * The primary page is the page the job read. A URL the model puts on a candidate, whether another
 * source's calendar or a link it made up, never keys the event or verifies it.
 */
describe("the primary page", () => {
  it("a candidate claiming another source's calendar is keyed to the page it was read from, and that calendar not listing it strikes nothing", async () => {
    const first = await runAt(WEEK_1, emptyDataset(), { primaryUrl: truman.urls[0] });
    expect(first.dataset.events.map((e) => [e.primaryUrl, e.status])).toEqual([[CALENDAR_URL, "active"]]);

    const second = await runAt(WEEK_2, first.dataset, {});
    expect(second.dataset.events.map((e) => [e.primaryUrl, e.status, e.verificationFailures])).toEqual([[CALENDAR_URL, "active", 0]]);
  });

  it("a candidate naming a page nobody fetched is keyed to the page it was read from and verified there", async () => {
    const { dataset } = await runAt(WEEK_1, emptyDataset(), { primaryUrl: "https://knuckleheads.test/shows/big-show" });

    expect(dataset.events).toMatchObject([{ primaryUrl: CALENDAR_URL, status: "active", lastVerified: expect.any(String) }]);
  });

  it("the extraction schema does not ask the model for the primary page", async () => {
    const { requests } = await runAt(WEEK_1, emptyDataset());
    const schema = requests.find((r) => r.model === "test/extraction")!.responseFormat.schema as { properties: { events: { items: { properties: Record<string, unknown> } } } };
    expect(schema.properties.events.items.properties).not.toHaveProperty("primaryUrl");
  });
});
