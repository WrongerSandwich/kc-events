import { describe, expect, it } from "vitest";
import { pageText, readPage } from "../src/extraction.js";
import type { FetchResult } from "../src/ports.js";
import { testConfig } from "./fakes/config.js";

/** The text the extraction model reads is what a browser would show, so what it quotes as evidence and copies as a venue is what a reader sees. */
describe("page text", () => {
  it("decodes numeric and named character references, so a venue copied from it carries no entity codes", () => {
    const body = "<html><body><p>Children&#x27;s Mercy Park</p><p>Bartle Exhibit Hall (A &#8211; E)</p><p>Vivaldi&#039;s Four Seasons &amp; more &ndash; tonight&hellip;</p></body></html>";
    expect(pageText(body)).toBe("Children's Mercy Park\nBartle Exhibit Hall (A – E)\nVivaldi's Four Seasons & more – tonight…");
  });

  it("drops a whole tag whose quoted attribute holds a '>', so none of it reaches the text", () => {
    const body = `<html><body><div class="group-hover/item:[&>span]:underline [&>em:first-child]:italic" data-x='a > b'><span>Interstellar Live</span></div></body></html>`;
    expect(pageText(body)).toBe("Interstellar Live");
  });
});

const CALENDAR = "https://venue.test/shows";
const page = (body: string, finalUrl = CALENDAR): FetchResult => ({ url: CALENDAR, finalUrl, status: 200, body, robotsAllowed: true });
const config = testConfig();

/** A link a reader could follow is kept as a number after its text, and the number leads back to the URL; the model never sees or writes a URL. */
describe("page reading with links", () => {
  it("numbers each followable anchor after its text, resolving relative hrefs against the page", () => {
    const reading = readPage(page('<html><body><ul><li><a href="/shows/cheekface">Cheekface</a> Oct 9</li><li><a href="https://tickets.test/e/42">Dana and Alden</a> Oct 10</li></ul></body></html>'), config);
    expect(reading.text).toBe("Cheekface [1] Oct 9\nDana and Alden [2] Oct 10");
    expect(reading.links).toEqual(["https://venue.test/shows/cheekface", "https://tickets.test/e/42"]);
  });

  it("gives the same href one number however often it is linked, and drops the fragment", () => {
    const reading = readPage(page('<html><body><a href="/shows/a#top"><img src="a.jpg"></a><a href="/shows/a">A</a><a href="/shows/b">B</a><a href="/shows/a">Tickets</a></body></html>'), config);
    expect(reading.text).toBe("[1] A [1] B [2] Tickets [1]");
    expect(reading.links).toEqual(["https://venue.test/shows/a", "https://venue.test/shows/b"]);
  });

  it("numbers no link to the page itself, a static asset, a non-http scheme, or an ignored or aggregator host", () => {
    const body = [
      '<a href="https://venue.test/shows/">All shows</a>',
      '<a href="#main">Skip</a>',
      '<a href="mailto:a@venue.test">Mail</a>',
      '<a href="javascript:void(0)">Menu</a>',
      '<a href="/poster.pdf">Poster</a>',
      '<a href="https://www.facebook.com/venue">Facebook</a>',
      '<a href="https://listings.test/kc/venue">Listed</a>',
      '<a href="/shows/real">Real</a>',
    ].join(" ");
    const reading = readPage(page(`<html><body>${body}</body></html>`), testConfig({ discovery: { ...config.discovery, aggregatorHosts: ["listings.test"] } }));
    expect(reading.text).toBe("All shows Skip Mail Menu Poster Facebook Listed Real [1]");
    expect(reading.links).toEqual(["https://venue.test/shows/real"]);
  });

  it("reads an anchor whose attributes quote a '>' or come before href", () => {
    const reading = readPage(page('<html><body><a class="x" title="a > b" data-x=\'y\' href="/shows/c" target="_blank">C</a></body></html>'), config);
    expect(reading.text).toBe("C [1]");
    expect(reading.links).toEqual(["https://venue.test/shows/c"]);
  });

  it("an unclosed anchor neither swallows the next anchor's text nor takes its number", () => {
    const reading = readPage(page('<html><body><div><a href="/shows/a">A</div><div><a href="/shows/b">B</a></div></body></html>'), config);
    expect(reading.text).toBe("A\nB [1]");
    expect(reading.links).toEqual(["https://venue.test/shows/b"]);
  });

  it("numbers no link back to the URL the page was fetched at when it redirected elsewhere", () => {
    const reading = readPage(page('<html><body><a href="https://venue.test/shows">Shows</a><a href="/calendar/">Calendar</a><a href="/shows/a">A</a></body></html>', "https://venue.test/calendar"), config);
    expect(reading.text).toBe("Shows Calendar A [1]");
    expect(reading.links).toEqual(["https://venue.test/shows/a"]);
  });

  it("leaves a feed as it is: no markers, no links", () => {
    const feed = "BEGIN:VCALENDAR\nURL:https://venue.test/shows/a\nEND:VCALENDAR";
    expect(readPage(page(feed), config)).toEqual({ text: feed, links: [] });
  });
});

const ldJson = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const DOLLY = {
  "@context": "https://schema.org",
  "@type": "Event",
  name: "Dolly Parton Tribute &#038; More",
  startDate: "2026-10-16T19:00:00-05:00",
  endDate: "2026-10-16T21:00:00-05:00",
  url: "https://venue.test/events/dolly",
  location: { "@type": "Place", name: "Big Theatre", address: { "@type": "PostalAddress", streetAddress: "644 Massachusetts St", addressLocality: "Lawrence" } },
  description: "&lt;p&gt;Local musicians cover Dolly Parton&apos;s songs.&lt;/p&gt;\n",
};

/**
 * A page's schema.org event data sits in a script, which the text drops; many calendars give the time or
 * the blurb only there (#98: T-Mobile Center's start times, Liberty Hall's descriptions). It is read
 * as a section after the page's text, so the model can read it and quote it like the rest.
 */
describe("page reading with structured event data", () => {
  it("adds each schema.org event after the page's text: its name with its link's number, start, end, place, and description, decoded", () => {
    const body = `<html><head>${ldJson(DOLLY)}</head><body><a href="/events/dolly">Dolly Parton Tribute</a> Oct 16</body></html>`;
    const reading = readPage(page(body), config);
    expect(reading.text).toBe(
      [
        "Dolly Parton Tribute [1] Oct 16",
        "",
        "Event data in the page's code (schema.org):",
        "Dolly Parton Tribute & More [1] | starts 2026-10-16T19:00:00-05:00 | ends 2026-10-16T21:00:00-05:00 | at Big Theatre, 644 Massachusetts St, Lawrence | Local musicians cover Dolly Parton's songs.",
      ].join("\n"),
    );
    expect(reading.links).toEqual(["https://venue.test/events/dolly"]);
  });

  it("finds events in a list, in an @graph, and under any event type, and leaves out what is not an event or has no name or start", () => {
    const music = { "@type": "MusicEvent", name: "Fruit Bats", startDate: "2026-10-20T20:00:00-05:00" };
    const theater = { "@type": ["TheaterEvent"], name: "Macabaret", startDate: "2026-10-24" };
    const body = `<html><head>${ldJson([music, { "@type": "Organization", name: "Liberty Hall" }])}${ldJson({ "@graph": [theater, { "@type": "Event", name: "No date" }, { "@type": "Event", startDate: "2026-10-25" }] })}<script type="application/ld+json">{not json</script></head><body><p>Shows</p></body></html>`;
    expect(readPage(page(body), config).text).toBe(
      ["Shows", "", "Event data in the page's code (schema.org):", "Fruit Bats | starts 2026-10-20T20:00:00-05:00", "Macabaret | starts 2026-10-24"].join("\n"),
    );
  });

  it("adds nothing to a page with no event data, and gives an event listed twice one line", () => {
    expect(readPage(page(`<html><head>${ldJson({ "@type": "WebSite", name: "Venue" })}</head><body><p>Shows</p></body></html>`), config).text).toBe("Shows");
    const twice = `<html><head>${ldJson([DOLLY, DOLLY])}</head><body><p>Shows</p></body></html>`;
    expect(readPage(page(twice), config).text.match(/Dolly Parton Tribute & More/g)).toHaveLength(1);
  });

  it("cuts a long description, so one event cannot crowd out the rest", () => {
    const long = { "@type": "Event", name: "Long", startDate: "2026-10-16", description: "word ".repeat(400) };
    const line = readPage(page(`<html><head>${ldJson(long)}</head><body><p>Shows</p></body></html>`), config).text.split("\n").at(-1)!;
    expect(line.length).toBeLessThan(600);
    expect(line).toMatch(/…$/);
  });
});

/**
 * #98: a page whose markup is heavy enough that the old reading cut it before its last listings; the
 * time and blurb there now reach the model, once from the visible card and once from the event data.
 */
describe("a heavy page's last listing", () => {
  const card = (n: number) =>
    `<article><div class="${"group-hover/item:[&>span]:text-brand-blue [&>em:first-child]:italic ".repeat(14)}"><h3>Show ${n}</h3><p>October ${(n % 28) + 1}, 7 p.m.</p></div></article>`;
  const last = `<article><div class="[&>span]:underline"><h3>Interstellar Live</h3><p>October 23, 7:30 p.m.</p><p>The film's score played live under the screen.</p></div></article>`;
  const data = ldJson({ "@type": "Event", name: "Interstellar Live", startDate: "2026-10-23T19:30:00-05:00", description: "The film's score played live under the screen." });
  const body = `<html><head>${data}</head><body>${Array.from({ length: 100 }, (_, i) => card(i)).join("")}${last}</body></html>`;

  it("keeps the time and blurb that sat past the old 70,000-character cut-off", () => {
    expect(body.length).toBeGreaterThan(100_000);
    const { text } = readPage(page(body), config);
    expect(text).not.toContain("[page truncated]");
    expect(text).toContain("Interstellar Live\nOctober 23, 7:30 p.m.\nThe film's score played live under the screen.");
    expect(text).toContain("Interstellar Live | starts 2026-10-23T19:30:00-05:00 | The film's score played live under the screen.");
  });
});

describe("the reading's length", () => {
  it("is capped with the event data counted in, and cut at a line's end", () => {
    const events = Array.from({ length: 2000 }, (_, i) => ({ "@type": "Event", name: `Show number ${i}`, startDate: "2026-10-16T19:00:00-05:00" }));
    const { text } = readPage(page(`<html><head>${ldJson(events)}</head><body><p>Shows</p></body></html>`), config);
    expect(text.length).toBeLessThanOrEqual(70_000 + "\n[page truncated]".length);
    expect(text).toMatch(/\| starts 2026-10-16T19:00:00-05:00\n\[page truncated\]$/);
  });
});
