// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { events } from "../src/generated/events";
import { meta } from "../src/generated/meta";
import { faviconSvg } from "../src/lib/favicon";

const dist = new URL("../dist/", import.meta.url);
const has = (p: string) => existsSync(new URL(p, dist));
const read = (p: string) => readFileSync(new URL(p, dist), "utf8");

// The build in dist/ matches the generated modules when its llms.txt names the same run.
const matchesGenerated = has("llms.txt") && read("llms.txt").includes(`Last run: ${meta.lastSuccessfulRun}.`);

it.runIf(process.env.CI !== undefined && !matchesGenerated)("has a build of the generated dataset to check (CI)", () => {
  expect.fail("dist/ is missing or was built from another dataset; CI must run `pnpm build` before `pnpm test`");
});

describe.skipIf(!matchesGenerated)("built output", () => {
  it("emits a page and a calendar file per dated event, and none for anything else", () => {
    const sample = events.find((e) => e.recurrence === "one-off")!;
    expect(has(`e/${sample.id}.html`)).toBe(true);
    expect(has(`e/${sample.id}.ics`)).toBe(true);
    const recurring = events.find((e) => e.recurrence === "recurring");
    if (recurring) expect(has(`e/${recurring.id}.ics`)).toBe(false);
  });

  it("publishes the dataset verbatim", () => {
    expect(read("events.json")).toBe(readFileSync(new URL("../../data/events.json", import.meta.url), "utf8"));
  });

  it("writes llms.txt, robots.txt, the sitemap, and the 404", () => {
    expect(read("llms.txt")).toContain("/events.json");
    expect(read("robots.txt")).toContain("/sitemap.xml");
    const sitemap = read("sitemap.xml");
    expect(sitemap).toContain("<urlset");
    expect(sitemap).toContain(`/e/${events[0]!.id}</loc>`);
    expect(read("404.html")).toContain("Nothing here");
  });

  it("carries Event JSON-LD and the share image on an event page", () => {
    const sample = events.find((e) => e.dontMiss)!;
    const html = read(`e/${sample.id}.html`);
    expect(html).toContain('"@type":"Event"');
    expect(html).not.toContain("addressRegion");
    expect(html).toContain("/og.png");
    // Verified from the page linked above when the list is the event's own page, else from the list it was read from (#53).
    expect(html).toMatch(/Date and venue verified .* from (the page linked above|<a [^>]*>the list at [^<]+<\/a>)\./);
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
    const where = /<p class="where"[^>]*>([^<]*)<\/p>/.exec(read(`e/${lawrence!.id}.html`))![1]!;
    expect(where).toBe(`${lawrence!.venue} · Lawrence`);
  });

  it("gives pages extensionless canonical URLs that match the sitemap", () => {
    const canonical = (p: string) => /rel="canonical" href="([^"]+)"/.exec(read(p))![1]!;
    expect(canonical(`e/${events[0]!.id}.html`)).toMatch(new RegExp(`/e/${events[0]!.id}$`));
    expect(canonical("index.html")).toMatch(/\/$/);
    expect(canonical("about.html")).toMatch(/\/about$/);
  });
  it("links the favicon and the apple-touch-icon from every page, and serves the tile with no day as /favicon.svg", () => {
    expect(read("favicon.svg")).toBe(faviconSvg());
    expect(has("apple-touch-icon.png")).toBe(true);
    for (const page of ["index.html", "explore.html", "about.html", "404.html", `e/${events[0]!.id}.html`]) {
      expect(read(page), page).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
      expect(read(page), page).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
    }
  });
});
