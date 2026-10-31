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

  describe("where the event's own page may be (#75)", () => {
    const listing = (href: string) => ({ status: 200, body: `<html><body><div><a href="${href}">Big Show</a> Sat, Oct 31</div></body></html>` });

    it("a link on the primary page's site, its ticketing subdomain included, is the event's page", async () => {
      const { dataset } = await runAt(WEEK_1, emptyDataset(), [reply(candidate({ eventLink: 1 }))], { [CALENDAR_URL]: listing("https://tickets.knuckleheads.test/e/big-show") });
      expect(dataset.events[0]!.eventUrl).toBe("https://tickets.knuckleheads.test/e/big-show");
    });

    it("a link to a ticketing platform the config lists is the event's page", async () => {
      const config = testConfig();
      const platformed = { ...config, discovery: { ...config.discovery, platformHosts: ["tickets.test"] } };
      const { dataset } = await runAt(WEEK_1, emptyDataset(), [reply(candidate({ eventLink: 1 }))], { [CALENDAR_URL]: listing("https://www.tickets.test/e/big-show") }, platformed);
      expect(dataset.events[0]!.eventUrl).toBe("https://www.tickets.test/e/big-show");
    });

    it("a link anywhere else is no event page: the event falls back to its primary page", async () => {
      const { dataset } = await runAt(WEEK_1, emptyDataset(), [reply(candidate({ eventLink: 1 }))], { [CALENDAR_URL]: listing("https://kc-shows.test/big-show") });
      expect(dataset.events[0]).toMatchObject({ status: "active", primaryUrl: CALENDAR_URL });
      expect(dataset.events[0]).not.toHaveProperty("eventUrl");
    });
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

  it("a re-reading that links nothing keeps the eventUrl the page still links under the event's title (#251)", async () => {
    const first = await runAt(WEEK_1);
    const second = await runAt(WEEK_2, first.dataset, [reply(candidate({ eventLink: null }))]);
    expect(second.dataset.events[0]).toMatchObject({ eventUrl: "https://knuckleheads.test/shows/big-show", status: "active" });
  });

  it("a re-reading that links nothing, from a page that no longer links the eventUrl, drops it", async () => {
    const first = await runAt(WEEK_1);
    const unlinked = { status: 200, body: LISTING.body.replace(`<a href="/shows/big-show">Big Show</a>`, "Big Show") };
    const second = await runAt(WEEK_2, first.dataset, [reply(candidate({ eventLink: null }))], { [CALENDAR_URL]: unlinked });
    expect(second.dataset.events[0]).not.toHaveProperty("eventUrl");
    expect(second.dataset.events[0]).toMatchObject({ id: first.dataset.events[0]!.id, status: "active" });
  });

  it("an event held unverified carries the link too, for when it verifies", async () => {
    const { dataset } = await runAt(WEEK_1, emptyDataset(), [reply(candidate({ eventLink: 1, venue: null, venueEvidence: null }))]);
    expect(dataset.events[0]).toMatchObject({ status: "unverified", eventUrl: "https://knuckleheads.test/shows/big-show" });
  });
});

describe("the same own page on one date (#66)", () => {
  it("a re-reading that titles the show otherwise refreshes the record, and the title change is identity churn", async () => {
    const first = await runAt(WEEK_1);
    const second = await runAt(WEEK_2, first.dataset, [reply(candidate({ title: "An Evening with Big Show", eventLink: 1 }))]);

    // The new title changes the record for curation, so it is judged again.
    expect(second.dataset.events).toEqual([{ ...first.dataset.events[0], title: "An Evening with Big Show", lastVerified: WEEK_2_ISO, lastChanged: WEEK_2_ISO, lastJudged: WEEK_2_ISO }]);
    expect(second.report.counts).toMatchObject({ new: 0, updated: 1 });
    expect(second.report.identityChurn).toEqual([expect.objectContaining({ title: "An Evening with Big Show", was: expect.objectContaining({ title: "Big Show" }) })]);
  });

  it("a re-reading that titles the show otherwise on another date, or at another time, is a second record", async () => {
    const first = await runAt(WEEK_1);
    const otherNight = await runAt(WEEK_2, first.dataset, [reply(candidate({ title: "An Evening with Big Show", startDate: "2026-11-01", dateEvidence: "Sun, Nov 1", eventLink: 1 }))]);
    expect(otherNight.dataset.events.map((e) => e.title)).toEqual(["Big Show", "An Evening with Big Show"]);

    const matinee = await runAt(WEEK_2, first.dataset, [reply(candidate({ title: "An Evening with Big Show", startTime: "14:00", eventLink: 1 }))]);
    expect(matinee.dataset.events.map((e) => e.title)).toEqual(["Big Show", "An Evening with Big Show"]);
  });
});

/**
 * A card layout where the whole card is one anchor, as the Kemper Museum's is (#250): the link marker
 * lands after the card's text, so the next card's title sits between [n] and [n+1], and a model taking
 * the marker before a title names the previous card's link. The job holds the number to the link's text.
 */
describe("an own page is the link whose text names the event (#250)", () => {
  const card = (href: string, date: string, title: string) => `<a href="${href}"><span>${date} · 6 PM</span><h3>${title}</h3></a>`;
  const CARDS = {
    status: 200,
    body: `<html><body><h1>Knuckleheads, 1 Main St</h1>
${card("/program/director-curator", "Oct 30", "Director as Curator")}
${card("/program/open-drawing", "Oct 31", "Open Drawing+")}
${card("/program/null", "Nov 1", "Totally Tots")}
</body></html>`,
  };
  const openDrawing = (eventLink: number | null) => candidate({ title: "Open Drawing+", startTime: "18:00", dateEvidence: "Oct 31 · 6 PM", eventLink });
  const cardsAt = (now: Date, dataset = emptyDataset(), completions = [reply(openDrawing(1))]) => runAt(now, dataset, completions, { [CALENDAR_URL]: CARDS });

  it("the model naming the previous card's link stores the link whose text is the title, with a line on the source's report", async () => {
    const { dataset, report } = await cardsAt(WEEK_1);
    expect(dataset.events[0]).toMatchObject({ title: "Open Drawing+", eventUrl: "https://knuckleheads.test/program/open-drawing" });
    expect(report.sources[0]!.detail).toContain(`"Open Drawing+" on ${CALENDAR_URL}: link 1 ("Oct 30 · 6 PM Director as Curator") does not name it; took link 2`);
    expect(report.counts).toMatchObject({ ownPageCorrected: 1, ownPageDropped: 0 });
  });

  it("the link the model named is taken when its text names the event", async () => {
    const { dataset, report } = await cardsAt(WEEK_1, emptyDataset(), [reply(openDrawing(2))]);
    expect(dataset.events[0]!.eventUrl).toBe("https://knuckleheads.test/program/open-drawing");
    expect(report.counts).toMatchObject({ ownPageCorrected: 0, ownPageDropped: 0 });
  });

  it("a named link giving another event's title, where no card's text gives this one, leaves no own page, with a line", async () => {
    const matinee = candidate({ title: "Big Show Matinee", startTime: "18:00", dateEvidence: "Oct 31 · 6 PM", eventLink: 2 });
    const { dataset, report } = await cardsAt(WEEK_1, emptyDataset(), [reply(matinee, openDrawing(2))]);
    const event = dataset.events.find((e) => e.title === "Big Show Matinee")!;
    expect(event).toMatchObject({ status: "active" });
    expect(event).not.toHaveProperty("eventUrl");
    expect(report.sources[0]!.detail).toContain(`"Big Show Matinee" on ${CALENDAR_URL}: link 2 ("Oct 31 · 6 PM Open Drawing+") does not name it; no own page`);
    expect(report.counts).toMatchObject({ ownPageCorrected: 0, ownPageDropped: 1 });
  });

  it.each([
    ["a team's label", `<a href="/games/11-06">Game Details</a>`],
    ["an image's description", `<a href="/games/11-06"><img src="/a.jpg" alt="A forward skating past the boards"></a>`],
  ])("a link whose text names no event the model read stands as the model gave it: %s", async (_, anchor) => {
    const body = `<html><body><div>Big Show · Sat, Oct 31 · Doors 7:00 PM · Show 8:00 PM ${anchor}</div></body></html>`;
    const { dataset, report } = await runAt(WEEK_1, emptyDataset(), [reply(candidate({ eventLink: 1 }))], { [CALENDAR_URL]: { status: 200, body } });
    expect(dataset.events[0]!.eventUrl).toBe("https://knuckleheads.test/games/11-06");
    expect(report.counts).toMatchObject({ ownPageCorrected: 0, ownPageDropped: 0 });
  });

  it("a link whose last path segment is null or undefined is no own page", async () => {
    const tots = candidate({ title: "Totally Tots", startDate: "2026-11-01", startTime: "18:00", dateEvidence: "Nov 1 · 6 PM", eventLink: 3 });
    const { dataset } = await cardsAt(WEEK_1, emptyDataset(), [reply(tots)]);
    expect(dataset.events[0]).not.toHaveProperty("eventUrl");
  });

  it("two cards with the title leave no own page when the named link names neither", async () => {
    const twice = { status: 200, body: CARDS.body.replace("Totally Tots", "Open Drawing+").replace("/program/null", "/program/open-drawing-2") };
    const director = candidate({ title: "Director as Curator", startDate: "2026-10-30", startTime: "18:00", dateEvidence: "Oct 30 · 6 PM", eventLink: 1 });
    const { dataset, report } = await runAt(WEEK_1, emptyDataset(), [reply(openDrawing(1), director)], { [CALENDAR_URL]: twice });
    expect(dataset.events.find((e) => e.title === "Open Drawing+")).not.toHaveProperty("eventUrl");
    expect(report.sources[0]!.detail).toContain("does not name it; no own page");
  });

  it("a named link whose text names nothing gives way to the one link giving the title", async () => {
    const body = `<html><body><div><a href="/shows/big-show">Big Show</a> Sat, Oct 31 · Doors 7:00 PM · Show 8:00 PM <a href="/shows/other">Game Details</a></div></body></html>`;
    const { dataset, report } = await runAt(WEEK_1, emptyDataset(), [reply(candidate({ eventLink: 2 }))], { [CALENDAR_URL]: { status: 200, body } });
    expect(dataset.events[0]!.eventUrl).toBe("https://knuckleheads.test/shows/big-show");
    expect(report.sources[0]!.detail).toContain(`"Big Show" on ${CALENDAR_URL}: link 2 ("Game Details") does not name it; took link 1`);
  });

  it("another title is read with its link markers stripped", async () => {
    const director = candidate({ title: "Director as Curator [1]", startDate: "2026-10-30", startTime: "18:00", dateEvidence: "Oct 30 · 6 PM", eventLink: 1 });
    const matinee = candidate({ title: "Big Show Matinee", startTime: "18:00", dateEvidence: "Oct 31 · 6 PM", eventLink: 1 });
    const { report } = await cardsAt(WEEK_1, emptyDataset(), [reply(matinee, director)]);
    expect(report.counts).toMatchObject({ ownPageDropped: 1 });
  });

  it("a generic label is taken as the model gave it", async () => {
    const body = `<html><body><div>Cheekface · Sat, Oct 31 · Doors 7:00 PM · Show 8:00 PM · Knuckleheads, 1 Main St <a href="/shows/cheekface">Buy tickets</a></div>
<div><a href="/shows/other">Other Band</a> Sun, Nov 1</div></body></html>`;
    const { dataset, report } = await runAt(WEEK_1, emptyDataset(), [reply(candidate({ title: "Cheekface", eventLink: 1 }))], { [CALENDAR_URL]: { status: 200, body } });
    expect(dataset.events[0]!.eventUrl).toBe("https://knuckleheads.test/shows/cheekface");
    expect(report.counts).toMatchObject({ ownPageCorrected: 0, ownPageDropped: 0 });
  });

  it("an image link's alt text names the event", async () => {
    const body = `<html><body><div><a href="/shows/big-show"><img src="/a.jpg" alt="Big Show"></a> Sat, Oct 31 · Doors 7:00 PM · Show 8:00 PM</div></body></html>`;
    const { dataset } = await runAt(WEEK_1, emptyDataset(), [reply(candidate({ eventLink: 1 }))], { [CALENDAR_URL]: { status: 200, body } });
    expect(dataset.events[0]!.eventUrl).toBe("https://knuckleheads.test/shows/big-show");
  });

  it("a refresh replaces a stored own page the page links under another event's text", async () => {
    const first = await cardsAt(WEEK_1, emptyDataset(), [reply(openDrawing(2))]);
    const wrong = { ...first.dataset, events: first.dataset.events.map((e) => ({ ...e, eventUrl: "https://knuckleheads.test/program/director-curator" })) };
    const second = await cardsAt(WEEK_2, wrong, [reply(openDrawing(1))]);
    expect(second.dataset.events[0]).toMatchObject({ id: first.dataset.events[0]!.id, eventUrl: "https://knuckleheads.test/program/open-drawing" });
  });
});
