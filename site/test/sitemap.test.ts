import { describe, expect, it } from "vitest";
import { sitemapXml } from "../src/lib/sitemap";
import { event } from "./fixtures/event";

describe("sitemapXml", () => {
  const xml = sitemapXml([event({ id: "evt_a", lastVerified: "2026-10-03T21:47:36-05:00" })], [{ slug: "recordbar", name: "recordBar" }], {
    origin: "https://www.kcthisweek.com",
    lastSuccessfulRun: "2026-10-05T06:40:00-05:00",
  });

  it("dates the site's pages by the last successful run", () => {
    expect(xml).toContain("<url><loc>https://www.kcthisweek.com/</loc><lastmod>2026-10-05T06:40:00-05:00</lastmod></url>");
    expect(xml).toContain("<url><loc>https://www.kcthisweek.com/explore</loc><lastmod>2026-10-05T06:40:00-05:00</lastmod></url>");
    expect(xml).toContain("<url><loc>https://www.kcthisweek.com/about</loc><lastmod>2026-10-05T06:40:00-05:00</lastmod></url>");
    expect(xml).toContain("<url><loc>https://www.kcthisweek.com/changes</loc><lastmod>2026-10-05T06:40:00-05:00</lastmod></url>");
  });

  it("lists every venue page, dated by the last successful run (#137)", () => {
    expect(xml).toContain("<url><loc>https://www.kcthisweek.com/v/recordbar</loc><lastmod>2026-10-05T06:40:00-05:00</lastmod></url>");
  });

  it("dates an event's page by when it was last verified", () => {
    expect(xml).toContain("<url><loc>https://www.kcthisweek.com/e/evt_a</loc><lastmod>2026-10-03T21:47:36-05:00</lastmod></url>");
  });
});
