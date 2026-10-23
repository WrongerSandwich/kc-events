import { longDateLine } from "./date-line";
import { addDays } from "./dates";
import { venueLine } from "./events";
import { ALL_EVENTS_FEED, kindFeedPath, PICKS_FEED } from "./feeds";
import { bucketDontMiss, HORIZONS } from "./horizon";
import { kindLanding, landingRange, regionLanding } from "./landing";
import { WHEN_PRESETS, type WhenPreset } from "./query";
import { slugify } from "./slugs";
import type { PublishedDataset, PublishedEvent } from "./types";

type DatasetEvent = PublishedDataset["events"][number];

/**
 * What each field of an /events.json event means, for llms.txt (#188). Keyed by the type, so a field added to
 * PublishedEvent without a line here fails the typecheck.
 */
export const EVENTS_JSON_FIELDS: Record<keyof DatasetEvent, string> = {
  id: "stable id (evt_...); the event's page is /e/<id> and its calendar file /e/<id>.ics",
  title: "the event's name",
  start: "local ISO date (YYYY-MM-DD) or date-time with offset; absent for recurring events and for a run already underway when first read",
  end: "same form as start, when the page gave one; a limited run's closing day",
  schedule: "recurring events only, the schedule in words (\"Every Tuesday, 7pm\")",
  venue: "the venue's name",
  room: "the room inside the venue, when the page named one",
  neighborhood: "the venue's neighborhood",
  region: "one of the regions under Lists",
  primaryUrl: "the venue's or organizer's page the date and venue were read from",
  eventUrl: "the event's own page, when one was linked; where details and tickets are",
  price: "as the event's own page stated it",
  ages: "the age limit as the event's own page stated it",
  days: "a limited run's weekdays, 0 for Sunday, when it does not play every day of its span",
  daysLine: "those days in words (\"Fri–Sun\"), present exactly when days is",
  kind: "one of the kinds under Lists",
  recurrence: "one-off, limited-run, or recurring",
  dontMiss: "true for a pick",
  whyLine: "a pick's one-line reason, written by a model",
  lastVerified: "when the date and venue were last read from primaryUrl, an ISO instant",
  description: "a short description written by a model from the event's page, when there is one",
};

export type LlmsInput = {
  origin: string;
  siteName: string;
  tagline: string;
  repoUrl: string;
  lastSuccessfulRun: string;
  /** The build's local date, which the kind and region pages and the picks are as of. */
  today: string;
  horizonWeeks: number;
  kinds: readonly string[];
  regions: readonly string[];
  neighborhoods: Record<string, readonly string[]>;
  venueCount: number;
  schemaVersion: number;
  events: PublishedEvent[];
};

/** The `when` presets in words; keyed by the presets, so a new one without a line here fails the typecheck. */
const WHEN_WORDS: Record<WhenPreset, string> = {
  today: "today",
  "fri-sun": "this weekend, Friday (or today, if later) through Sunday",
  weekend: "today through Sunday, the default",
  "7d": "the next 7 days",
  "30d": "the next 30 days",
  all: "every date",
};

/**
 * /llms.txt (llmstxt.org's shape: an H1, a blockquote, then H2 sections of links), complete enough to use alone
 * (#188): the pages and lists with their counts, the calendar feeds, the explorer's query grammar, the dataset's
 * fields, the picks, and how to cite it.
 */
export function llmsTxt(i: LlmsInput): string {
  const at = (path: string) => new URL(path, i.origin).toString();
  // A placeholder in a path stays readable: new URL would escape its angle brackets.
  const pattern = (path: string) => `${i.origin.replace(/\/$/, "")}${path}`;
  const range = landingRange(i.today, i.horizonWeeks);
  const landingLine = (page: { path: string; heading: string; count: number }) => `- ${at(page.path)} : ${page.heading}, ${page.count} ${page.count === 1 ? "event" : "events"}`;
  const kindPages = i.kinds.map((k) => kindLanding(k, i.events, i.today, range));
  const regionPages = i.regions.map((r) => regionLanding(r, i.events, i.today, range, i.neighborhoods[r] ?? []));
  const kindSlugs = i.kinds.map(slugify);
  const regionSlugs = i.regions.map(slugify);
  const [kind] = kindSlugs;
  const [region] = regionSlugs;
  const buckets = bucketDontMiss(i.events, i.today);
  const picks = HORIZONS.flatMap((h) => buckets[h]);
  const kindFeeds = i.kinds.slice(0, 2).map((k) => at(kindFeedPath(k))).join(", ");
  const presets = WHEN_PRESETS.map((p) => `${p} (${WHEN_WORDS[p]})`).join(", ");

  return `# ${i.siteName}

> ${i.tagline}

A weekly research job reads Kansas City venue and organizer pages directly, a language model writes each listing from the page, and an event is published only when its date and venue were read from the venue's or organizer's own page (cite-or-drop). Anything it cannot cite is held back. Every event shows when it was last verified. A pick, tagged Don't miss, is an editorial call, made by a model under written rules, that a one-off or limited run is worth going out of the way for; recurring events are never picks.

Last run: ${i.lastSuccessfulRun}. ${i.events.length} active events.

Cite as: ${i.siteName}, ${i.origin.replace(/\/$/, "")} (data under CC BY 4.0)

## Pages

- ${at("/")} : the picks by horizon, then recurring events
- ${at("/explore")} : active events, filterable by date, kind, region, picks, and search (filters are in the query string, applied in the browser); its HTML lists today through Sunday whatever the query, so read every event from /events.json below
- ${pattern("/e/<id>")} : one event; add .ics for a calendar file
- ${at("/about")} : how the site is made and where to report a wrong listing

## Lists

Each kind and region page lists ${range.from} through ${range.to} without JavaScript; the counts are its events in those dates.

- ${at("/changes")} : what the last run added, moved, and took off
- ${at("/venues")} : ${i.venueCount} venues, by region; each has a page at ${pattern("/v/<slug>")} with its address and upcoming events
${kindPages.map(landingLine).join("\n")}
${regionPages.map(landingLine).join("\n")}

## Calendar feeds

Rewritten with every build, at least daily; each event links its page on this site.

- ${at(ALL_EVENTS_FEED)} : every dated event
- ${at(PICKS_FEED)} : the picks, today through ${i.horizonWeeks} weeks ahead
- ${pattern("/calendar/<kind>.ics")} : one kind, by its slug under Explorer links${kindFeeds === "" ? "" : `; e.g. ${kindFeeds}`}

The same addresses with webcal:// in place of https:// open the subscribe dialog in Apple Calendar. Google Calendar (Other calendars, From URL) and Outlook take the https:// address.

## Explorer links

${at("/explore")}?<key>=<value>&..., read in the browser; a missing or unknown value is the default. Keys:

- when: ${presets}, or a range YYYY-MM-DD..YYYY-MM-DD; e.g. when=${i.today}..${addDays(i.today, 6)}
- kind: a kind's slug, repeatable (any of them): ${kindSlugs.join(", ")}
- region: a region's slug, repeatable (any of them): ${regionSlugs.join(", ")}
- picks=1: the picks only
- recurring=1: include recurring events, which are left out by default
- saved=1: the events the visitor saved, kept in their own browser
- q: search words, all of which must appear in the title, venue, room, neighborhood, region, kind, or a pick's reason
- sort: date (the default) or venue
- ids: a shortlist, event ids comma-separated, shown in that order; e.g. ids=evt_a,evt_b

Example: ${at("/explore")}?${kind === undefined ? "" : `kind=${kind}&`}${region === undefined ? "" : `region=${region}&`}when=all

## The dataset

- ${at("/events.json")} : every active event as JSON, free to reuse under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/) with a link back
- ${at("/sitemap.xml")} : every page
- ${i.repoUrl} : the code and the research rules

/events.json is an object: schemaVersion (${i.schemaVersion}, raised when a field is removed or changes meaning), generatedAt (an ISO instant), lastSuccessfulRun, and events, each with these fields (optional ones are left out when empty):

${Object.entries(EVENTS_JSON_FIELDS).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

## The picks

Every pick from today on, by when it can first be seen.

${picks.length === 0 ? "None." : picks.map((e) => `- [${e.title}](${at(`/e/${e.id}`)}): ${longDateLine(e, i.today)} · ${venueLine(e)}${e.whyLine ? `. ${e.whyLine}` : ""}`).join("\n")}
`;
}
