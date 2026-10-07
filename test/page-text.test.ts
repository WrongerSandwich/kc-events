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
