import { describe, expect, it } from "vitest";
import { emptyDataset } from "../src/dataset.js";
import { MAX_PAGE_CHARS } from "../src/extraction.js";
import { testConfig } from "./fakes/config.js";
import type { CannedPage } from "./fakes/ports.js";
import { runWith } from "./fakes/run.js";
import { candidateAt, knuckleheads, reply, WEEK_1 } from "./fakes/fixtures.js";

const CALENDAR_URL = knuckleheads.urls[0]!;
const bigShow = candidateAt(knuckleheads);

const listing = (filler: number) => ({
  status: 200,
  body: `<html><body><h1>Knuckleheads</h1>
<div>Big Show</div><div>Sat, Oct 31 · Doors 7:00 PM · Show 8:00 PM</div>
<div>Knuckleheads, 1 Main St</div>
${Array.from({ length: filler }, (_, i) => `<div>Gallery note number ${i}, nothing on this night</div>`).join("\n")}
</body></html>`,
});

const runOn = (page: CannedPage, extractionReads: 1 | 2 = 1) =>
  runWith(WEEK_1, emptyDataset(), {
    sources: [knuckleheads],
    pages: { [CALENDAR_URL]: page },
    completions: Array.from({ length: extractionReads }, () => reply(bigShow)),
    config: testConfig({ extractionReads }),
    pagesCarryQuotes: false,
  });

const cutLine = `${CALENDAR_URL} was cut at the ${MAX_PAGE_CHARS}-character cap`;
const knuckleheadsLine = (report: { sources: { name: string; detail?: string }[] }) => report.sources.find((s) => s.name === "Knuckleheads")!;

describe("a page cut at the cap (#226)", () => {
  it("is named in its source's line, once though it is read twice, and the event on it is still read", async () => {
    const page = listing(2_000);
    expect(page.body.length).toBeGreaterThan(MAX_PAGE_CHARS);

    const { dataset, report } = await runOn(page, 2);

    expect(knuckleheadsLine(report).detail?.split("; ").filter((part) => part === cutLine)).toHaveLength(1);
    expect(dataset.events.map((e) => [e.title, e.status])).toEqual([["Big Show", "active"]]);
  });

  it("a page under the cap gets no such line", async () => {
    const { report } = await runOn(listing(10));

    expect(knuckleheadsLine(report).detail ?? "").not.toContain("was cut");
  });
});
