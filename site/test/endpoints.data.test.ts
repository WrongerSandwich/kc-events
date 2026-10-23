// @vitest-environment node
// The "data" project (`pnpm test:data`): what the build makes of the committed dataset, where the check needs the week
// to hold something (a one-off, a pick, a recurring event, a Lawrence one, Always there rows). scripts/weekly-run.sh
// runs it on a run's new data, after building the site, before committing (#191). A check whose event the week lacks
// is skipped, not failed: a week with no picks or no Lawrence event is not a broken build, and the code is held by the
// unit tests and the end-to-end suite on fixtures. Which Always there picks found nothing goes in the run report.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { alwaysTherePicks } from "../src/always-there";
import { events } from "../src/generated/events";
import { meta } from "../src/generated/meta";
import { pickAlwaysThere } from "../src/lib/always-there";
import { venueLine } from "../src/lib/events";

const dist = new URL("../dist/", import.meta.url);
const has = (p: string) => existsSync(new URL(p, dist));
const read = (p: string) => readFileSync(new URL(p, dist), "utf8");

// Unlike the unit project, which skips its built-output checks without a matching build, this one is run to check the
// build, so a missing or mismatched dist/ fails it.
const matchesGenerated = has("llms.txt") && read("llms.txt").includes(`Last run: ${meta.lastSuccessfulRun}. ${events.length} active events.`);

const oneOff = events.find((e) => e.recurrence === "one-off");
const recurring = events.find((e) => e.recurrence === "recurring");
const pick = events.find((e) => e.dontMiss);
const lawrence = events.find((e) => e.region === "Lawrence" && e.neighborhood === "Lawrence");
const alwaysThere = pickAlwaysThere(events, alwaysTherePicks);

describe("the build of the committed dataset", () => {
  it("is in dist/, built from the generated modules", () => {
    expect(matchesGenerated, "dist/ is missing or was built from another dataset: run `SITE_TODAY=last-run pnpm build` before `pnpm test:data`").toBe(true);
  });

  it.skipIf(!matchesGenerated || !oneOff)("emits a page and a calendar file per dated event, and none for anything else", () => {
    expect(has(`e/${oneOff!.id}.html`)).toBe(true);
    expect(has(`e/${oneOff!.id}.ics`)).toBe(true);
    expect(read(`e/${oneOff!.id}.html`)).toContain(`href="/e/${oneOff!.id}.ics"`);
    if (recurring) expect(has(`e/${recurring.id}.ics`)).toBe(false);
  });

  it.skipIf(!matchesGenerated || !recurring)("gives a recurring event's page no Add to calendar link", () => {
    expect(read(`e/${recurring!.id}.html`)).not.toContain("Add to calendar");
  });

  it.skipIf(!matchesGenerated || !pick)("carries Event JSON-LD and the share image on a pick's page", () => {
    const html = read(`e/${pick!.id}.html`);
    expect(html).toContain('"@type":"Event"');
    expect(html).toContain('"eventStatus":"https://schema.org/EventScheduled"');
    expect(html).toContain('"addressCountry":"US"');
    expect(html).toContain("/og.png");
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    // Verified from the page linked above when the list is the event's own page, else from the list it was read from (#53).
    expect(html).toMatch(/Date and venue verified .* from (the page linked above|<a [^>]*>the list at [^<]+<\/a>)\./);
  });

  it.skipIf(!matchesGenerated || alwaysThere.length === 0)("leaves a schedule that only repeats its title out of an Always there row", () => {
    const html = read("index.html");
    const detail = (id: string) => html.match(new RegExp(`href="/e/${id}"[^>]*>.*?</a><span class="detail"[^>]*>(.*?)</span>`))?.[1]?.replaceAll("&#39;", "'").replaceAll("&quot;", "\"").replaceAll("&amp;", "&");
    for (const e of alwaysThere) {
      // Every row ends on its venue line, and none opens by repeating its own title.
      expect(detail(e.id), e.title).toMatch(new RegExp(`${RegExp.escape(venueLine(e))}$`));
      expect(detail(e.id), e.title).not.toMatch(new RegExp(`^${RegExp.escape(e.title)} ·`, "i"));
    }
    // While First Friday's record holds the schedule "First Friday" (since the 2026-10-12 run), its row is the venue alone.
    const firstFriday = alwaysThere.find((e) => e.title === "First Friday" && e.schedule === "First Friday");
    if (firstFriday) expect(detail(firstFriday.id)).toBe("Crossroads Arts District");
  });

  it.skipIf(!matchesGenerated || !lawrence)("names Lawrence once in a Lawrence event's location line", () => {
    // The venue is a link to its page (#137); the line's text is what is read.
    const where = /<p class="where"[^>]*>(.*?)<\/p>/.exec(read(`e/${lawrence!.id}.html`));
    expect(where, "the Lawrence event's page has a location line").not.toBeNull();
    expect(where![1]!.replace(/<[^>]*>/g, "")).toBe(`${lawrence!.venue} · Lawrence`);
  });
});
