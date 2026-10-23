// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { events } from "../src/generated/events";
import { meta } from "../src/generated/meta";
import { isDated } from "../src/lib/events";
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

// What the build makes of any week's data: the pages, feeds and files every build writes. The checks that need the week
// to hold a pick, a recurring event, a Lawrence one, or Always there rows are in endpoints.data.test.ts (#191).
describe("built output", () => {
  describe.skipIf(!matchesGenerated)("of the generated dataset", () => {
    it("writes the calendar feeds: the picks, every dated event, and each kind's (#136)", () => {
      const unfolded = (p: string) => read(p).replace(/\r\n[ \t]/g, "");
      const vevents = (p: string) => unfolded(p).split("BEGIN:VEVENT").length - 1;
      expect(unfolded("calendar/picks.ics")).toContain("NAME:KC This Week · Picks\r\nX-WR-CALNAME:KC This Week · Picks\r\n");
      expect(unfolded("calendar/picks.ics")).toContain("REFRESH-INTERVAL;VALUE=DURATION:P1D\r\nX-PUBLISHED-TTL:P1D\r\n");
      // The feed describes itself and links the page it came from; a kind's has its colour (#190).
      expect(unfolded("calendar/picks.ics")).toMatch(/\r\nX-WR-CALDESC:[^\r]*Last researched [^\r]+\r\nURL:[^\r]+\/\r\n/);
      expect(unfolded("calendar/music.ics")).toMatch(/\r\nURL:[^\r]+\/k\/music\r\nCOLOR:darkorchid\r\n/);
      expect(has("calendar/dont-miss.ics")).toBe(false);
      expect(unfolded("calendar.ics")).toContain("X-WR-CALNAME:KC This Week\r\n");
      expect(vevents("calendar.ics")).toBe(events.filter(isDated).length);
      for (const kind of meta.kinds) expect(vevents(`calendar/${slugify(kind)}.ics`), kind).toBe(events.filter((e) => isDated(e) && e.kind === kind).length);
      const dated = events.find(isDated);
      expect(dated, "the generated dataset has a dated event").toBeDefined();
      expect(unfolded("calendar.ics")).toMatch(new RegExp(`\r\nURL:[^\r]*/e/${dated!.id}\r\n`));
    });

    it("links the picks' feed by webcal from the front page and the about page (#136)", () => {
      for (const page of ["index.html", "about.html"]) expect(read(page), page).toMatch(/href="webcal:\/\/[^"]+\/calendar\/picks\.ics"/);
    });

    it("calls a flagged event a pick in reader-facing prose, keeping the tag's words (#185)", () => {
      expect(read("about.html")).toContain("What a pick is");
      for (const page of ["index.html", "about.html", "explore.html", "llms.txt"]) expect(read(page), page).not.toMatch(/don(['’]|&#39;)t-miss/i);
    });

    it("publishes the projection, not the job's file", () => {
      const published = JSON.parse(read("events.json"));
      expect(published.lastSuccessfulRun).toBe(meta.lastSuccessfulRun);
      expect(published.events.map((e: { id: string }) => e.id)).toEqual(events.map((e) => e.id));
      expect(read("events.json")).not.toContain('"evidence"');
    });

    it("writes llms.txt, robots.txt, the sitemap, and the 404", () => {
      expect(read("llms.txt")).toContain("/events.json");
      // An agent's plain fetch runs no script, so the explorer's HTML is the week whatever the query; say where every event is.
      expect(read("llms.txt")).toContain("its HTML lists today through Sunday whatever the query, so read every event from /events.json");
      expect(read("robots.txt")).toContain("/sitemap.xml");
      const sitemap = read("sitemap.xml");
      expect(sitemap).toContain("<urlset");
      expect(sitemap).toContain(`/e/${events[0]!.id}</loc><lastmod>${events[0]!.lastVerified}</lastmod>`);
      const notFound = read("404.html");
      expect(notFound).toContain("Nothing here");
      expect(notFound).toContain('<meta name="robots" content="noindex">');
      expect(notFound).not.toContain('rel="canonical"');
    });

    it("declares the site, its search action, and the picks on the front page", () => {
      const html = read("index.html");
      expect(html).toContain('"@type":"WebSite"');
      expect(html).toContain('"@type":"ItemList"');
      expect(html).toContain("explore?when=all&q={search_term_string}");
    });

    it("dates the front page's site and picks list by the last run (#189)", () => {
      const html = read("index.html");
      expect(html.split(`"dateModified":"${meta.lastSuccessfulRun}"`).length - 1).toBe(2);
    });

    it("describes every event page in its own words, under 160 characters, its Event at the page's own URL (#189)", () => {
      const descriptions = new Map<string, string>();
      for (const e of events) {
        const html = read(`e/${e.id}.html`);
        const description = /<meta name="description" content="([^"]*)"/.exec(html)![1]!;
        // Entities count as one character each, as a snippet shows them.
        const length = description.replace(/&(?:#\d+|#x[\da-f]+|\w+);/gi, "x").length;
        expect(length, e.id).toBeLessThan(160);
        // Two events with the same title, day and venue are a duplicate listing in the data, not a site fault.
        expect(descriptions.get(description), `${e.id} says what ${descriptions.get(description)} says: a duplicate listing in the data?`).toBeUndefined();
        descriptions.set(description, e.id);
        const canonical = /rel="canonical" href="([^"]+)"/.exec(html)![1]!;
        if (html.includes('"@type":"Event"')) expect(html, e.id).toContain(`"@id":"${canonical}"`);
      }
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

    it("gives pages extensionless canonical URLs that match the sitemap", () => {
      const canonical = (p: string) => /rel="canonical" href="([^"]+)"/.exec(read(p))![1]!;
      expect(canonical(`e/${events[0]!.id}.html`)).toMatch(new RegExp(`/e/${events[0]!.id}$`));
      expect(canonical("index.html")).toMatch(/\/$/);
      expect(canonical("about.html")).toMatch(/\/about$/);
    });
    it("reaches every page type from the front page within two clicks (#188)", () => {
      // The audit's links.mjs method: follow same-site links from / breadth-first, two levels deep.
      const file = (href: string) => {
        const path = href.split(/[?#]/)[0]!.replace(/^\//, "");
        return path === "" ? "index.html" : /\.[a-z]+$/.test(path) ? path : `${path}.html`;
      };
      const links = (page: string) => [...read(page).matchAll(/href="(\/[^"/][^"]*|\/)"/g)].map((m) => m[1]!);
      const reached = new Set<string>(["/"]);
      let frontier = ["/"];
      for (let depth = 0; depth < 2; depth++) {
        const next: string[] = [];
        for (const href of frontier) {
          if (!file(href).endsWith(".html") || !has(file(href))) continue;
          for (const l of links(file(href))) if (!reached.has(l.split(/[?#]/)[0]!)) { reached.add(l.split(/[?#]/)[0]!); next.push(l); }
        }
        frontier = next;
      }
      const paths = [...reached];
      for (const prefix of ["/explore", "/about", "/changes", "/venues", "/e/", "/v/", "/k/", "/r/"]) expect(paths.some((p) => p.startsWith(prefix)), prefix).toBe(true);
      // Every kind and region page is one click away, from the front page itself.
      const front = links("index.html");
      for (const k of meta.kinds) expect(front, k).toContain(`/k/${slugify(k)}`);
      for (const r of meta.regions) expect(front, r).toContain(`/r/${slugify(r)}`);
    });

    it("links the venues from every page's footer, and For venues from a venue page (#188)", () => {
      for (const page of ["index.html", "explore.html", "about.html"]) expect(read(page), page).toMatch(/<footer[\s\S]*href="\/venues"/);
      const venuePage = readdirSync(new URL("v/", dist)).find((f) => f.endsWith(".html"))!;
      expect(read(`v/${venuePage}`)).toContain('<a href="/about#for-venues">Is this your venue? How to correct a listing</a>');
    });

    it("declares both colour schemes, a theme colour for each, and the locale on every page (#188)", () => {
      for (const page of ["index.html", "explore.html", "about.html", `e/${events[0]!.id}.html`]) {
        const html = read(page);
        expect(html, page).toContain('<meta name="color-scheme" content="light dark">');
        expect(html, page).toMatch(/<meta name="theme-color" media="\(prefers-color-scheme: light\)" content="#[0-9a-f]{6}">/);
        expect(html, page).toMatch(/<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content="#[0-9a-f]{6}">/);
        expect(html, page).toContain('<meta property="og:locale" content="en_US">');
      }
    });

    it("offers the picks' feed by https address beside webcal, and Google Calendar beside Add to calendar (#188)", () => {
      for (const page of ["index.html", "about.html"]) expect(read(page), page).toContain("Google Calendar: Other calendars, From URL.");
      const dated = events.find(isDated)!;
      expect(read(`e/${dated.id}.html`)).toMatch(/<a class="ics[^"]*" href="https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&amp;[^"]+" rel="nofollow"[^>]*>Google Calendar<\/a>/);
    });

    it("writes llms.txt's sections and its cite line (#188)", () => {
      const text = read("llms.txt");
      for (const h of ["## Pages", "## Lists", "## Calendar feeds", "## Explorer links", "## The dataset", "## This week's picks"]) expect(text, h).toContain(`\n${h}\n`);
      expect(text).toContain("Cite as: KC This Week, ");
      for (const k of meta.kinds) expect(text, k).toContain(`/k/${slugify(k)} : `);
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
