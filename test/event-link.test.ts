import { describe, expect, it } from "vitest";
import { emptyDataset } from "../src/dataset.js";
import { candidateAt, knuckleheads, PAGE, reply, WEEK_1, WEEK_1_ISO, WEEK_2, WEEK_2_ISO } from "./fakes/fixtures.js";
import { testConfig } from "./fakes/config.js";
import type { RunConfig } from "../src/config.js";
import { runWith } from "./fakes/run.js";

const CALENDAR_URL = knuckleheads.urls[0]!;
const candidate = (overrides: Record<string, unknown> = {}) => candidateAt(knuckleheads, overrides);
/** The calendar lists two shows, each linking its own page; the venue's Facebook is linked too. */
const LISTING = {
  status: 200,
  body: `<html><body><h1>Knuckleheads</h1><a href="https://www.facebook.com/knuckleheads">Facebook</a>
<div><a href="/shows/big-show">Big Show</a> Sat, Oct 31 · Doors 7:00 PM · Show 8:00 PM</div>
<div><a href="/shows/other-band">Other Band</a> Sun, Nov 1</div></body></html>`,
};
const runAt = (now: Date, dataset = emptyDataset(), completions = [reply(candidate({ eventLink: 1 }))], pages: Record<string, typeof PAGE> = { [CALENDAR_URL]: LISTING }, config: RunConfig = testConfig()) =>
  runWith(now, dataset, { sources: [knuckleheads], pages, completions, config });

/**
 * The event's own page, when the list links one, is where the site sends the reader. The primary page
 * stays the list the date and venue were read from: verification and identity do not move.
 */
describe("the event's own page", () => {
  it("the model names a link by its number and the event carries that page as its eventUrl, the list as its primaryUrl", async () => {
    const { dataset, requests } = await runAt(WEEK_1, emptyDataset(), [reply(candidate({ eventLink: 1 }), candidate({ title: "Other Band", startDate: "2026-11-01", dateEvidence: "Sun, Nov 1", eventLink: 2 }))]);

    expect(dataset.events.map((e) => [e.title, e.primaryUrl, e.eventUrl, e.status])).toEqual([
      ["Big Show", CALENDAR_URL, "https://knuckleheads.test/shows/big-show", "active"],
      ["Other Band", CALENDAR_URL, "https://knuckleheads.test/shows/other-band", "active"],
    ]);
    const content = requests.find((r) => r.model === "test/extraction")!.messages[1]!.content;
    expect(content).toContain("Big Show [1] Sat, Oct 31");
    expect(content).toContain("Other Band [2] Sun, Nov 1");
    expect(content).not.toContain("knuckleheads.test/shows");
  });

  it("the extraction schema asks for the link number, never a URL", async () => {
    const { requests } = await runAt(WEEK_1);
    const schema = requests.find((r) => r.model === "test/extraction")!.responseFormat.schema as { properties: { events: { items: { properties: Record<string, unknown>; required: string[] } } } };
    expect(schema.properties.events.items.properties).toHaveProperty("eventLink");
    expect(schema.properties.events.items.required).toContain("eventLink");
  });

  it.each([
    ["null", null],
    ["a number not on the page", 7],
    ["zero", 0],
  ])("%s gives no eventUrl", async (_, eventLink) => {
    const { dataset } = await runAt(WEEK_1, emptyDataset(), [reply(candidate({ eventLink }))]);
    expect(dataset.events[0]).toMatchObject({ status: "active", primaryUrl: CALENDAR_URL });
    expect(dataset.events[0]).not.toHaveProperty("eventUrl");
  });

  it("a link to the list itself is no event page", async () => {
    const body = `<html><body><a href="${CALENDAR_URL}">Calendar</a><div><a href="/shows/big-show">Big Show</a> Sat, Oct 31</div></body></html>`;
    const { dataset, requests } = await runAt(WEEK_1, emptyDataset(), [reply(candidate({ eventLink: 1 }))], { [CALENDAR_URL]: { status: 200, body } });
    const content = requests.find((r) => r.model === "test/extraction")!.messages[1]!.content;
    expect(content).toContain("Big Show [1] Sat, Oct 31");
    expect(content).not.toContain("Calendar [");
    expect(dataset.events[0]!.eventUrl).toBe("https://knuckleheads.test/shows/big-show");
  });

  it("a link on an ignored or aggregator host is never numbered, so the model cannot name it", async () => {
    const body = `<html><body><div><a href="https://listings.test/kc/big-show">Big Show</a> <a href="https://www.facebook.com/events/1">RSVP</a> Sat, Oct 31</div></body></html>`;
    const config = testConfig();
    const aggregating = { ...config, discovery: { ...config.discovery, aggregatorHosts: ["listings.test"] } };
    const { dataset, requests } = await runAt(WEEK_1, emptyDataset(), [reply(candidate({ eventLink: 1 }))], { [CALENDAR_URL]: { status: 200, body } }, aggregating);
    expect(requests.find((r) => r.model === "test/extraction")!.messages[1]!.content).toContain("Big Show RSVP Sat, Oct 31");
    expect(dataset.events[0]).toMatchObject({ status: "active", primaryUrl: CALENDAR_URL });
    expect(dataset.events[0]).not.toHaveProperty("eventUrl");
  });

  it("a re-reading that links a different page moves the eventUrl without a new id or a change for curation", async () => {
    const first = await runAt(WEEK_1);
    expect(first.dataset.events[0]).toMatchObject({ eventUrl: "https://knuckleheads.test/shows/big-show", lastChanged: WEEK_1_ISO });

    const moved = { status: 200, body: LISTING.body.replace("/shows/big-show", "/shows/big-show-2") };
    const second = await runAt(WEEK_2, first.dataset, [reply(candidate({ eventLink: 1 }))], { [CALENDAR_URL]: moved });

    expect(second.dataset.events).toEqual([
      { ...first.dataset.events[0], eventUrl: "https://knuckleheads.test/shows/big-show-2", lastVerified: WEEK_2_ISO, lastChanged: WEEK_1_ISO },
    ]);
    expect(second.report.counts).toMatchObject({ new: 0, updated: 1 });
  });

  it("a re-reading that links nothing drops the eventUrl", async () => {
    const first = await runAt(WEEK_1);
    const second = await runAt(WEEK_2, first.dataset, [reply(candidate({ eventLink: null }))]);
    expect(second.dataset.events[0]).not.toHaveProperty("eventUrl");
    expect(second.dataset.events[0]).toMatchObject({ id: first.dataset.events[0]!.id, status: "active" });
  });

  it("an event held unverified carries the link too, for when it verifies", async () => {
    const { dataset } = await runAt(WEEK_1, emptyDataset(), [reply(candidate({ eventLink: 1, venue: null, venueEvidence: null }))]);
    expect(dataset.events[0]).toMatchObject({ status: "unverified", eventUrl: "https://knuckleheads.test/shows/big-show" });
  });
});
