import { describe, expect, it } from "vitest";
import { emptyDataset } from "../src/dataset.js";
import { runWith } from "./fakes/run.js";
import { candidateAt, knuckleheads, reply, WEEK_1 } from "./fakes/fixtures.js";

const FEED_URL = knuckleheads.urls[0]!;
const OWN_PAGE = "https://knuckleheads.test/calendar?big-show&event_id=7";

/** The listings' HTML as a calendar's paging script fetches it: JSON-escaped, slashes and accents included. */
const listing = `\n<div class="eli_row"><h4><a href="${OWN_PAGE}">Big Show</a></h4>\n<div>Sat, Oct 31 · Doors 7:00 PM · Show 8:00 PM</div>\n<div>Café Knuckleheads, 1 Main St</div></div>`;
const body = JSON.stringify({ html: listing, total: 22, page_size: "21" }).replaceAll("/", "\\/").replace("é", "\\u00e9");

describe("a registry page that answers JSON carrying the listings' HTML (#226)", () => {
  it("is read as that HTML: the event's quotes, accents and all, verify, and its own link is kept", async () => {
    const candidate = candidateAt(knuckleheads, { eventLink: 1, venue: "Café Knuckleheads", venueEvidence: "Café Knuckleheads, 1 Main St" });

    const { dataset } = await runWith(WEEK_1, emptyDataset(), {
      sources: [knuckleheads],
      pages: { [FEED_URL]: { status: 200, body } },
      completions: [reply(candidate)],
      pagesCarryQuotes: false,
    });

    expect(dataset.events).toHaveLength(1);
    expect(dataset.events[0]).toMatchObject({ title: "Big Show", status: "active", primaryUrl: FEED_URL, eventUrl: OWN_PAGE });
  });
});
