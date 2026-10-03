import { describe, expect, it } from "vitest";
import { pageText } from "../src/extraction.js";

/** The text the extraction model reads is what a browser would show, so what it quotes as evidence and copies as a venue is what a reader sees. */
describe("page text", () => {
  it("decodes numeric and named character references, so a venue copied from it carries no entity codes", () => {
    const body = "<html><body><p>Children&#x27;s Mercy Park</p><p>Bartle Exhibit Hall (A &#8211; E)</p><p>Vivaldi&#039;s Four Seasons &amp; more &ndash; tonight&hellip;</p></body></html>";
    expect(pageText(body)).toBe("Children's Mercy Park\nBartle Exhibit Hall (A – E)\nVivaldi's Four Seasons & more – tonight…");
  });
});
