// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { events } from "../src/generated/events";
import { meta } from "../src/generated/meta";
import { alwaysTherePicks } from "../src/always-there";
import { pickAlwaysThere } from "../src/lib/always-there";
import { isDated, venueLine } from "../src/lib/events";
import { faviconSvg } from "../src/lib/mark";
import { slugify } from "../src/lib/slugs";

const dist = new URL("../dist/", import.meta.url);
const has = (p: string) => existsSync(new URL(p, dist));
const read = (p: string) => readFileSync(new URL(p, dist), "utf8");

// The build in dist/ matches the generated modules when its llms.txt names the same run and the same count: a build
// on another day than the tests' (SITE_TODAY=last-run) can leave out events that ended in between.
const matchesGenerated = has("llms.txt") && read("llms.txt").includes(`Last run: ${meta.lastSuccessfulRun}. ${events.length} active events.`);

it.runIf(process.env.CI !== undefined && !matchesGenerated)("has a build of the generated dataset to check (CI)", () => {
  expect.fail("dist/ is missing or was built from another dataset; CI must run `SITE_TODAY=last-run pnpm build` before `pnpm test`");
});

// What the build makes of the committed dataset: it needs a recurring event, a Lawrence one and a flag in it.
describe("committed data", () => {
  describe.skipIf(!matchesGenerated)("built output", () => {
    it("emits a page and a calendar file per dated event, and none for anything else", () => {
      const sample = events.find((e) => e.recurrence === "one-off")!;
      expect(has(`e/${sample.id}.html`)).toBe(true);
      expect(has(`e/${sample.id}.ics`)).toBe(true);
      const recurring = events.find((e) => e.recurrence === "recurring");
      if (recurring) expect(has(`e/${recurring.id}.ics`)).toBe(false);
    });

    it("writes the calendar feeds: the picks, every dated event, and each kind's (#136)", () => {
      const unfolded = (p: string) => read(p).replace(/\r\n[ \t]/g, "");
      const vevents = (p: string) => unfolded(p).split("BEGIN:VEVENT").length - 1;
      expect(unfolded("calendar/dont-miss.ics")).toContain("X-WR-CALNAME:KC This Week · Don't miss\r\nREFRESH-INTERVAL;VALUE=DURATION:P1D\r\nX-PUBLISHED-TTL:P1D\r\n");
      expect(unfolded("calendar.ics")).toContain("X-WR-CALNAME:KC This Week\r\n");
      expect(vevents("calendar.ics")).toBe(events.filter(isDated).length);
      for (const kind of meta.kinds) expect(vevents(`calendar/${slugify(kind)}.ics`), kind).toBe(events.filter((e) => isDated(e) && e.kind === kind).length);
      expect(unfolded("calendar.ics")).toMatch(new RegExp(`\r\nURL:[^\r]*/e/${events.find(isDated)!.id}\r\n`));
    });

    it("links the picks' feed by webcal from the front page and the about page (#136)", () => {
      for (const page of ["index.html", "about.html"]) expect(read(page), page).toMatch(/href="webcal:\/\/[^"]+\/calendar\/dont-miss\.ics"/);
    });

    it("publishes the projection, not the job's file", () => {
      const published = JSON.parse(read("events.json"));
      expect(published.lastSuccessfulRun).toBe(meta.lastSuccessfulRun);
      expect(published.events.map((e: { id: string }) => e.id)).toEqual(events.map((e) => e.id));
      expect(read("events.json")).not.toContain('"evidence"');
    });

    it("writes llms.txt, robots.txt, the sitemap, and the 404", () => {
      expect(read("llms.txt")).toContain("/events.json");
      expect(read("robots.txt")).toContain("/sitemap.xml");
      const sitemap = read("sitemap.xml");
      expect(sitemap).toContain("<urlset");
      expect(sitemap).toContain(`/e/${events[0]!.id}</loc><lastmod>${events[0]!.lastVerified}</lastmod>`);
      const notFound = read("404.html");
      expect(notFound).toContain("Nothing here");
      expect(notFound).toContain('<meta name="robots" content="noindex">');
      expect(notFound).not.toContain('rel="canonical"');
    });

    it("carries Event JSON-LD and the share image on an event page", () => {
      const sample = events.find((e) => e.dontMiss)!;
      const html = read(`e/${sample.id}.html`);
      expect(html).toContain('"@type":"Event"');
      expect(html).toContain('"eventStatus":"https://schema.org/EventScheduled"');
      expect(html).toContain('"addressCountry":"US"');
      expect(html).toContain("/og.png");
      expect(html).toContain('<meta property="og:image:width" content="1200">');
      // Verified from the page linked above when the list is the event's own page, else from the list it was read from (#53).
      expect(html).toMatch(/Date and venue verified .* from (the page linked above|<a [^>]*>the list at [^<]+<\/a>)\./);
    });

    it("declares the site, its search action, and the picks on the front page", () => {
      const html = read("index.html");
      expect(html).toContain('"@type":"WebSite"');
      expect(html).toContain('"@type":"ItemList"');
      expect(html).toContain("explore?when=all&q={search_term_string}");
    });

    it("titles the front page for the search it answers, and names the site in its JSON-LD (#168)", () => {
      const html = read("index.html");
      expect(html).toContain("<title>Kansas City events this week · KC This Week</title>");
      expect(html).toContain('<meta property="og:title" content="Kansas City events this week · KC This Week">');
      expect(html).toContain('"@type":"WebSite","name":"KC This Week"');
    });

    it("names the dataset's license on the about page and in llms.txt (#167)", () => {
      expect(read("about.html")).toMatch(/<a href="https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/"[^>]*>CC BY 4\.0<\/a>/);
      expect(read("llms.txt")).toContain("CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)");
    });

    it("leaves a schedule that only repeats its title out of an Always there row", () => {
      const html = read("index.html");
      const detail = (id: string) => html.match(new RegExp(`href="/e/${id}"[^>]*>.*?</a><span class="detail"[^>]*>(.*?)</span>`))?.[1]?.replaceAll("&#39;", "'").replaceAll("&quot;", "\"").replaceAll("&amp;", "&");
      const rows = pickAlwaysThere(events, alwaysTherePicks);
      expect(rows.length, "the committed dataset has Always there rows").toBeGreaterThan(0);
      for (const e of rows) {
        // Every row ends on its venue line, and none opens by repeating its own title.
        expect(detail(e.id), e.title).toMatch(new RegExp(`${RegExp.escape(venueLine(e))}$`));
        expect(detail(e.id), e.title).not.toMatch(new RegExp(`^${RegExp.escape(e.title)} ·`, "i"));
      }
      // While First Friday's record holds the schedule "First Friday" (since the 2026-10-12 run), its row is the venue alone.
      const firstFriday = rows.find((e) => e.title === "First Friday" && e.schedule === "First Friday");
      if (firstFriday) expect(detail(firstFriday.id)).toBe("Crossroads Arts District");
    });

    it("gives a recurring event's page no Add to calendar link, and a dated one's page has it", () => {
      const recurring = events.find((e) => e.recurrence === "recurring");
      expect(recurring, "the committed dataset has a recurring event").toBeDefined();
      expect(read(`e/${recurring!.id}.html`)).not.toContain("Add to calendar");
      const dated = events.find((e) => e.recurrence === "one-off")!;
      expect(read(`e/${dated.id}.html`)).toContain(`href="/e/${dated.id}.ics"`);
    });

    it("names Lawrence once in a Lawrence event's location line", () => {
      const lawrence = events.find((e) => e.region === "Lawrence" && e.neighborhood === "Lawrence");
      expect(lawrence, "the committed dataset has an event whose neighborhood is Lawrence").toBeDefined();
      // The venue is a link to its page (#137); the line's text is what is read.
      const where = /<p class="where"[^>]*>(.*?)<\/p>/.exec(read(`e/${lawrence!.id}.html`))![1]!.replace(/<[^>]*>/g, "");
      expect(where).toBe(`${lawrence!.venue} · Lawrence`);
    });

    it("gives pages extensionless canonical URLs that match the sitemap", () => {
      const canonical = (p: string) => /rel="canonical" href="([^"]+)"/.exec(read(p))![1]!;
      expect(canonical(`e/${events[0]!.id}.html`)).toMatch(new RegExp(`/e/${events[0]!.id}$`));
      expect(canonical("index.html")).toMatch(/\/$/);
      expect(canonical("about.html")).toMatch(/\/about$/);
    });
    it("links the ICO, the SVG, and the apple-touch-icon from every page, and serves the mark as /favicon.svg", () => {
      expect(read("favicon.svg")).toBe(faviconSvg());
      expect(has("apple-touch-icon.png")).toBe(true);
      expect(has("favicon.ico")).toBe(true);
      for (const page of ["index.html", "explore.html", "about.html", "404.html", `e/${events[0]!.id}.html`]) {
        expect(read(page), page).toContain('<link rel="icon" href="/favicon.ico" sizes="32x32"><link rel="icon" href="/favicon.svg" type="image/svg+xml">');
        expect(read(page), page).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
      }
    });
  });
});
