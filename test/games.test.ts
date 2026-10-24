import { describe, expect, it } from "vitest";
import { emptyDataset, type Dataset } from "../src/dataset.js";
import { testConfig } from "./fakes/config.js";
import { runWith } from "./fakes/run.js";
import { candidateAt, PAGE, reply, source, WEEK_1, WEEK_2, WEEK_2_ISO } from "./fakes/fixtures.js";

// One game under the forms of its title Sporting's schedule gave it from run to run (#227).
const sporting = source("Sporting Kansas City", { kind: "sports", neighborhood: "Westport" });
const PARK = "Children's Mercy Park";
const config = testConfig({ kinds: ["music", "sports", "other"] });
const austin = (title: string) => candidateAt(sporting, { title, startDate: "2026-10-17", startTime: "19:30", venue: PARK, venueEvidence: `${PARK}, Kansas City, KS`, dateEvidence: "Sat, Oct 17 · 7:30 PM" });

const readGame = (now: Date, dataset: Dataset, title: string) =>
  runWith(now, dataset, { sources: [sporting], pages: { [sporting.urls[0]!]: PAGE }, completions: [reply(austin(title))], config });

describe("one game under two forms of its title (#227)", () => {
  it("sights a stored game read under another form: it keeps its id, takes the new title, and no second record starts", async () => {
    const first = await readGame(WEEK_1, emptyDataset(), "Sporting Kansas City vs. Austin FC");
    const [stored] = first.dataset.events;

    const second = await readGame(WEEK_2, first.dataset, "Sporting KC vs Austin");

    expect(second.dataset.events).toEqual([
      expect.objectContaining({ id: stored!.id, title: "Sporting KC vs Austin", status: "active", verificationFailures: 0, lastVerified: WEEK_2_ISO }),
    ]);
    expect(second.report.counts).toMatchObject({ new: 0, found: 1 });
  });

  it("folds two stored records of one game in different forms into the one seen first", async () => {
    const first = await readGame(WEEK_1, emptyDataset(), "Sporting Kansas City vs. Austin FC");
    const [kept] = first.dataset.events;
    const twin = { ...kept!, id: "evt_000000000227", title: "Kansas City vs Austin", primaryUrl: "https://kcsoccer.test/games", firstSeen: WEEK_2_ISO };
    const quiet = { sources: [sporting], pages: { [sporting.urls[0]!]: PAGE }, completions: [reply()], config };

    const { dataset, report } = await runWith(WEEK_2, { ...first.dataset, events: [kept!, twin] }, quiet);

    const byId = new Map(dataset.events.map((e) => [e.id, e]));
    expect(byId.get(kept!.id)).toMatchObject({ status: kept!.status, title: "Sporting Kansas City vs. Austin FC" });
    expect(byId.get(twin.id)).toMatchObject({ status: "expired", expiryReason: "duplicate", duplicateOf: kept!.id });
    expect(report.counts.expired.duplicate).toBe(1);
  });
});
