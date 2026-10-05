# Public Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public website over `data/events.json`: an editorial front page (the don't-miss list by horizon, always there), a client-side explorer over every active event, a page per event, calendar export, browser-local saves, and an honest research/staleness surface, deployed to Vercel from this repo.

**Architecture:** `site/` is a second pnpm workspace package. A build step parses the dataset with the research job's own zod schema, projects active non-past events to `PublishedEvent`, and writes a generated module that Astro pages and three Svelte islands import. All date, filter, grouping, URL, and calendar logic is pure functions in `site/src/lib/`, unit-tested with vitest; the islands hydrate with the build's state and then switch to the visitor's date and URL.

**Tech Stack:** Astro 7 (static output, no adapter), Svelte 5 via `@astrojs/svelte`, TypeScript 7, vitest 5 + `@testing-library/svelte` (jsdom), Playwright 1.63 + `@axe-core/playwright`, pnpm 10 workspace, Vercel Git integration.

**Spec:** `docs/superpowers/specs/2026-10-04-public-site-design.md`

**Model per task:** each task names the implementer model. `sonnet` where this plan supplies the code nearly verbatim; `opus` where design judgment is the work. Every reviewer is `opus`.

## Global Constraints

- Node `>=22` (root `package.json` `engines`); the site pins `"engines": { "node": "22.x" }` because Vercel reads that, not `.nvmrc`.
- Only `site/src/build/` imports from the job's `src/`; nothing under `site/src/lib/` or `site/src/components/` does (a test greps for `../../src` and `../../../src`).
- Nothing under `site/src/lib/` reads the clock: no `new Date()` with empty parentheses, no `Date.now(` (a test greps). Every function takes `today: string` (`YYYY-MM-DD`) or `now: Date`.
- All date math is in `America/Chicago` (`timezone` in `research.config.yaml`). Calendar arithmetic on `YYYY-MM-DD` strings goes through `Date.UTC`, never local `Date` objects.
- `zod` and `yaml` are **not** added to `site/package.json`; they resolve from the root's `node_modules`.
- Vocabulary from `CONTEXT.md`: *don't-miss list* (never "picks", "highlights", "featured"), *always there*, *horizon*, *methods page*, *staleness banner*, *region*, *event* (never "item", "listing" in site copy or code names), *why-line* (never "blurb"), *kind* (never "category"), *primary page*.
- Site copy: plain and friendly, headings are nouns, no exclamation marks.
- No third-party requests from any page: fonts self-hosted, no analytics, no CDN scripts.
- URLs are extensionless without trailing slashes: `trailingSlash: "never"`, `build.format: "file"`, `cleanUrls: true` in `site/vercel.json`.
- Every island hydrates with the state it was server-rendered with (`published.buildToday`, default filters) and only in `onMount` switches to the visitor's date and the URL's filters.
- Performance budgets (compressed HTML + referenced CSS + JS): front page 50 KB, explorer 100 KB, event page 40 KB. Projected payload limit 400 KB raw.
- Commit messages are plain imperative sentences like the repo's ("Group the neighborhood list into regions"), ending with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

Inputs the spec implies but is silent on, each pinned by a test in the owning task:

1. **A limited run with `end` and no `start`** (three in today's data) in every lib function: `firstDay` is undefined, it is underway, it buckets by its end, it matches any date range up to its end, it groups under "On now", and `toIcs` emits it as an all-day event on its closing date. — Tasks 2, 4, 6, 7.
2. **`today` is a Sunday**: "through Sunday" is today alone, the heading still says "This weekend," and `weekend` in the explorer matches only today. — Tasks 4, 6.
3. **A `localStorage` that throws on read or write** (private mode, quota): every save button renders unsaved and toggling does not throw. — Task 8.
4. **A query string with the comma region, an unknown slug, a reversed or malformed range, and repeated `when` keys**: `parseQuery` returns valid filters and never throws; `toQuery(parseQuery(x))` is stable. — Task 5.
5. **A dataset that fails the site's build assertions** (schema version bumped, an active event with no region source, a duplicate id, payload over the limit): `loadPublished` throws with a message naming the cause and `astro build` exits non-zero. — Task 3.

---

## File structure

```
pnpm-workspace.yaml                       packages: [site], includeWorkspaceRoot: true
vitest.config.ts                          root vitest excludes site/**
.github/workflows/site-ci.yml             typecheck, test, build, size check, e2e on PRs and main
site/
  package.json  astro.config.mjs  tsconfig.json  vercel.json  vitest.config.ts  playwright.config.ts
  src/
    site.config.ts                        name, tagline, repoUrl, staleAfterDays, origin
    build/
      load-dataset.ts                     parse + project; the only importer of ../../src
      generate.ts                         writes src/generated/published.ts (gitignored)
    generated/published.ts                (generated) events, kinds, regions, lastSuccessfulRun, buildToday, timeZone
    lib/
      types.ts                            PublishedEvent, Published
      dates.ts                            localDate, addDays, weekday, comingSunday, todayIn, format*
      events.ts                           isPast, isMultiDay, isUnderway, firstDay, lastDay, hostOf
      horizon.ts                          horizon, horizonBounds, horizonHeading, bucketDontMiss
      slugs.ts                            slugify, slugTable
      query.ts                            Filters, DEFAULT_FILTERS, parseQuery, toQuery, isDefault
      filter.ts                           dateRange, matches
      group.ts                            groupResults
      ics.ts                              toIcs
      saves.ts                            createSaves
    styles/tokens.css  styles/base.css
    layouts/Base.astro
    components/
      Header.astro  Footer.astro  KindChip.astro
      StalenessBanner.svelte  SaveButton.svelte  DontMissList.svelte  EventPageIsland.svelte  Explorer.svelte
      FilterRail.svelte  ResultRow.svelte
    pages/
      index.astro  explore.astro  about.astro  404.astro
      e/[id].astro  e/[id].ics.ts
      events.json.ts  llms.txt.ts  robots.txt.ts
  public/og.png  public/fonts/ (via @fontsource-variable)
  scripts/size-check.ts  scripts/share-image.html  scripts/share-image.ts
  test/                                   vitest: lib, build assertions, components, greps; fixtures/event.ts helper
  e2e/                                    playwright specs + fixtures/events.json
```

---

### Task 0: Glossary amendments and the job-side neighborhood issue

**Model:** sonnet

**Files:**
- Modify: `CONTEXT.md` (the "Site" section, lines ~148–166)

**Interfaces:** none; documentation only.

- [ ] **Step 1: Amend the Horizon and Staleness banner entries and add Explorer and Event page**

Replace the `**Horizon**:` entry's body with:

```
The time bucket a don't-miss event falls into: through Sunday (headed "This weekend" Thursday to Sunday, "This week" Monday to Wednesday), next two weeks, further out. A one-off is bucketed by its start, a limited run by its closing date.
```

Replace the `**Staleness banner**:` entry's body with:

```
The notice shown on every page when the last successful run is more than nine days old. The site cannot see a failed run (a failed run commits nothing), so age is the proxy: a weekly cadence plus two days of slack.
```

Append after the `**Staleness banner**` entry:

```
**Explorer**:
The page that lets a reader slice every active event by date, kind, region, don't-miss, recurrence, and search, with the filters in the URL so a view can be shared.
_Avoid_: browse page, search page, list view

**Event page**:
The page for one active event, at `/e/<id>`: its date, venue, why-line when flagged, primary link, calendar file, last-verified stamp, and corrections link.
_Avoid_: detail page, listing page
```

- [ ] **Step 2: Check the glossary still reads cleanly**

Run: `sed -n 145,180p CONTEXT.md`
Expected: the four entries in place, each a bold term, a colon, a body line, and for the two new ones an `_Avoid_` line.

- [ ] **Step 3: File the job-side issue**

```bash
gh issue create --title 'Remap stored neighborhoods that name a region instead of a neighborhood' --label enhancement --body "$(cat <<'EOF'
31 active events in data/events.json carry the neighborhood "Johnson County", a region name from before #23 grouped neighborhoods under regions. `regionOf` returns undefined for them.

The site (docs/superpowers/specs/2026-10-04-public-site-design.md, section 4) maps a neighborhood that names a region to that region at build and reports the count, so this does not block the site. The job should:

1. On re-verification, re-place an event whose stored neighborhood is not on the list (the job maps only at extraction time today), so these converge to a listed neighborhood or the catch-all.
2. Add a run-report line counting stored neighborhoods that are off the list, so this cannot drift silently again.

Acceptance: after one weekly run, no active event has a neighborhood that is not in research.config.yaml's lists or the catch-all; the run report shows the count.
EOF
)"
```

- [ ] **Step 4: Commit**

```bash
git add CONTEXT.md
git commit -m "$(cat <<'EOF'
Define the site's horizon, staleness, explorer, and event page terms

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 1: Workspace and Astro skeleton

**Model:** sonnet

**Files:**
- Create: `pnpm-workspace.yaml`, `vitest.config.ts`
- Create: `site/package.json`, `site/astro.config.mjs`, `site/tsconfig.json`, `site/vitest.config.ts`, `site/vercel.json`, `site/.gitignore`
- Create: `site/src/site.config.ts`, `site/src/lib/types.ts`, `site/src/pages/index.astro`
- Create: `site/test/greps.test.ts`
- Modify: `package.json` (root scripts)

**Interfaces:**
- Produces: `PublishedEvent`, `Published` (`site/src/lib/types.ts`); `siteConfig` (`site/src/site.config.ts`). Every later task imports these.

- [ ] **Step 1: Make the root a workspace**

`pnpm-workspace.yaml`:

```yaml
packages:
  - site
# The root package (the research job) is a workspace member too, so `pnpm -r test` runs both suites.
includeWorkspaceRoot: true
```

Root `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

// The site has its own vitest config with the Svelte plugin; keep its tests out of the root run.
export default defineConfig({ test: { exclude: ["site/**", "node_modules/**"] } });
```

Add to root `package.json` `scripts`:

```json
"test:all": "pnpm -r test",
"typecheck:all": "pnpm -r typecheck"
```

- [ ] **Step 2: Create the site package**

`site/package.json`:

```json
{
  "name": "kc-events-site",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": "22.x" },
  "scripts": {
    "generate": "tsx src/build/generate.ts",
    "dev": "pnpm generate && astro dev",
    "build": "pnpm generate && astro build && tsx scripts/size-check.ts",
    "generate-and-build": "pnpm generate && astro build",
    "build:e2e": "SITE_TODAY=2026-10-05 SITE_DATASET=e2e/fixtures/events.json pnpm generate-and-build",
    "preview": "astro preview",
    "typecheck": "pnpm generate && astro check",
    "test": "pnpm generate && vitest run",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@astrojs/sitemap": "^3.7.4",
    "@astrojs/svelte": "^9.0.1",
    "@fontsource-variable/inter": "^5.2.0",
    "astro": "^7.3.5",
    "svelte": "^5.57.1"
  },
  "devDependencies": {
    "@astrojs/check": "^0.9.0",
    "@axe-core/playwright": "^4.13.0",
    "@playwright/test": "^1.63.0",
    "@testing-library/svelte": "^5.4.2",
    "@testing-library/jest-dom": "^6.6.0",
    "jsdom": "^30.1.2",
    "tsx": "^4.23.15",
    "vitest": "^5.0.3"
  }
}
```

Then from the repo root: `pnpm install`. If a version above does not resolve, use `pnpm --filter kc-events-site add <pkg>@latest` and keep the resolved range; do not add `zod` or `yaml`.

`site/.gitignore`:

```
dist/
dist-e2e/
.astro/
src/generated/
test-results/
playwright-report/
```

`site/astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import sitemap from "@astrojs/sitemap";
import { siteConfig } from "./src/site.config.ts";

export default defineConfig({
  site: siteConfig.origin,
  output: "static",
  trailingSlash: "never",
  build: { format: "file" },
  integrations: [svelte(), sitemap()],
});
```

`site/tsconfig.json`:

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "types": ["node", "@testing-library/jest-dom"]
  },
  "include": [".astro/types.d.ts", "src/**/*", "test/**/*", "e2e/**/*", "scripts/**/*"],
  "exclude": ["dist"]
}
```

`site/vercel.json`:

```json
{
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    {
      "source": "/events.json",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=3600" },
        { "key": "Access-Control-Allow-Origin", "value": "*" }
      ]
    }
  ]
}
```

`site/vitest.config.ts`:

```ts
import { getViteConfig } from "astro/config";
import { svelteTesting } from "@testing-library/svelte/vite";

export default getViteConfig({
  plugins: [svelteTesting()],
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
  },
});
```

`site/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Site config and the shared types**

`site/src/site.config.ts`:

```ts
/** Site-level values. The time zone is the job's (`timezone` in research.config.yaml), read at build, not duplicated here. */
export const siteConfig = {
  name: "KC Events",
  tagline: "A weekly researched, ad-free list of what's worth doing in Kansas City.",
  repoUrl: "https://github.com/WrongerSandwich/kc-events",
  /** Days after the last successful run before every page shows the staleness banner. */
  staleAfterDays: 9,
  /** The canonical origin for the sitemap, JSON-LD, and share tags; previews are never canonical. */
  origin: process.env.SITE_ORIGIN ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:4321"),
} as const;
```

Check the repo URL: `git remote get-url origin` and use that owner/name.

`site/src/lib/types.ts`:

```ts
export type Recurrence = "one-off" | "limited-run" | "recurring";

/** An active event as the site sees it: the job's record minus its internals, plus region. */
export type PublishedEvent = {
  id: string;
  title: string;
  /** Local ISO date (YYYY-MM-DD) or date-time with offset, as the job wrote it. Absent for recurring events, and for a limited run already underway when first read. */
  start?: string;
  end?: string;
  /** Recurring events only, e.g. "Every Tuesday, 7pm". */
  schedule?: string;
  venue: string;
  neighborhood: string;
  region: string;
  primaryUrl: string;
  kind: string;
  recurrence: Recurrence;
  dontMiss: boolean;
  whyLine?: string;
  lastVerified: string;
};

/** What the build writes to src/generated/published.ts and every page and island imports. */
export type Published = {
  events: PublishedEvent[];
  kinds: string[];
  /** The config's regions in order, then the catch-all. */
  regions: string[];
  lastSuccessfulRun: string;
  /** The local date the build ran on (or SITE_TODAY); islands render with it first, then the visitor's. */
  buildToday: string;
  timeZone: string;
};
```

- [ ] **Step 4: A placeholder front page so the build has something to emit**

`site/src/pages/index.astro`:

```astro
---
import { siteConfig } from "../site.config";
---
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /><title>{siteConfig.name}</title></head>
  <body><h1>What's on in Kansas City</h1><p>{siteConfig.tagline}</p></body>
</html>
```

Until Task 3 exists, make `generate` a no-op so scripts run: create `site/src/build/generate.ts` containing only `// replaced in Task 3` and `export {};`. Also create `site/scripts/size-check.ts` with `// replaced in Task 14` and `export {};`.

- [ ] **Step 5: Write the grep tests (they pass trivially now and guard every later task)**

`site/test/greps.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const root = new URL("../src/", import.meta.url).pathname;

describe("client-safe code", () => {
  it("never imports the research job from lib or components", () => {
    const offenders = ["lib", "components"].flatMap((d) => filesUnder(join(root, d))).filter((f) => /\.\.\/(\.\.\/)?src\//.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("never reads the clock in lib", () => {
    const offenders = filesUnder(join(root, "lib")).filter((f) => /new Date\(\)|Date\.now\(/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
```

Create `site/src/components/.gitkeep` so the directory exists.

- [ ] **Step 6: Run everything**

Run from the root: `pnpm install && pnpm -r typecheck && pnpm -r test && pnpm --filter kc-events-site build`
Expected: root suite passes (226 tests) and does not pick up `site/test`; site suite passes (2 tests); `astro check` reports 0 errors; `dist/index.html` exists. If `astro check` complains about TypeScript 7, record the exact error in the commit message and pin `typescript` in `site/devDependencies` to the version `@astrojs/check` wants; the root keeps its own.

- [ ] **Step 7: Commit**

```bash
git add pnpm-workspace.yaml vitest.config.ts package.json pnpm-lock.yaml site
git commit -m "$(cat <<'EOF'
Add the site workspace: Astro, Svelte, and the shared published types

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Date helpers and event predicates

**Model:** sonnet

**Files:**
- Create: `site/src/lib/dates.ts`, `site/src/lib/events.ts`
- Create: `site/test/fixtures/event.ts` (the `event()` helper every later test uses)
- Test: `site/test/dates.test.ts`, `site/test/events.test.ts`

**Interfaces:**
- Consumes: `PublishedEvent` from Task 1.
- Produces (for tests): `event(over?: Partial<PublishedEvent>): PublishedEvent` in `site/test/fixtures/event.ts`, a valid one-off to override per test. It lives outside any `.test.ts` file so importing it never re-runs a suite.
- Produces: `localDate(iso)`, `addDays(date, n)`, `weekday(date)`, `comingSunday(today)`, `todayIn(timeZone, now)`, `formatDay(date)`, `formatLong(date)`, `formatRange(from, to)`, `formatTime(iso)`, `isDateOnly(iso)`; `firstDay(e)`, `lastDay(e)`, `isDated(e)`, `isPast(e, today)`, `isMultiDay(e)`, `isUnderway(e, today)`, `hostOf(url)`.

- [ ] **Step 1: Write the failing date tests**

`site/test/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addDays, comingSunday, formatDay, formatLong, formatRange, formatTime, isDateOnly, localDate, todayIn, weekday } from "../src/lib/dates";

describe("dates", () => {
  it("takes the local date off either dataset form", () => {
    expect(localDate("2026-10-09T19:00:00-05:00")).toBe("2026-10-09");
    expect(localDate("2026-10-09")).toBe("2026-10-09");
  });

  it("adds days across month, year, and the DST change without drift", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-05", 14)).toBe("2026-10-19");
    expect(addDays("2026-10-05", -1)).toBe("2026-10-04");
  });

  it("knows the weekday and the coming Sunday", () => {
    expect(weekday("2026-10-05")).toBe(1); // Monday
    expect(weekday("2026-10-11")).toBe(0);
    expect(comingSunday("2026-10-05")).toBe("2026-10-11");
    expect(comingSunday("2026-10-08")).toBe("2026-10-11");
    expect(comingSunday("2026-10-11")).toBe("2026-10-11"); // Sunday is its own
  });

  it("gives today in the zone from an instant", () => {
    // 03:30 UTC on Oct 6 is 22:30 on Oct 5 in Chicago.
    expect(todayIn("America/Chicago", new Date("2026-10-06T03:30:00Z"))).toBe("2026-10-05");
    expect(todayIn("America/Chicago", new Date("2026-10-06T12:00:00Z"))).toBe("2026-10-06");
  });

  it("formats for headings, rows, and event pages", () => {
    expect(formatDay("2026-10-09")).toBe("Fri Oct 9");
    expect(formatLong("2026-10-09")).toBe("Friday, October 9");
    expect(formatRange("2026-10-05", "2026-10-11")).toBe("Oct 5–11");
    expect(formatRange("2026-10-29", "2026-11-02")).toBe("Oct 29–Nov 2");
    expect(formatTime("2026-10-09T19:00:00-05:00")).toBe("7:00 pm");
    expect(formatTime("2026-10-09T12:30:00-05:00")).toBe("12:30 pm");
    expect(formatTime("2026-10-09T00:15:00-05:00")).toBe("12:15 am");
    expect(isDateOnly("2026-10-09")).toBe(true);
    expect(isDateOnly("2026-10-09T19:00:00-05:00")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && pnpm vitest run test/dates.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement dates**

`site/src/lib/dates.ts`:

```ts
/**
 * Calendar helpers over the dataset's two date forms: a local date (YYYY-MM-DD) or a local
 * date-time with offset. Arithmetic runs on YYYY-MM-DD through Date.UTC so a DST change can
 * never shift a day. Nothing here reads the clock; callers pass `today` or `now`.
 */

const DAY_MS = 86_400_000;
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The local date of either dataset form; the job writes local wall time, so the first ten characters are it. */
export function localDate(iso: string): string {
  return iso.slice(0, 10);
}

export function isDateOnly(iso: string): boolean {
  return iso.length === 10;
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y!, m!, d!];
}

function utc(date: string): number {
  const [y, m, d] = parts(date);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return fromUtc(utc(date) + n * DAY_MS);
}

/** 0 is Sunday, as in Date. */
export function weekday(date: string): number {
  return new Date(utc(date)).getUTCDay();
}

/** The Sunday on or after the date. */
export function comingSunday(today: string): string {
  return addDays(today, (7 - weekday(today)) % 7);
}

/** The calendar date of an instant in the zone. */
export function todayIn(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "Fri Oct 9" */
export function formatDay(date: string): string {
  const [, m, d] = parts(date);
  return `${SHORT_DAYS[weekday(date)]} ${SHORT_MONTHS[m - 1]} ${d}`;
}

/** "Friday, October 9" */
export function formatLong(date: string): string {
  const [, m, d] = parts(date);
  return `${LONG_DAYS[weekday(date)]}, ${LONG_MONTHS[m - 1]} ${d}`;
}

/** "Oct 5–11", or "Oct 29–Nov 2" across a month. */
export function formatRange(from: string, to: string): string {
  const [, fm, fd] = parts(from);
  const [, tm, td] = parts(to);
  return fm === tm ? `${SHORT_MONTHS[fm - 1]} ${fd}–${td}` : `${SHORT_MONTHS[fm - 1]} ${fd}–${SHORT_MONTHS[tm - 1]} ${td}`;
}

/** "7:00 pm" from the local wall time in a date-time; the offset is ignored because the time is already local. */
export function formatTime(iso: string): string {
  const h = Number(iso.slice(11, 13));
  const mm = iso.slice(14, 16);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${suffix}`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd site && pnpm vitest run test/dates.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the test helper and the failing event predicate tests**

`site/test/fixtures/event.ts`:

```ts
import type { PublishedEvent } from "../../src/lib/types";

/** A valid one-off; override fields per test. */
export function event(over: Partial<PublishedEvent> = {}): PublishedEvent {
  return {
    id: "evt_000000000001",
    title: "A show",
    start: "2026-10-09T19:00:00-05:00",
    venue: "recordBar",
    neighborhood: "Crossroads",
    region: "Central KC",
    primaryUrl: "https://www.therecordbar.com/shows",
    kind: "music",
    recurrence: "one-off",
    dontMiss: false,
    lastVerified: "2026-10-03T21:47:36-05:00",
    ...over,
  };
}
```

`site/test/events.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { firstDay, hostOf, isDated, isMultiDay, isPast, isUnderway, lastDay } from "../src/lib/events";
import { event } from "./fixtures/event";

const oneDay = event();
const multiDay = event({ start: "2026-10-09", end: "2026-10-11" });
const run = event({ recurrence: "limited-run", start: "2026-09-20", end: "2026-11-14" });
const runNoStart = event({ recurrence: "limited-run", start: undefined, end: "2026-10-31" });
const recurring = event({ recurrence: "recurring", start: undefined, schedule: "Every Tuesday, 7pm" });

describe("event predicates", () => {
  it("finds first and last days, including the start-less run", () => {
    expect(firstDay(oneDay)).toBe("2026-10-09");
    expect(lastDay(oneDay)).toBe("2026-10-09");
    expect(lastDay(multiDay)).toBe("2026-10-11");
    expect(firstDay(runNoStart)).toBeUndefined();
    expect(lastDay(runNoStart)).toBe("2026-10-31");
    expect(isDated(recurring)).toBe(false);
    expect(isDated(runNoStart)).toBe(true);
  });

  it("is past only when its last day is before today", () => {
    expect(isPast(oneDay, "2026-10-09")).toBe(false);
    expect(isPast(oneDay, "2026-10-10")).toBe(true);
    expect(isPast(multiDay, "2026-10-11")).toBe(false);
    expect(isPast(runNoStart, "2026-11-01")).toBe(true);
    expect(isPast(recurring, "2099-01-01")).toBe(false);
  });

  it("is multi-day only with an end on a later day", () => {
    expect(isMultiDay(oneDay)).toBe(false);
    expect(isMultiDay(event({ start: "2026-10-09T19:00:00-05:00", end: "2026-10-09T23:00:00-05:00" }))).toBe(false);
    expect(isMultiDay(multiDay)).toBe(true);
    expect(isMultiDay(runNoStart)).toBe(true);
  });

  it("is underway when its span includes today; a start-less run always is", () => {
    expect(isUnderway(run, "2026-10-05")).toBe(true);
    expect(isUnderway(run, "2026-09-19")).toBe(false);
    expect(isUnderway(run, "2026-11-15")).toBe(false);
    expect(isUnderway(multiDay, "2026-10-10")).toBe(true);
    expect(isUnderway(oneDay, "2026-10-09")).toBe(false); // single-day events are never "on now"
    expect(isUnderway(runNoStart, "2026-10-05")).toBe(true);
    expect(isUnderway(recurring, "2026-10-05")).toBe(false);
  });

  it("names the host of a primary page without www", () => {
    expect(hostOf("https://www.therecordbar.com/shows")).toBe("therecordbar.com");
    expect(hostOf("https://kcrep.org/event/x")).toBe("kcrep.org");
    expect(hostOf("not a url")).toBe("not a url");
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `cd site && pnpm vitest run test/events.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 7: Implement the predicates**

`site/src/lib/events.ts`:

```ts
import { localDate } from "./dates";
import type { PublishedEvent } from "./types";

export function isDated(e: PublishedEvent): boolean {
  return e.recurrence !== "recurring";
}

/** The first local day, undefined for a recurring event or a limited run read after it began. */
export function firstDay(e: PublishedEvent): string | undefined {
  return e.start === undefined ? undefined : localDate(e.start);
}

/** The last local day: the end, else the start; undefined for a recurring event. */
export function lastDay(e: PublishedEvent): string | undefined {
  const last = e.end ?? e.start;
  return last === undefined ? undefined : localDate(last);
}

/** The job's rule: past when the last day is before today. An undated event cannot be past. */
export function isPast(e: PublishedEvent, today: string): boolean {
  const last = lastDay(e);
  return last !== undefined && last < today;
}

/** Ends on a later day than it starts; a start-less run counts. */
export function isMultiDay(e: PublishedEvent): boolean {
  const first = firstDay(e);
  const last = lastDay(e);
  if (last === undefined) return false;
  return first === undefined || last > first;
}

/** On now: a multi-day span that includes today. Single-day events are never underway; they are listed under their day. */
export function isUnderway(e: PublishedEvent, today: string): boolean {
  if (!isMultiDay(e)) return false;
  const first = firstDay(e);
  return (first === undefined || first <= today) && lastDay(e)! >= today;
}

/** "therecordbar.com" for a link label; the input when it is not a URL. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
```

- [ ] **Step 8: Run to verify pass**

Run: `cd site && pnpm vitest run`
Expected: PASS (all, including the greps).

- [ ] **Step 9: Commit**

```bash
git add site/src/lib/dates.ts site/src/lib/events.ts site/test/fixtures/event.ts site/test/dates.test.ts site/test/events.test.ts
git commit -m "$(cat <<'EOF'
Add the site's date helpers and event predicates

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Load, project, and generate the published module

**Model:** sonnet

**Files:**
- Create: `site/src/build/load-dataset.ts`, `site/src/build/generate.ts` (replacing the stub)
- Test: `site/test/load-dataset.test.ts`, `site/test/committed-dataset.test.ts`

**Interfaces:**
- Consumes: `parseDataset`, `DATASET_SCHEMA_VERSION` (`src/dataset.ts`); `parseConfig`, `ELSEWHERE_IN_THE_METRO` (`src/config.ts`); `regionOf` (`src/taxonomy.ts`); `toLocalDate` (`src/time.ts`); `isPast` (Task 2).
- Produces: `loadPublished({ datasetPath, configPath, today? }): Published`, `regionFor(neighborhood, config): string`, `SITE_EXPECTS_SCHEMA_VERSION`, `MAX_PAYLOAD_BYTES`; the generated `site/src/generated/published.ts` exporting `published: Published`.

- [ ] **Step 1: Write the failing tests**

`site/test/load-dataset.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPublished, MAX_PAYLOAD_BYTES, SITE_EXPECTS_SCHEMA_VERSION } from "../src/build/load-dataset";

const configYaml = `
neighborhoods:
  Central KC: [Crossroads, Downtown]
  Johnson County: [Olathe]
  Lawrence: [Lawrence]
`;

function activeEvent(over: Record<string, unknown> = {}) {
  return {
    id: "evt_000000000001",
    title: "A show",
    start: "2026-10-09T19:00:00-05:00",
    venue: "recordBar",
    neighborhood: "Crossroads",
    primaryUrl: "https://www.therecordbar.com/shows",
    kind: "music",
    recurrence: "one-off",
    dontMiss: false,
    firstSeen: "2026-10-03T16:05:31-05:00",
    lastVerified: "2026-10-03T21:47:36-05:00",
    status: "active",
    verificationFailures: 0,
    lead: { lane: "registry", source: "recordBar" },
    evidence: { date: "Oct 09 7:00 pm", venue: "recordBar presents" },
    ...over,
  };
}

function dataset(events: unknown[], over: Record<string, unknown> = {}) {
  return { schemaVersion: 1, generatedAt: "2026-10-05T06:30:00-05:00", lastSuccessfulRun: "2026-10-05T06:30:00-05:00", events, sourceState: {}, discoveryState: {}, ...over };
}

function write(ds: unknown, config = configYaml) {
  const dir = mkdtempSync(join(tmpdir(), "kc-site-"));
  const datasetPath = join(dir, "events.json");
  const configPath = join(dir, "research.config.yaml");
  writeFileSync(datasetPath, JSON.stringify(ds));
  writeFileSync(configPath, config);
  return { datasetPath, configPath, today: "2026-10-05" };
}

describe("loadPublished", () => {
  it("keeps active, non-past events and projects them with a region", () => {
    const p = loadPublished(write(dataset([
      activeEvent(),
      activeEvent({ id: "evt_000000000002", status: "unverified", lastVerified: undefined, evidence: {} }),
      activeEvent({ id: "evt_000000000003", status: "expired", expiryReason: "past" }),
      activeEvent({ id: "evt_000000000004", start: "2026-10-04" }),
      activeEvent({ id: "evt_000000000005", neighborhood: "Olathe" }),
      activeEvent({ id: "evt_000000000006", recurrence: "recurring", start: undefined, schedule: "Every Tuesday" }),
    ])));
    expect(p.events.map((e) => e.id)).toEqual(["evt_000000000001", "evt_000000000005", "evt_000000000006"]);
    expect(p.events[0]).toEqual({
      id: "evt_000000000001", title: "A show", start: "2026-10-09T19:00:00-05:00", venue: "recordBar", neighborhood: "Crossroads", region: "Central KC",
      primaryUrl: "https://www.therecordbar.com/shows", kind: "music", recurrence: "one-off", dontMiss: false, lastVerified: "2026-10-03T21:47:36-05:00",
    });
    expect(p.events[1]!.region).toBe("Johnson County");
    expect(p.regions).toEqual(["Central KC", "Johnson County", "Lawrence", "Elsewhere in the metro"]);
    expect(p.kinds).toContain("music");
    expect(p.lastSuccessfulRun).toBe("2026-10-05T06:30:00-05:00");
    expect(p.buildToday).toBe("2026-10-05");
    expect(p.timeZone).toBe("America/Chicago");
  });

  it("maps a neighborhood that names a region to that region, and anything else unlisted to the catch-all", () => {
    const p = loadPublished(write(dataset([
      activeEvent({ neighborhood: "Johnson County" }),
      activeEvent({ id: "evt_000000000002", neighborhood: "Elsewhere in the metro" }),
      activeEvent({ id: "evt_000000000003", neighborhood: "Atlantis" }),
    ])));
    expect(p.events.map((e) => e.region)).toEqual(["Johnson County", "Elsewhere in the metro", "Elsewhere in the metro"]);
  });

  it("refuses a schema version it was not written against", () => {
    expect(SITE_EXPECTS_SCHEMA_VERSION).toBe(1);
    expect(() => loadPublished(write(dataset([activeEvent()], { schemaVersion: 2 })))).toThrow(/schema/i);
  });

  it("refuses a dataset no run has written, a duplicate id, and an oversized payload", () => {
    expect(() => loadPublished(write(dataset([activeEvent()], { lastSuccessfulRun: null, generatedAt: null })))).toThrow(/no successful run/i);
    expect(() => loadPublished(write(dataset([activeEvent(), activeEvent()])))).toThrow(/evt_000000000001/);
    const big = Array.from({ length: Math.ceil(MAX_PAYLOAD_BYTES / 200) + 1 }, (_, i) => activeEvent({ id: `evt_${String(i).padStart(12, "0")}`, title: "x".repeat(150) }));
    expect(() => loadPublished(write(dataset(big)))).toThrow(/payload/i);
  });
});
```

`site/test/committed-dataset.test.ts` (the site's equivalent of the root's committed-files test):

```ts
import { describe, expect, it } from "vitest";
import { loadPublished } from "../src/build/load-dataset";

describe("the committed dataset through the site's loader", () => {
  const p = loadPublished({
    datasetPath: new URL("../../data/events.json", import.meta.url).pathname,
    configPath: new URL("../../research.config.yaml", import.meta.url).pathname,
    today: "2026-10-05",
  });

  it("loads, with every event placed in a region and ids unique", () => {
    expect(p.events.length).toBeGreaterThan(0);
    for (const e of p.events) expect(p.regions).toContain(e.region);
    expect(new Set(p.events.map((e) => e.id)).size).toBe(p.events.length);
  });

  it("carries only active fields", () => {
    for (const e of p.events) {
      expect(e).not.toHaveProperty("evidence");
      expect(e).not.toHaveProperty("lead");
      expect(e.venue).toBeTruthy();
      expect(e.lastVerified).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && pnpm vitest run test/load-dataset.test.ts test/committed-dataset.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the loader**

`site/src/build/load-dataset.ts`:

```ts
/**
 * Build-time only: the one place the site reads the research job's files and types. Parses with the
 * job's own schemas, keeps active non-past events, and projects them to what the browser sees.
 */
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { ELSEWHERE_IN_THE_METRO, parseConfig, type RunConfig } from "../../../src/config.ts";
import { DATASET_SCHEMA_VERSION, parseDataset, type Event } from "../../../src/dataset.ts";
import { regionOf } from "../../../src/taxonomy.ts";
import { toLocalDate } from "../../../src/time.ts";
import { isPast } from "../lib/events";
import type { Published, PublishedEvent } from "../lib/types";

/** Bumped by hand when the site is updated for a new dataset shape; a job-side bump fails the build until then. */
export const SITE_EXPECTS_SCHEMA_VERSION = 1;
/** Raw bytes of the projected events; past this the explorer's one-page design needs rethinking. */
export const MAX_PAYLOAD_BYTES = 400_000;

/** A listed neighborhood's region; a neighborhood that names a region is that region; anything else is the catch-all. */
export function regionFor(neighborhood: string, config: RunConfig): string {
  const listed = regionOf(neighborhood, config);
  if (listed !== undefined) return listed;
  const named = Object.keys(config.neighborhoods).find((r) => r.toLowerCase() === neighborhood.trim().toLowerCase());
  return named ?? ELSEWHERE_IN_THE_METRO;
}

function project(e: Event, config: RunConfig): PublishedEvent {
  const out: PublishedEvent = {
    id: e.id,
    title: e.title,
    venue: e.venue!,
    neighborhood: e.neighborhood,
    region: regionFor(e.neighborhood, config),
    primaryUrl: e.primaryUrl,
    kind: e.kind,
    recurrence: e.recurrence,
    dontMiss: e.dontMiss,
    lastVerified: e.lastVerified!,
  };
  if (e.start !== undefined) out.start = e.start;
  if (e.end !== undefined) out.end = e.end;
  if (e.schedule !== undefined) out.schedule = e.schedule;
  if (e.whyLine !== undefined) out.whyLine = e.whyLine;
  return out;
}

export function loadPublished(opts: { datasetPath: string; configPath: string; today?: string }): Published {
  const config = parseConfig(parseYaml(readFileSync(opts.configPath, "utf8")));
  const dataset = parseDataset(JSON.parse(readFileSync(opts.datasetPath, "utf8")));
  if (DATASET_SCHEMA_VERSION !== SITE_EXPECTS_SCHEMA_VERSION) {
    throw new Error(`dataset schema version ${DATASET_SCHEMA_VERSION} but the site expects ${SITE_EXPECTS_SCHEMA_VERSION}; update site/src/build and bump SITE_EXPECTS_SCHEMA_VERSION`);
  }
  if (dataset.lastSuccessfulRun === null) throw new Error("the dataset records no successful run; nothing to publish");
  const today = opts.today ?? process.env.SITE_TODAY ?? toLocalDate(new Date(), config.timezone);

  const active = dataset.events.filter((e) => e.status === "active");
  const events = active.map((e) => project(e, config)).filter((e) => !isPast(e, today));

  const seen = new Set<string>();
  for (const e of events) {
    if (seen.has(e.id)) throw new Error(`duplicate active event id ${e.id}`);
    seen.add(e.id);
  }
  const bytes = Buffer.byteLength(JSON.stringify(events));
  if (bytes > MAX_PAYLOAD_BYTES) throw new Error(`projected payload is ${bytes} bytes, over the ${MAX_PAYLOAD_BYTES} limit`);

  const unlisted = active.filter((e) => regionOf(e.neighborhood, config) === undefined && e.neighborhood !== ELSEWHERE_IN_THE_METRO);
  if (unlisted.length > 0) {
    const counts = new Map<string, number>();
    for (const e of unlisted) counts.set(e.neighborhood, (counts.get(e.neighborhood) ?? 0) + 1);
    console.warn(`site: ${unlisted.length} active events have a neighborhood no region lists: ${[...counts].map(([n, c]) => `${n} (${c})`).join(", ")}`);
  }

  return {
    events,
    kinds: config.kinds,
    regions: [...Object.keys(config.neighborhoods), ELSEWHERE_IN_THE_METRO],
    lastSuccessfulRun: dataset.lastSuccessfulRun,
    buildToday: today,
    timeZone: config.timezone,
  };
}
```

If `astro check` or vitest cannot resolve `../../../src/config.ts` with the `.ts` extension, the fix is in `site/tsconfig.json`: confirm `allowImportingTsExtensions` is inherited from `astro/tsconfigs/strict` (it is in Astro 5+); do not change the import to `.js`.

- [ ] **Step 4: Run to verify pass**

Run: `cd site && pnpm vitest run test/load-dataset.test.ts test/committed-dataset.test.ts`
Expected: PASS. The committed test prints one warning naming "Johnson County (31)" or similar; that is correct.

- [ ] **Step 5: The generator**

Replace `site/src/build/generate.ts`:

```ts
/** Writes src/generated/published.ts for the pages and islands to import. Run before dev, build, test, and check. */
import { mkdirSync, writeFileSync } from "node:fs";
import { loadPublished } from "./load-dataset.ts";

const here = new URL(".", import.meta.url);
const root = new URL("../../../", here);
const published = loadPublished({
  datasetPath: new URL(process.env.SITE_DATASET ?? "data/events.json", process.env.SITE_DATASET ? new URL("../../", here) : root).pathname,
  configPath: new URL("research.config.yaml", root).pathname,
});

const outDir = new URL("../generated/", here);
mkdirSync(outDir, { recursive: true });
writeFileSync(
  new URL("published.ts", outDir),
  `// Generated by src/build/generate.ts from data/events.json; do not edit.\nimport type { Published } from "../lib/types";\nexport const published: Published = ${JSON.stringify(published)};\n`,
);
console.log(`site: wrote ${published.events.length} events for ${published.buildToday}`);
```

`SITE_DATASET` is relative to `site/` (so `e2e/fixtures/events.json` works); the default is the repo's `data/events.json`. `build:e2e` sets both variables on one `pnpm` process so they reach the generator and `astro build` alike (the `events.json` endpoint reads `SITE_DATASET` at build).

- [ ] **Step 6: Run the generator and the whole site suite**

Run: `cd site && pnpm generate && ls src/generated && pnpm test && pnpm typecheck`
Expected: `published.ts` written with a count around 560; all tests pass; `astro check` 0 errors. Confirm `git status` does not list `site/src/generated/` (gitignored).

- [ ] **Step 7: Commit**

```bash
git add site/src/build site/test/load-dataset.test.ts site/test/committed-dataset.test.ts
git commit -m "$(cat <<'EOF'
Load the dataset through the job's schema and generate the published module

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Horizon buckets

**Model:** sonnet

**Files:**
- Create: `site/src/lib/horizon.ts`
- Test: `site/test/horizon.test.ts`

**Interfaces:**
- Consumes: `addDays`, `comingSunday`, `weekday`, `formatRange` (Task 2); `firstDay`, `lastDay`, `isDated`, `isPast`, `isUnderway` (Task 2).
- Produces: `type Horizon = "through-sunday" | "next-two-weeks" | "further-out"`; `HORIZONS: readonly Horizon[]`; `horizonBounds(today): { sunday: string; twoWeeks: string }`; `anchorDate(e): string | undefined`; `horizon(e, today): Horizon | undefined`; `horizonHeading(h, today): string`; `bucketDontMiss(events, today): Record<Horizon, PublishedEvent[]>`; `closingLine(e, today): string`.

- [ ] **Step 1: Write the failing tests**

`site/test/horizon.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { anchorDate, bucketDontMiss, closingLine, horizon, horizonBounds, horizonHeading, HORIZONS } from "../src/lib/horizon";
import { published } from "../src/generated/published";
import { isDated, isPast } from "../src/lib/events";
import { addDays } from "../src/lib/dates";
import { event } from "./fixtures/event";

describe("horizon", () => {
  it("bounds the first bucket at the coming Sunday and the second at today plus fourteen", () => {
    expect(horizonBounds("2026-10-05")).toEqual({ sunday: "2026-10-11", twoWeeks: "2026-10-19" });
    expect(horizonBounds("2026-10-11")).toEqual({ sunday: "2026-10-11", twoWeeks: "2026-10-25" });
    expect(horizonBounds("2026-12-30")).toEqual({ sunday: "2027-01-03", twoWeeks: "2027-01-13" });
  });

  it("heads the first bucket by weekday, always with dates", () => {
    expect(horizonHeading("through-sunday", "2026-10-05")).toBe("This week, Oct 5–11");
    expect(horizonHeading("through-sunday", "2026-10-07")).toBe("This week, Oct 7–11");
    expect(horizonHeading("through-sunday", "2026-10-08")).toBe("This weekend, Oct 8–11");
    expect(horizonHeading("through-sunday", "2026-10-11")).toBe("This weekend, Oct 11");
    expect(horizonHeading("next-two-weeks", "2026-10-05")).toBe("Next two weeks, through Oct 19");
    expect(horizonHeading("further-out", "2026-10-05")).toBe("Further out");
  });

  it("anchors a one-off on its start and a limited run on its close", () => {
    expect(anchorDate(event({ start: "2026-10-09T19:00:00-05:00" }))).toBe("2026-10-09");
    expect(anchorDate(event({ start: "2026-10-09", end: "2026-10-11" }))).toBe("2026-10-09");
    expect(anchorDate(event({ recurrence: "limited-run", start: "2026-09-20", end: "2026-11-14" }))).toBe("2026-11-14");
    expect(anchorDate(event({ recurrence: "limited-run", start: undefined, end: "2026-10-31" }))).toBe("2026-10-31");
    expect(anchorDate(event({ recurrence: "recurring", start: undefined, schedule: "Tuesdays" }))).toBeUndefined();
  });

  it("buckets by anchor against the bounds", () => {
    const today = "2026-10-05";
    expect(horizon(event({ start: "2026-10-06" }), today)).toBe("through-sunday");
    expect(horizon(event({ start: "2026-10-11" }), today)).toBe("through-sunday");
    expect(horizon(event({ start: "2026-10-12" }), today)).toBe("next-two-weeks");
    expect(horizon(event({ start: "2026-10-19" }), today)).toBe("next-two-weeks");
    expect(horizon(event({ start: "2026-10-20" }), today)).toBe("further-out");
    expect(horizon(event({ recurrence: "limited-run", start: "2026-09-01", end: "2026-10-10" }), today)).toBe("through-sunday");
    expect(horizon(event({ recurrence: "limited-run", start: undefined, end: "2026-12-31" }), today)).toBe("further-out");
    expect(horizon(event({ recurrence: "recurring", start: undefined, schedule: "Tuesdays" }), today)).toBeUndefined();
  });

  it("is total over every non-past dated event in the committed dataset for a week of todays", () => {
    for (let i = 0; i < 7; i++) {
      const today = addDays(published.buildToday, i);
      for (const e of published.events) {
        if (!isDated(e) || isPast(e, today)) continue;
        expect(HORIZONS).toContain(horizon(e, today));
      }
    }
  });

  it("groups and sorts the don't-miss events, leaving empty buckets present", () => {
    const today = "2026-10-05";
    const a = event({ id: "a", dontMiss: true, whyLine: "x", start: "2026-10-10" });
    const b = event({ id: "b", dontMiss: true, whyLine: "x", start: "2026-10-06T20:00:00-05:00" });
    const c = event({ id: "c", dontMiss: true, whyLine: "x", recurrence: "limited-run", start: "2026-09-01", end: "2026-11-20" });
    const d = event({ id: "d", dontMiss: false, start: "2026-10-06" });
    const r = event({ id: "r", recurrence: "recurring", start: undefined, schedule: "Tuesdays" });
    const buckets = bucketDontMiss([a, b, c, d, r], today);
    expect(buckets["through-sunday"].map((e) => e.id)).toEqual(["b", "a"]);
    expect(buckets["next-two-weeks"]).toEqual([]);
    expect(buckets["further-out"].map((e) => e.id)).toEqual(["c"]);
  });

  it("writes the closing line for runs", () => {
    const today = "2026-10-05";
    expect(closingLine(event({ recurrence: "limited-run", start: "2026-09-20", end: "2026-10-11" }), today)).toBe("On now, closes Sun Oct 11");
    expect(closingLine(event({ recurrence: "limited-run", start: "2026-10-20", end: "2026-11-14" }), today)).toBe("Opens Tue Oct 20, runs through Sat Nov 14");
    expect(closingLine(event({ recurrence: "limited-run", start: undefined, end: "2026-10-31" }), today)).toBe("On now, closes Sat Oct 31");
    expect(closingLine(event({ start: "2026-10-09", end: "2026-10-11" }), today)).toBe("Fri Oct 9–Sun Oct 11");
    expect(closingLine(event({ start: "2026-10-09", end: "2026-10-11" }), "2026-10-10")).toBe("On now, through Sun Oct 11");
  });
});
```

The committed-dataset totality test imports the generated module, which `pnpm test` writes first (Task 1's script).

- [ ] **Step 2: Run to verify failure**

Run: `cd site && pnpm vitest run test/horizon.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`site/src/lib/horizon.ts`:

```ts
import { addDays, comingSunday, formatDay, formatRange, weekday } from "./dates";
import { firstDay, isDated, isPast, isUnderway, lastDay } from "./events";
import type { PublishedEvent } from "./types";

export type Horizon = "through-sunday" | "next-two-weeks" | "further-out";
export const HORIZONS: readonly Horizon[] = ["through-sunday", "next-two-weeks", "further-out"];

/** The first bucket runs through the coming Sunday; the second through today plus fourteen. */
export function horizonBounds(today: string): { sunday: string; twoWeeks: string } {
  return { sunday: comingSunday(today), twoWeeks: addDays(today, 14) };
}

/** A one-off is placed by its start; a limited run by its close, because the regret is in missing the close. */
export function anchorDate(e: PublishedEvent): string | undefined {
  if (!isDated(e)) return undefined;
  return e.recurrence === "limited-run" ? lastDay(e) : (firstDay(e) ?? lastDay(e));
}

/** Total over every non-past dated event: each lands in exactly one bucket. */
export function horizon(e: PublishedEvent, today: string): Horizon | undefined {
  const anchor = anchorDate(e);
  if (anchor === undefined) return undefined;
  const { sunday, twoWeeks } = horizonBounds(today);
  if (anchor <= sunday) return "through-sunday";
  if (anchor <= twoWeeks) return "next-two-weeks";
  return "further-out";
}

/** "This weekend" Thursday to Sunday, "This week" Monday to Wednesday, always with the dates. */
export function horizonHeading(h: Horizon, today: string): string {
  const { sunday, twoWeeks } = horizonBounds(today);
  switch (h) {
    case "through-sunday": {
      const label = weekday(today) === 0 || weekday(today) >= 4 ? "This weekend" : "This week";
      return today === sunday ? `${label}, ${formatDay(today).slice(4)}` : `${label}, ${formatRange(today, sunday)}`;
    }
    case "next-two-weeks":
      return `Next two weeks, through ${formatDay(twoWeeks).slice(4)}`;
    case "further-out":
      return "Further out";
  }
}

/** The don't-miss events by bucket, each sorted by anchor then title; every bucket present. */
export function bucketDontMiss(events: PublishedEvent[], today: string): Record<Horizon, PublishedEvent[]> {
  const out: Record<Horizon, PublishedEvent[]> = { "through-sunday": [], "next-two-weeks": [], "further-out": [] };
  for (const e of events) {
    if (!e.dontMiss || isPast(e, today)) continue;
    const h = horizon(e, today);
    if (h !== undefined) out[h].push(e);
  }
  for (const h of HORIZONS) out[h].sort((a, b) => anchorDate(a)!.localeCompare(anchorDate(b)!) || a.title.localeCompare(b.title));
  return out;
}

/** The date line for anything with a span: a run's open/close, or a multi-day one-off's range. */
export function closingLine(e: PublishedEvent, today: string): string {
  const first = firstDay(e);
  const last = lastDay(e)!;
  if (e.recurrence === "limited-run") {
    return isUnderway(e, today) ? `On now, closes ${formatDay(last)}` : `Opens ${formatDay(first!)}, runs through ${formatDay(last)}`;
  }
  return isUnderway(e, today) ? `On now, through ${formatDay(last)}` : `${formatDay(first!)}–${formatDay(last)}`;
}
```

`formatDay(x).slice(4)` drops the weekday ("Fri Oct 9" → "Oct 9"); it relies on the three-letter weekday plus a space, which `formatDay` guarantees.

- [ ] **Step 4: Run to verify pass**

Run: `cd site && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/src/lib/horizon.ts site/test/horizon.test.ts
git commit -m "$(cat <<'EOF'
Bucket don't-miss events by horizon, total over every day of the week

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Slugs and URL state

**Model:** sonnet

**Files:**
- Create: `site/src/lib/slugs.ts`, `site/src/lib/query.ts`
- Test: `site/test/slugs.test.ts`, `site/test/query.test.ts`

**Interfaces:**
- Produces: `slugify(name)`, `slugTable(names): { toSlug(name): string; fromSlug(slug): string | undefined }`; `type When`, `type Filters`, `type Sort`, `DEFAULT_FILTERS`, `parseQuery(params, known)`, `toQuery(filters, known)`, `isDefault(filters)`, `WHEN_PRESETS`.

- [ ] **Step 1: Write the failing slug tests**

`site/test/slugs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { slugify, slugTable } from "../src/lib/slugs";
import { published } from "../src/generated/published";

describe("slugs", () => {
  it("makes URL-safe, stable slugs", () => {
    expect(slugify("Kansas City, Kansas")).toBe("kansas-city-kansas");
    expect(slugify("theater/dance")).toBe("theater-dance");
    expect(slugify("Elsewhere in the metro")).toBe("elsewhere-in-the-metro");
    expect(slugify("18th & Vine")).toBe("18th-vine");
  });

  it("round-trips through a table and rejects unknowns", () => {
    const t = slugTable(["music", "theater/dance"]);
    expect(t.toSlug("theater/dance")).toBe("theater-dance");
    expect(t.fromSlug("theater-dance")).toBe("theater/dance");
    expect(t.fromSlug("opera")).toBeUndefined();
  });

  it("gives the config's kinds and regions distinct slugs", () => {
    for (const names of [published.kinds, published.regions]) {
      expect(new Set(names.map(slugify)).size).toBe(names.length);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && pnpm vitest run test/slugs.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement slugs**

`site/src/lib/slugs.ts`:

```ts
/** A URL-safe token for a kind or region name: lowercase, runs of anything but letters and digits become one dash. */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function slugTable(names: readonly string[]): { toSlug(name: string): string; fromSlug(slug: string): string | undefined } {
  const back = new Map(names.map((n) => [slugify(n), n]));
  return { toSlug: slugify, fromSlug: (slug) => back.get(slug) };
}
```

- [ ] **Step 4: Run to verify pass, then write the failing query tests**

Run: `cd site && pnpm vitest run test/slugs.test.ts` → PASS.

`site/test/query.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, isDefault, parseQuery, toQuery, type Filters } from "../src/lib/query";

const known = { kinds: ["music", "film", "theater/dance"], regions: ["Central KC", "Kansas City, Kansas", "Elsewhere in the metro"] };
const parse = (s: string) => parseQuery(new URLSearchParams(s), known);

describe("query state", () => {
  it("parses nothing to the defaults", () => {
    expect(parse("")).toEqual(DEFAULT_FILTERS);
    expect(isDefault(parse(""))).toBe(true);
    expect(toQuery(DEFAULT_FILTERS, known)).toBe("");
  });

  it("parses every filter, with repeated keys for multi-values", () => {
    const f = parse("when=weekend&kind=music&kind=theater-dance&region=kansas-city-kansas&dontmiss=1&recurring=1&saved=1&q=jazz%20night&sort=venue");
    expect(f).toEqual<Filters>({
      when: { preset: "weekend" },
      kinds: ["music", "theater/dance"],
      regions: ["Kansas City, Kansas"],
      dontMiss: true,
      recurring: true,
      saved: true,
      q: "jazz night",
      sort: "venue",
    });
    expect(isDefault(f)).toBe(false);
  });

  it("parses a custom range and normalizes a reversed one", () => {
    expect(parse("when=2026-10-09..2026-10-11").when).toEqual({ from: "2026-10-09", to: "2026-10-11" });
    expect(parse("when=2026-10-11..2026-10-09").when).toEqual({ from: "2026-10-09", to: "2026-10-11" });
  });

  it("ignores unknown keys, unknown slugs, malformed values, and keeps the first of repeated when", () => {
    const f = parse("when=soon&when=today&kind=opera&kind=film&region=mars&sort=price&foo=bar&dontmiss=yes");
    expect(f.when).toEqual({ preset: "all" });
    expect(f.kinds).toEqual(["film"]);
    expect(f.regions).toEqual([]);
    expect(f.sort).toBe("date");
    expect(f.dontMiss).toBe(false);
    expect(parse("when=2026-13-45..2026-10-11").when).toEqual({ preset: "all" });
    expect(parse("when=2026-10-09..").when).toEqual({ preset: "all" });
  });

  it("serializes without defaults and round-trips", () => {
    const f = parse("when=7d&kind=film&region=central-kc&q=x");
    expect(toQuery(f, known)).toBe("when=7d&kind=film&region=central-kc&q=x");
    expect(parse(toQuery(f, known))).toEqual(f);
    const r = parse("when=2026-10-09..2026-10-11&sort=venue");
    expect(toQuery(r, known)).toBe("when=2026-10-09..2026-10-11&sort=venue");
    expect(parse(toQuery(r, known))).toEqual(r);
  });

  it("trims and drops a blank search", () => {
    expect(parse("q=%20%20").q).toBe("");
    expect(toQuery({ ...DEFAULT_FILTERS, q: "  " }, known)).toBe("");
  });
});
```

- [ ] **Step 5: Run to verify failure, then implement**

Run: `cd site && pnpm vitest run test/query.test.ts` → FAIL.

`site/src/lib/query.ts`:

```ts
import { slugTable } from "./slugs";

export const WHEN_PRESETS = ["today", "weekend", "7d", "30d", "all"] as const;
export type WhenPreset = (typeof WHEN_PRESETS)[number];
export type When = { preset: WhenPreset } | { from: string; to: string };
export type Sort = "date" | "venue";

export type Filters = {
  when: When;
  kinds: string[];
  regions: string[];
  dontMiss: boolean;
  recurring: boolean;
  saved: boolean;
  q: string;
  sort: Sort;
};

export const DEFAULT_FILTERS: Filters = { when: { preset: "all" }, kinds: [], regions: [], dontMiss: false, recurring: false, saved: false, q: "", sort: "date" };

export type Known = { kinds: readonly string[]; regions: readonly string[] };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(s: string): boolean {
  if (!DATE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d!));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m! - 1 && t.getUTCDate() === d;
}

function parseWhen(raw: string | null): When {
  if (raw === null) return { preset: "all" };
  if ((WHEN_PRESETS as readonly string[]).includes(raw)) return { preset: raw as WhenPreset };
  const [from, to, ...rest] = raw.split("..");
  if (rest.length > 0 || from === undefined || to === undefined || !validDate(from) || !validDate(to)) return { preset: "all" };
  return from <= to ? { from, to } : { from: to, to: from };
}

/** Filters from a query string; anything unknown or malformed falls back to its default, never throws. */
export function parseQuery(params: URLSearchParams, known: Known): Filters {
  const kinds = slugTable(known.kinds);
  const regions = slugTable(known.regions);
  const pick = (key: string, table: ReturnType<typeof slugTable>) =>
    params.getAll(key).map((s) => table.fromSlug(s)).filter((n): n is string => n !== undefined).filter((n, i, all) => all.indexOf(n) === i);
  const sort = params.get("sort");
  return {
    when: parseWhen(params.get("when")),
    kinds: pick("kind", kinds),
    regions: pick("region", regions),
    dontMiss: params.get("dontmiss") === "1",
    recurring: params.get("recurring") === "1",
    saved: params.get("saved") === "1",
    q: (params.get("q") ?? "").trim(),
    sort: sort === "venue" ? "venue" : "date",
  };
}

/** The query string without "?", defaults omitted; "" when everything is default. */
export function toQuery(f: Filters, known: Known): string {
  const kinds = slugTable(known.kinds);
  const regions = slugTable(known.regions);
  const p = new URLSearchParams();
  if ("from" in f.when) p.set("when", `${f.when.from}..${f.when.to}`);
  else if (f.when.preset !== "all") p.set("when", f.when.preset);
  for (const k of f.kinds) p.append("kind", kinds.toSlug(k));
  for (const r of f.regions) p.append("region", regions.toSlug(r));
  if (f.dontMiss) p.set("dontmiss", "1");
  if (f.recurring) p.set("recurring", "1");
  if (f.saved) p.set("saved", "1");
  if (f.q.trim() !== "") p.set("q", f.q.trim());
  if (f.sort !== "date") p.set("sort", f.sort);
  return p.toString();
}

export function isDefault(f: Filters): boolean {
  return toQuery(f, { kinds: f.kinds, regions: f.regions }) === "";
}
```

- [ ] **Step 6: Run to verify pass**

Run: `cd site && pnpm test`
Expected: PASS. (`URLSearchParams.toString()` encodes a space as `+`; `new URLSearchParams("q=jazz+night")` reads it back, so the round-trip holds. The test's literal `q=x` has no space.)

- [ ] **Step 7: Commit**

```bash
git add site/src/lib/slugs.ts site/src/lib/query.ts site/test/slugs.test.ts site/test/query.test.ts
git commit -m "$(cat <<'EOF'
Carry the explorer's filters in the URL with slugs and repeated keys

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The explorer predicate and result grouping

**Model:** sonnet

**Files:**
- Create: `site/src/lib/filter.ts`, `site/src/lib/group.ts`
- Test: `site/test/filter.test.ts`, `site/test/group.test.ts`

**Interfaces:**
- Consumes: `Filters`, `When` (Task 5); `addDays`, `comingSunday`, `formatDay`, `formatTime`, `isDateOnly` (Task 2); `firstDay`, `lastDay`, `isDated`, `isPast`, `isUnderway` (Task 2); `closingLine` (Task 4).
- Produces: `dateRange(when, today): { from: string; to: string } | undefined`; `matches(e, filters, today, saved): boolean`; `type ResultGroup = { key: string; heading: string; events: PublishedEvent[] }`; `groupResults(events, filters, today, saved): ResultGroup[]`; `rowDateLine(e, today): string`.

- [ ] **Step 1: Write the failing filter tests**

`site/test/filter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dateRange, matches } from "../src/lib/filter";
import { DEFAULT_FILTERS, type Filters } from "../src/lib/query";
import { event } from "./fixtures/event";

const today = "2026-10-05"; // a Monday
const f = (over: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, ...over });
const none = new Set<string>();

describe("dateRange", () => {
  it("turns presets into inclusive ranges from today", () => {
    expect(dateRange({ preset: "all" }, today)).toBeUndefined();
    expect(dateRange({ preset: "today" }, today)).toEqual({ from: today, to: today });
    expect(dateRange({ preset: "weekend" }, today)).toEqual({ from: today, to: "2026-10-11" });
    expect(dateRange({ preset: "weekend" }, "2026-10-11")).toEqual({ from: "2026-10-11", to: "2026-10-11" });
    expect(dateRange({ preset: "7d" }, today)).toEqual({ from: today, to: "2026-10-12" });
    expect(dateRange({ preset: "30d" }, today)).toEqual({ from: today, to: "2026-11-04" });
    expect(dateRange({ from: "2026-10-09", to: "2026-10-11" }, today)).toEqual({ from: "2026-10-09", to: "2026-10-11" });
  });
});

describe("matches", () => {
  const show = event({ start: "2026-10-09T19:00:00-05:00" });
  const run = event({ id: "run", recurrence: "limited-run", start: "2026-09-20", end: "2026-10-20", kind: "art/exhibitions", region: "Lawrence", neighborhood: "Lawrence", venue: "Spencer Museum" });
  const runNoStart = event({ id: "nostart", recurrence: "limited-run", start: undefined, end: "2026-10-31" });
  const trivia = event({ id: "trivia", recurrence: "recurring", start: undefined, schedule: "Tuesdays", title: "Pub trivia" });
  const flagged = event({ id: "flag", dontMiss: true, whyLine: "A rare touring occasion for Kansas City." });

  it("matches everything by default, except recurring events", () => {
    expect(matches(show, f(), today, none)).toBe(true);
    expect(matches(trivia, f(), today, none)).toBe(false);
    expect(matches(trivia, f({ recurring: true }), today, none)).toBe(true);
  });

  it("intersects a span with the date range; recurring events ignore it", () => {
    expect(matches(show, f({ when: { preset: "weekend" } }), today, none)).toBe(true);
    expect(matches(show, f({ when: { preset: "today" } }), today, none)).toBe(false);
    expect(matches(run, f({ when: { preset: "weekend" } }), today, none)).toBe(true);
    expect(matches(run, f({ when: { from: "2026-10-21", to: "2026-10-31" } }), today, none)).toBe(false);
    expect(matches(run, f({ when: { from: "2026-10-20", to: "2026-10-31" } }), today, none)).toBe(true);
    expect(matches(runNoStart, f({ when: { preset: "today" } }), today, none)).toBe(true);
    expect(matches(runNoStart, f({ when: { from: "2026-11-01", to: "2026-11-30" } }), today, none)).toBe(false);
    expect(matches(trivia, f({ recurring: true, when: { preset: "today" } }), today, none)).toBe(true);
  });

  it("ORs within kind and region and ANDs across", () => {
    expect(matches(show, f({ kinds: ["music", "film"] }), today, none)).toBe(true);
    expect(matches(show, f({ kinds: ["film"] }), today, none)).toBe(false);
    expect(matches(run, f({ kinds: ["art/exhibitions"], regions: ["Central KC"] }), today, none)).toBe(false);
    expect(matches(run, f({ kinds: ["art/exhibitions"], regions: ["Central KC", "Lawrence"] }), today, none)).toBe(true);
  });

  it("filters don't-miss and saved", () => {
    expect(matches(show, f({ dontMiss: true }), today, none)).toBe(false);
    expect(matches(flagged, f({ dontMiss: true }), today, none)).toBe(true);
    expect(matches(show, f({ saved: true }), today, none)).toBe(false);
    expect(matches(show, f({ saved: true }), today, new Set([show.id]))).toBe(true);
  });

  it("searches title, venue, neighborhood, and why-line, every term somewhere", () => {
    expect(matches(flagged, f({ q: "touring" }), today, none)).toBe(true);
    expect(matches(flagged, f({ q: "RECORDBAR touring" }), today, none)).toBe(true);
    expect(matches(flagged, f({ q: "crossroads" }), today, none)).toBe(true);
    expect(matches(flagged, f({ q: "touring opera" }), today, none)).toBe(false);
    expect(matches(show, f({ q: "" }), today, none)).toBe(true);
  });

  it("never matches a past event", () => {
    expect(matches(show, f(), "2026-10-10", none)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && pnpm vitest run test/filter.test.ts` → FAIL.

- [ ] **Step 3: Implement the predicate**

`site/src/lib/filter.ts`:

```ts
import { addDays, comingSunday } from "./dates";
import { firstDay, isDated, isPast, lastDay } from "./events";
import type { Filters, When } from "./query";
import type { PublishedEvent } from "./types";

/** The inclusive local-date range a When means from today; undefined is everything. */
export function dateRange(when: When, today: string): { from: string; to: string } | undefined {
  if ("from" in when) return { from: when.from, to: when.to };
  switch (when.preset) {
    case "all": return undefined;
    case "today": return { from: today, to: today };
    case "weekend": return { from: today, to: comingSunday(today) };
    case "7d": return { from: today, to: addDays(today, 7) };
    case "30d": return { from: today, to: addDays(today, 30) };
  }
}

function inRange(e: PublishedEvent, range: { from: string; to: string }): boolean {
  const last = lastDay(e)!;
  const first = firstDay(e) ?? range.from; // a start-less run has been on since before any range
  return first <= range.to && last >= range.from;
}

function searchable(e: PublishedEvent): string {
  return [e.title, e.venue, e.neighborhood, e.whyLine ?? ""].join(" ").toLowerCase();
}

/** The explorer's predicate: AND across filters, OR within kind and region, every search term somewhere. */
export function matches(e: PublishedEvent, f: Filters, today: string, saved: ReadonlySet<string>): boolean {
  if (isPast(e, today)) return false;
  if (!isDated(e)) {
    if (!f.recurring) return false;
  } else {
    const range = dateRange(f.when, today);
    if (range !== undefined && !inRange(e, range)) return false;
  }
  if (f.kinds.length > 0 && !f.kinds.includes(e.kind)) return false;
  if (f.regions.length > 0 && !f.regions.includes(e.region)) return false;
  if (f.dontMiss && !e.dontMiss) return false;
  if (f.saved && !saved.has(e.id)) return false;
  const terms = f.q.toLowerCase().split(/\s+/).filter((t) => t !== "");
  if (terms.length > 0) {
    const hay = searchable(e);
    if (!terms.every((t) => hay.includes(t))) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run to verify pass, then write the failing grouping tests**

Run: `cd site && pnpm vitest run test/filter.test.ts` → PASS.

`site/test/group.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupResults, rowDateLine } from "../src/lib/group";
import { DEFAULT_FILTERS, type Filters } from "../src/lib/query";
import { event } from "./fixtures/event";

const today = "2026-10-05";
const f = (over: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, ...over });
const none = new Set<string>();

const fri7 = event({ id: "fri7", title: "Late show", start: "2026-10-09T19:00:00-05:00", venue: "recordBar" });
const fri5 = event({ id: "fri5", title: "Early show", start: "2026-10-09T17:00:00-05:00", venue: "Knuckleheads" });
const friAll = event({ id: "friAll", title: "Market", start: "2026-10-09", venue: "City Market" });
const tue = event({ id: "tue", title: "Talk", start: "2026-10-06T18:00:00-05:00", venue: "Library" });
const onNow = event({ id: "onNow", title: "Exhibition", recurrence: "limited-run", start: "2026-09-01", end: "2026-10-20", venue: "Nelson-Atkins" });
const onNowSooner = event({ id: "sooner", title: "Closing run", recurrence: "limited-run", start: undefined, end: "2026-10-11", venue: "Spencer" });
const opensLater = event({ id: "later", title: "Opens later", recurrence: "limited-run", start: "2026-10-20", end: "2026-11-14", venue: "Folly" });
const trivia = event({ id: "trivia", title: "Pub trivia", recurrence: "recurring", start: undefined, schedule: "Tuesdays", kind: "food/drink", venue: "A bar" });
const all = [fri7, fri5, friAll, tue, onNow, onNowSooner, opensLater, trivia];

describe("groupResults", () => {
  it("puts underway spans first, then days ascending with all-day first, then always there when asked", () => {
    const groups = groupResults(all, f({ recurring: true }), today, none);
    expect(groups.map((g) => [g.key, g.heading, g.events.map((e) => e.id)])).toEqual([
      ["on-now", "On now", ["sooner", "onNow"]],
      ["2026-10-06", "Tue Oct 6", ["tue"]],
      ["2026-10-09", "Fri Oct 9", ["friAll", "fri5", "fri7"]],
      ["2026-10-20", "Tue Oct 20", ["later"]],
      ["always-there", "Always there", ["trivia"]],
    ]);
  });

  it("omits empty groups and the recurring group by default", () => {
    const groups = groupResults([fri7, tue], f(), today, none);
    expect(groups.map((g) => g.key)).toEqual(["2026-10-06", "2026-10-09"]);
  });

  it("sorts by venue into one list when asked", () => {
    const groups = groupResults([fri7, fri5, onNow], f({ sort: "venue" }), today, none);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.heading).toBe("By venue");
    expect(groups[0]!.events.map((e) => e.id)).toEqual(["fri5", "onNow", "fri7"]);
  });

  it("applies the filters", () => {
    const groups = groupResults(all, f({ q: "show" }), today, none);
    expect(groups.flatMap((g) => g.events.map((e) => e.id))).toEqual(["fri5", "fri7"]);
  });
});

describe("rowDateLine", () => {
  it("writes the time, all day, a span, or a schedule", () => {
    expect(rowDateLine(fri7, today)).toBe("7:00 pm");
    expect(rowDateLine(friAll, today)).toBe("All day");
    expect(rowDateLine(onNow, today)).toBe("On now, closes Tue Oct 20");
    expect(rowDateLine(opensLater, today)).toBe("Opens Tue Oct 20, runs through Sat Nov 14");
    expect(rowDateLine(trivia, today)).toBe("Tuesdays");
  });
});
```

- [ ] **Step 5: Run to verify failure, then implement grouping**

Run: `cd site && pnpm vitest run test/group.test.ts` → FAIL.

`site/src/lib/group.ts`:

```ts
import { formatDay, formatTime, isDateOnly } from "./dates";
import { firstDay, isDated, isMultiDay, isUnderway, lastDay } from "./events";
import { matches } from "./filter";
import { closingLine } from "./horizon";
import type { Filters } from "./query";
import type { PublishedEvent } from "./types";

export type ResultGroup = { key: string; heading: string; events: PublishedEvent[] };

/** Start time, "All day", a span's open/close line, or a recurring event's schedule phrase. */
export function rowDateLine(e: PublishedEvent, today: string): string {
  if (!isDated(e)) return e.schedule ?? "";
  if (isMultiDay(e)) return closingLine(e, today);
  return isDateOnly(e.start!) ? "All day" : formatTime(e.start!);
}

function byStartThenTitle(a: PublishedEvent, b: PublishedEvent): number {
  // Date-only starts sort before timed ones on the same day; a ten-character string is less than a longer one with the same prefix.
  return (a.start ?? "").localeCompare(b.start ?? "") || a.title.localeCompare(b.title);
}

/** The explorer's results: "On now", then one group per day, then "Always there" when recurring events are included. */
export function groupResults(events: PublishedEvent[], f: Filters, today: string, saved: ReadonlySet<string>): ResultGroup[] {
  const hits = events.filter((e) => matches(e, f, today, saved));

  if (f.sort === "venue") {
    const sorted = [...hits].sort((a, b) => a.venue.localeCompare(b.venue) || (firstDay(a) ?? lastDay(a) ?? "").localeCompare(firstDay(b) ?? lastDay(b) ?? "") || a.title.localeCompare(b.title));
    return sorted.length === 0 ? [] : [{ key: "venue", heading: "By venue", events: sorted }];
  }

  const onNow = hits.filter((e) => isUnderway(e, today)).sort((a, b) => lastDay(a)!.localeCompare(lastDay(b)!) || a.title.localeCompare(b.title));
  const byDay = new Map<string, PublishedEvent[]>();
  for (const e of hits) {
    if (!isDated(e) || isUnderway(e, today)) continue;
    const day = firstDay(e)!; // a start-less run is always underway, so never reaches here
    byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }
  const always = hits.filter((e) => !isDated(e)).sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));

  const groups: ResultGroup[] = [];
  if (onNow.length > 0) groups.push({ key: "on-now", heading: "On now", events: onNow });
  for (const day of [...byDay.keys()].sort()) groups.push({ key: day, heading: formatDay(day), events: byDay.get(day)!.sort(byStartThenTitle) });
  if (always.length > 0) groups.push({ key: "always-there", heading: "Always there", events: always });
  return groups;
}
```

- [ ] **Step 6: Run to verify pass**

Run: `cd site && pnpm test` → PASS.

- [ ] **Step 7: Commit**

```bash
git add site/src/lib/filter.ts site/src/lib/group.ts site/test/filter.test.ts site/test/group.test.ts
git commit -m "$(cat <<'EOF'
Filter and group events for the explorer

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Calendar export

**Model:** sonnet

**Files:**
- Create: `site/src/lib/ics.ts`
- Test: `site/test/ics.test.ts`, `site/test/fixtures/ics/*.ics`

**Interfaces:**
- Consumes: `addDays`, `isDateOnly`, `localDate` (Task 2); `firstDay`, `lastDay`, `isDated` (Task 2).
- Produces: `toIcs(events, opts: { siteName: string; stamp: string }): string` where `stamp` is an ISO instant the caller supplies (build time or the visitor's clock) for `DTSTAMP`.

- [ ] **Step 1: Write the failing tests and fixtures**

`site/test/ics.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toIcs } from "../src/lib/ics";
import { event } from "./fixtures/event";

const opts = { siteName: "KC Events", stamp: "2026-10-05T11:30:00Z" };
const fixture = (name: string) => readFileSync(new URL(`./fixtures/ics/${name}.ics`, import.meta.url), "utf8");

describe("toIcs", () => {
  it("writes a timed single event in UTC with a two-hour placeholder end", () => {
    expect(toIcs([event({ dontMiss: true, whyLine: "Rare; see it." })], opts)).toBe(fixture("timed"));
  });

  it("writes a date-only event as all-day with an exclusive end", () => {
    expect(toIcs([event({ start: "2026-10-09" })], opts)).toBe(fixture("all-day"));
  });

  it("drops to all-day when the end is a date and the start a time", () => {
    expect(toIcs([event({ start: "2026-10-02T18:00:00-05:00", end: "2026-10-03" })], opts)).toBe(fixture("mixed"));
  });

  it("writes a start-less run as its last day", () => {
    expect(toIcs([event({ recurrence: "limited-run", start: undefined, end: "2026-10-31" })], opts)).toBe(fixture("last-day"));
  });

  it("skips recurring events and writes nothing but the wrapper for none", () => {
    expect(toIcs([event({ recurrence: "recurring", start: undefined, schedule: "Tuesdays" })], opts)).toBe(fixture("empty"));
  });

  it("escapes and folds text", () => {
    const out = toIcs([event({ title: "Comma, semicolon; backslash\\ and a line\nbreak " + "x".repeat(80) })], opts);
    expect(out).toContain("SUMMARY:Comma\\, semicolon\; backslash\\\\ and a line\\nbreak ");
    for (const line of out.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(out).toContain("\r\n xxx"); // a folded continuation
  });

  it("converts the winter offset too", () => {
    expect(toIcs([event({ start: "2026-11-20T19:00:00-06:00" })], opts)).toContain("DTSTART:20261121T010000Z");
  });
});
```

Fixtures use CRLF line endings; write them with `printf` so the endings are exact. `site/test/fixtures/ics/timed.ics`:

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//KC Events//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:evt_000000000001@kc-events
DTSTAMP:20261005T113000Z
DTSTART:20261010T000000Z
DTEND:20261010T020000Z
SUMMARY:A show
LOCATION:recordBar\, Crossroads
URL:https://www.therecordbar.com/shows
DESCRIPTION:Rare\; see it.\n\nVerified Oct 3 by KC Events\; details at https://
 www.therecordbar.com/shows
END:VEVENT
END:VCALENDAR
```

`all-day.ics`: same wrapper; the VEVENT body is

```
UID:evt_000000000001@kc-events
DTSTAMP:20261005T113000Z
DTSTART;VALUE=DATE:20261009
DTEND;VALUE=DATE:20261010
SUMMARY:A show
LOCATION:recordBar\, Crossroads
URL:https://www.therecordbar.com/shows
DESCRIPTION:Verified Oct 3 by KC Events\; details at https://www.therecordbar
 .com/shows
```

`mixed.ics`: `DTSTART;VALUE=DATE:20261002` and `DTEND;VALUE=DATE:20261004`, otherwise as `all-day.ics`.

`last-day.ics`: `DTSTART;VALUE=DATE:20261031`, `DTEND;VALUE=DATE:20261101`, and `DESCRIPTION:Last day.\n\nVerified Oct 3 by KC Events\; details at https://ww` folded then ` w.therecordbar.com/shows`. Compute the fold point by byte count (75 octets per line including the leading space on continuations); if the implementation's fold differs by a character, fix the fixture to match the RFC, not the code to match the fixture.

`empty.ics`: the four wrapper lines and `END:VCALENDAR` only.

Every fixture ends with `END:VCALENDAR\r\n`.

- [ ] **Step 2: Run to verify failure**

Run: `cd site && pnpm vitest run test/ics.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`site/src/lib/ics.ts`:

```ts
import { addDays, isDateOnly, localDate } from "./dates";
import { firstDay, isDated, lastDay } from "./events";
import type { PublishedEvent } from "./types";

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545 folding: lines of at most 75 octets, continuations begin with one space. */
function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + b > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += b;
  }
  out.push(current);
  return out.map((l, i) => (i === 0 ? l : ` ${l}`)).join("\r\n");
}

function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function dateStamp(date: string): string {
  return date.replace(/-/g, "");
}

function verifiedOn(iso: string): string {
  const d = localDate(iso);
  return `${SHORT_MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
}

function vevent(e: PublishedEvent, siteName: string, stamp: string): string[] {
  const lines = [`UID:${e.id}@kc-events`, `DTSTAMP:${utcStamp(stamp)}`];
  const notes: string[] = [];
  const first = firstDay(e);
  const last = lastDay(e)!;

  if (first === undefined) {
    // A run read after it began: the one day we can stand behind is its last.
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(last)}`, `DTEND;VALUE=DATE:${dateStamp(addDays(last, 1))}`);
    notes.push("Last day.");
  } else if (isDateOnly(e.start!) || (e.end !== undefined && isDateOnly(e.end))) {
    // Any date-only side makes the whole event all-day; a date end is exclusive.
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(first)}`, `DTEND;VALUE=DATE:${dateStamp(addDays(last, 1))}`);
  } else {
    const end = e.end ?? new Date(new Date(e.start!).getTime() + 2 * 3_600_000).toISOString();
    lines.push(`DTSTART:${utcStamp(e.start!)}`, `DTEND:${utcStamp(end)}`);
  }

  lines.push(`SUMMARY:${escapeText(e.title)}`, `LOCATION:${escapeText(`${e.venue}, ${e.neighborhood}`)}`, `URL:${e.primaryUrl}`);
  if (e.whyLine) notes.unshift(e.whyLine);
  notes.push(`Verified ${verifiedOn(e.lastVerified)} by ${siteName}; details at ${e.primaryUrl}`);
  lines.push(`DESCRIPTION:${escapeText(notes.join("\n\n"))}`);
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"];
}

/** An RFC 5545 calendar of the dated events; recurring events are skipped (a schedule phrase is not an RRULE). */
export function toIcs(events: PublishedEvent[], opts: { siteName: string; stamp: string }): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${opts.siteName}//EN`, "CALSCALE:GREGORIAN"];
  for (const e of events) if (isDated(e)) lines.push(...vevent(e, opts.siteName, opts.stamp));
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
```

`Buffer` is available in Node and in vitest; in the browser bundle (Task 13 uses `toIcs` client-side) it is not. Replace both `Buffer.byteLength(x)` calls with `new TextEncoder().encode(x).length` so the module runs in both. The test file may keep `Buffer`.

- [ ] **Step 4: Run to verify pass**

Run: `cd site && pnpm vitest run test/ics.test.ts` → PASS. If a fixture differs only in a fold point, recount the bytes against the RFC and fix the fixture.

- [ ] **Step 5: Commit**

```bash
git add site/src/lib/ics.ts site/test/ics.test.ts site/test/fixtures/ics
git commit -m "$(cat <<'EOF'
Export events as RFC 5545 calendars

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: The saves store

**Model:** sonnet

**Files:**
- Create: `site/src/lib/saves.ts`
- Test: `site/test/saves.test.ts`

**Interfaces:**
- Produces: `STORAGE_KEY = "kc-events.saved.v1"`; `createSaves(storage: Pick<Storage, "getItem" | "setItem"> | undefined): Saves` where `Saves = { list(): string[]; has(id): boolean; toggle(id): void; subscribe(fn: (ids: ReadonlySet<string>) => void): () => void }`; `saves(): Saves`, a lazy singleton over the browser's `localStorage` that components call in `onMount`. `subscribe` re-reads storage when it can (so a component mounting after another tab or test wrote to it sees the current set), calls `fn` immediately and on every change, and returns an unsubscribe.

- [ ] **Step 1: Write the failing tests**

`site/test/saves.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createSaves, STORAGE_KEY } from "../src/lib/saves";

function memory(initial?: string) {
  const m = new Map<string, string>();
  if (initial !== undefined) m.set(STORAGE_KEY, initial);
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), map: m };
}

describe("saves", () => {
  it("starts from storage, toggles, and persists", () => {
    const store = memory(JSON.stringify(["a"]));
    const s = createSaves(store);
    expect(s.list()).toEqual(["a"]);
    s.toggle("b");
    expect(s.has("b")).toBe(true);
    expect(JSON.parse(store.map.get(STORAGE_KEY)!)).toEqual(["a", "b"]);
    s.toggle("a");
    expect(s.list()).toEqual(["b"]);
  });

  it("notifies subscribers immediately and on change, and stops after unsubscribe", () => {
    const s = createSaves(memory());
    const fn = vi.fn();
    const off = s.subscribe(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect([...fn.mock.calls[0]![0]]).toEqual([]);
    s.toggle("x");
    expect(fn).toHaveBeenCalledTimes(2);
    expect([...fn.mock.calls[1]![0]]).toEqual(["x"]);
    off();
    s.toggle("y");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("treats missing, throwing, or corrupt storage as nothing saved and never throws", () => {
    expect(createSaves(undefined).list()).toEqual([]);
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
    const s = createSaves(throwing);
    expect(s.list()).toEqual([]);
    expect(() => s.toggle("a")).not.toThrow();
    expect(s.has("a")).toBe(true); // kept in memory for the page's life
    expect(createSaves(memory("not json")).list()).toEqual([]);
    expect(createSaves(memory(JSON.stringify({ a: 1 }))).list()).toEqual([]);
    expect(createSaves(memory(JSON.stringify(["a", 2, null]))).list()).toEqual(["a"]);
  });

  it("re-reads storage when a new subscriber arrives, so a later mount sees outside changes", () => {
    const store = memory(JSON.stringify([]));
    const s = createSaves(store);
    store.map.set(STORAGE_KEY, JSON.stringify(["z"]));
    const fn = vi.fn();
    s.subscribe(fn);
    expect([...fn.mock.calls[0]![0]]).toEqual(["z"]);
    expect(s.has("z")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && pnpm vitest run test/saves.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`site/src/lib/saves.ts`:

```ts
export const STORAGE_KEY = "kc-events.saved.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type Saves = {
  list(): string[];
  has(id: string): boolean;
  toggle(id: string): void;
  /** Calls fn now and after every change; returns an unsubscribe. Shaped so Svelte can read it as $saves. */
  subscribe(fn: (ids: ReadonlySet<string>) => void): () => void;
};

/** The stored ids; undefined when storage is missing or throws, so the caller keeps what it has in memory. */
function read(storage: StorageLike | undefined): string[] | undefined {
  if (storage === undefined) return undefined;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return undefined;
  }
}

/** Browser-local saves. A storage that is missing, blocked, full, or corrupt degrades to nothing saved and never throws. */
export function createSaves(storage: StorageLike | undefined): Saves {
  let ids = new Set(read(storage) ?? []);
  const subscribers = new Set<(ids: ReadonlySet<string>) => void>();
  const write = () => {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify([...ids]));
    } catch {
      // Keep the in-memory state for this page's life; nothing else to do.
    }
    for (const fn of subscribers) fn(ids);
  };
  return {
    list: () => [...ids],
    has: (id) => ids.has(id),
    toggle(id) {
      ids = new Set(ids);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      write();
    },
    subscribe(fn) {
      const fresh = read(storage);
      if (fresh !== undefined) ids = new Set(fresh);
      subscribers.add(fn);
      fn(ids);
      return () => void subscribers.delete(fn);
    },
  };
}

function browserStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined; // access itself can throw when storage is blocked
  }
}

/** The page's one store; created on first use so server rendering never touches storage. */
let singleton: Saves | undefined;
export function saves(): Saves {
  return (singleton ??= createSaves(browserStorage()));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd site && pnpm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add site/src/lib/saves.ts site/test/saves.test.ts
git commit -m "$(cat <<'EOF'
Keep saved events in the browser

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Design tokens, base layout, and the shared components

**Model:** opus

**Files:**
- Create: `site/src/styles/tokens.css`, `site/src/styles/base.css`
- Create: `site/src/layouts/Base.astro`, `site/src/components/Header.astro`, `site/src/components/Footer.astro`, `site/src/components/KindChip.astro`
- Create: `site/src/components/StalenessBanner.svelte`, `site/src/components/SaveButton.svelte`
- Create: `site/scripts/share-image.html`, `site/scripts/share-image.ts`, `site/public/og.png`
- Modify: `site/src/pages/index.astro` (use the layout)
- Test: `site/test/staleness.test.ts`, `site/test/save-button.test.ts`

**Interfaces:**
- Consumes: `published` (Task 3), `saves()` (Task 8), `addDays`, `localDate`, `todayIn`, `formatDay` (Task 2), `siteConfig` (Task 1).
- Produces: `Base.astro` with props `{ title: string; description: string; canonical?: string; jsonLd?: object }`; `KindChip.astro` with `{ kind: string }`; `StalenessBanner.svelte` with no props; `SaveButton.svelte` with `{ id: string; title: string }`; CSS custom properties named below. Every later surface uses these.

This task is where the design is set. The spec's section 9 is the brief: calm density, typographic, warm off-white and near-black with a dark scheme, one hue per kind used sparingly, don't-miss as one distinct treatment. The implementer picks concrete values; the tests pin the behavior, not the look. Load the `impeccable:impeccable` skill for the pass if available.

- [ ] **Step 1: Tokens**

`site/src/styles/tokens.css`. Define, and use nothing outside these:

```css
:root {
  color-scheme: light dark;
  /* Surfaces and text */
  --bg: #faf8f4;
  --bg-raised: #ffffff;
  --fg: #1a1916;
  --fg-muted: #5f5b53;
  --fg-faint: #8a8578;
  --rule: #e4e0d8;
  --accent: #b5471f;            /* links, the don't-miss mark */
  --accent-fg: #ffffff;
  --focus: #1f5fb5;
  /* Eleven kind hues; chip text and left rules, never fills behind body text */
  --kind-music: #8a3b9c;
  --kind-theater-dance: #b5471f;
  --kind-comedy: #c48a00;
  --kind-art-exhibitions: #1f6f8b;
  --kind-festivals-markets: #2e7d32;
  --kind-food-drink: #a0522d;
  --kind-sports: #1f5fb5;
  --kind-film: #4a4a8a;
  --kind-talks-readings: #6b5b3e;
  --kind-outdoors-community: #3d7a3d;
  --kind-other: #6a6a6a;
  /* Type */
  --font: "Inter Variable", system-ui, sans-serif;
  --text-xs: 0.75rem; --text-sm: 0.875rem; --text-md: 1rem; --text-lg: 1.125rem; --text-xl: 1.375rem; --text-2xl: 1.75rem;
  --leading-tight: 1.25; --leading: 1.5;
  /* Space and shape */
  --space-1: 0.25rem; --space-2: 0.5rem; --space-3: 0.75rem; --space-4: 1rem; --space-6: 1.5rem; --space-8: 2rem; --space-12: 3rem;
  --measure: 42rem;
  --gutter: 1rem;
  --radius: 4px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #161513; --bg-raised: #1f1e1b; --fg: #ece8df; --fg-muted: #b3ada0; --fg-faint: #807a6d; --rule: #2e2c28;
    --accent: #e8794a; --accent-fg: #161513; --focus: #7fb0ff;
    --kind-music: #c58ad4; --kind-theater-dance: #e8794a; --kind-comedy: #e0b23a; --kind-art-exhibitions: #6cb4cf;
    --kind-festivals-markets: #7bc47f; --kind-food-drink: #d49a7a; --kind-sports: #7fb0ff; --kind-film: #a3a3e0;
    --kind-talks-readings: #c2ad86; --kind-outdoors-community: #8ccf8c; --kind-other: #a8a8a8;
  }
}
```

Adjust values for contrast (every text-on-bg and chip-on-bg pairing at or above 4.5:1 in both schemes; check with a contrast tool before committing), but keep the names: later tasks reference them. The kind variable for a kind is `--kind-` plus `slugify(kind)` (Task 5), so `theater/dance` → `--kind-theater-dance`.

- [ ] **Step 2: Base styles and the font**

`site/src/styles/base.css`: a short reset, `body { font-family: var(--font); background: var(--bg); color: var(--fg); line-height: var(--leading); font-variant-numeric: tabular-nums; margin: 0; }`, link styles (`color: var(--accent)`, underline on hover and always for inline links in prose), a visible focus ring (`outline: 2px solid var(--focus); outline-offset: 2px`), `.measure { max-width: var(--measure); margin-inline: auto; padding-inline: var(--gutter); }`, `.visually-hidden`, and `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }`.

The font is `@fontsource-variable/inter`, imported once in `Base.astro` (`import "@fontsource-variable/inter";`), which bundles the woff2 files into `dist/_astro/`; no request leaves the origin. If the implementer prefers another open-license variable sans with tabular figures from fontsource, swap it here and in `--font`; nowhere else.

- [ ] **Step 3: The layout and header**

`site/src/layouts/Base.astro`:

```astro
---
import "@fontsource-variable/inter";
import "../styles/tokens.css";
import "../styles/base.css";
import { siteConfig } from "../site.config";
import Header from "../components/Header.astro";
import Footer from "../components/Footer.astro";
import StalenessBanner from "../components/StalenessBanner.svelte";

interface Props { title: string; description: string; canonical?: string; jsonLd?: object }
const { title, description, canonical, jsonLd } = Astro.props;
const fullTitle = title === siteConfig.name ? title : `${title} · ${siteConfig.name}`;
const url = canonical ?? new URL(Astro.url.pathname, siteConfig.origin).toString();
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{fullTitle}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={url} />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content={siteConfig.name} />
    <meta property="og:title" content={fullTitle} />
    <meta property="og:description" content={description} />
    <meta property="og:url" content={url} />
    <meta property="og:image" content={new URL("/og.png", siteConfig.origin).toString()} />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="sitemap" href="/sitemap-index.xml" />
    {jsonLd && <script type="application/ld+json" set:html={JSON.stringify(jsonLd).replace(/</g, "\\u003c")} />}
  </head>
  <body>
    <Header />
    <StalenessBanner client:load />
    <main id="main" class="measure">
      <slot />
    </main>
    <Footer />
  </body>
</html>
```

`Header.astro`: a `<header>` with the site name linking to `/`, the research stamp (`Researched weekly; last run {formatDay(localDate(published.lastSuccessfulRun))}`), and a `<nav aria-label="Site">` with links to `/explore` and `/about`. A skip link to `#main` as the first focusable element. `Footer.astro`: one line (`No ads, no accounts, no tracking.`), links to the methods page, the dataset (`/events.json`), and the repo.

- [ ] **Step 4: The staleness banner, test first**

`site/test/staleness.test.ts`:

```ts
import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/generated/published", () => ({
  published: { events: [], kinds: [], regions: [], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));

import StalenessBanner from "../src/components/StalenessBanner.svelte";

// Islands switch to the visitor's date in onMount; `await tick()` lets that render land before asserting.
describe("StalenessBanner", () => {
  it("is absent while the run is fresh", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-13T12:00:00Z") }); // 8 days
    render(StalenessBanner);
    await tick();
    expect(screen.queryByRole("status")).toBeNull();
    vi.useRealTimers();
  });

  it("appears after nine days with the run date in it", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-15T12:00:00Z") }); // 10 days
    render(StalenessBanner);
    await tick();
    expect(screen.getByRole("status")).toHaveTextContent("last researched on Mon Oct 5");
    vi.useRealTimers();
  });
});
```

`site/src/components/StalenessBanner.svelte`:

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { published } from "../generated/published";
  import { addDays, formatDay, localDate, todayIn } from "../lib/dates";
  import { siteConfig } from "../site.config";

  const runDay = localDate(published.lastSuccessfulRun);
  const staleFrom = addDays(runDay, siteConfig.staleAfterDays + 1);
  // Server-rendered with the build's date; the visitor's date takes over on mount.
  let today = $state(published.buildToday);
  onMount(() => { today = todayIn(published.timeZone, new Date()); });
  let stale = $derived(today >= staleFrom);
</script>

{#if stale}
  <div class="banner measure" role="status">
    This list was last researched on {formatDay(runDay)} and may have missed changes since.
  </div>
{/if}

<style>
  .banner { background: var(--bg-raised); border-block: 1px solid var(--rule); padding: var(--space-2) var(--gutter); font-size: var(--text-sm); color: var(--fg-muted); }
</style>
```

Run `cd site && pnpm vitest run test/staleness.test.ts` before writing the component (FAIL) and after (PASS). Svelte runs `onMount` under jsdom, so the fake clock applies.

- [ ] **Step 5: The save button, test first**

`site/test/save-button.test.ts`:

```ts
import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import SaveButton from "../src/components/SaveButton.svelte";
import { STORAGE_KEY } from "../src/lib/saves";

describe("SaveButton", () => {
  it("toggles its pressed state and label, and persists", async () => {
    localStorage.removeItem(STORAGE_KEY);
    render(SaveButton, { id: "evt_1", title: "A show" });
    const button = screen.getByRole("button", { name: "Save A show" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Saved: A show" })).toBe(button);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(["evt_1"]);
  });

  it("reflects another button's change to the same event", async () => {
    localStorage.removeItem(STORAGE_KEY);
    render(SaveButton, { id: "evt_2", title: "One" });
    render(SaveButton, { id: "evt_2", title: "One" });
    const [a, b] = screen.getAllByRole("button");
    await fireEvent.click(a!);
    expect(b).toHaveAttribute("aria-pressed", "true");
  });
});
```

`site/src/components/SaveButton.svelte`:

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { saves } from "../lib/saves";

  let { id, title }: { id: string; title: string } = $props();
  // Server-rendered unsaved; the store is read on mount so SSR never touches storage.
  let saved = $state(false);
  onMount(() => saves().subscribe((ids) => { saved = ids.has(id); }));
</script>

<button type="button" class="save" aria-pressed={saved} aria-label={saved ? `Saved: ${title}` : `Save ${title}`} onclick={() => saves().toggle(id)}>
  {saved ? "Saved" : "Save"}
</button>

<style>
  .save { font: inherit; font-size: var(--text-xs); color: var(--fg-muted); background: none; border: 1px solid var(--rule); border-radius: var(--radius); padding: var(--space-1) var(--space-2); cursor: pointer; }
  .save[aria-pressed="true"] { color: var(--accent); border-color: var(--accent); }
</style>
```

Run the test before (FAIL) and after (PASS). `onMount` returning the unsubscribe is Svelte's cleanup contract.

- [ ] **Step 6: KindChip**

`site/src/components/KindChip.astro`:

```astro
---
import { slugify } from "../lib/slugs";
interface Props { kind: string }
const { kind } = Astro.props;
---
<span class="chip" style={`--hue: var(--kind-${slugify(kind)})`}>{kind}</span>
<style>
  .chip { font-size: var(--text-xs); color: var(--hue); border: 1px solid color-mix(in srgb, var(--hue) 40%, transparent); border-radius: 999px; padding: 0 var(--space-2); white-space: nowrap; }
</style>
```

- [ ] **Step 7: The share image**

`site/scripts/share-image.html`: a 1200×630 page using the tokens inline (copy the light values), the site name at `--text-2xl` scale ×3, the tagline below, nothing else. `site/scripts/share-image.ts`:

```ts
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(new URL("./share-image.html", import.meta.url).toString());
await page.screenshot({ path: new URL("../public/og.png", import.meta.url).pathname });
await browser.close();
```

Run `cd site && pnpm exec tsx scripts/share-image.ts` and commit the PNG (under 200 KB; use `pngquant` or a lower DPR if larger). This runs by hand when the design changes, not in CI.

- [ ] **Step 8: Use the layout on the placeholder front page and build**

Change `site/src/pages/index.astro` to wrap its content in `<Base title={siteConfig.name} description={siteConfig.tagline}>`. Run `cd site && pnpm test && pnpm build && pnpm preview` and open `http://localhost:4321/` in both color schemes: the header, stamp, footer, and font render; no request leaves the origin (check the network panel).

- [ ] **Step 9: Commit**

```bash
git add site/src/styles site/src/layouts site/src/components site/src/pages/index.astro site/scripts/share-image.* site/public/og.png site/test/staleness.test.ts site/test/save-button.test.ts
git commit -m "$(cat <<'EOF'
Set the site's design tokens, base layout, staleness banner, and save button

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: The front page and the methods page

**Model:** opus

**Files:**
- Create: `site/src/components/DontMissList.svelte`, `site/src/components/DontMissCard.svelte`, `site/src/pages/about.astro`
- Modify: `site/src/pages/index.astro`
- Test: `site/test/dont-miss-list.test.ts`

**Interfaces:**
- Consumes: `published` (Task 3); `bucketDontMiss`, `horizonHeading`, `closingLine`, `HORIZONS` (Task 4); `formatDay`, `formatTime`, `isDateOnly`, `localDate`, `todayIn` (Task 2); `firstDay`, `isMultiDay`, `isPast`, `hostOf` (Task 2); `slugify` (Task 5); `SaveButton`, `Base`, `KindChip` (Task 9); `siteConfig` (Task 1).
- Produces: `DontMissList.svelte` (no props), `DontMissCard.svelte` with `{ event: PublishedEvent; today: string }`; the `/` and `/about` pages.

- [ ] **Step 1: Write the failing component test**

`site/test/dont-miss-list.test.ts`:

```ts
import { render, screen, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";
import { event } from "./fixtures/event";

const fixture = [
  event({ id: "a", title: "Tuesday show", dontMiss: true, whyLine: "Why A.", start: "2026-10-06T20:00:00-05:00" }),
  event({ id: "b", title: "Closing run", dontMiss: true, whyLine: "Why B.", recurrence: "limited-run", start: "2026-09-01", end: "2026-10-11" }),
  event({ id: "c", title: "Later show", dontMiss: true, whyLine: "Why C.", start: "2026-10-17" }),
  event({ id: "d", title: "Plain show", dontMiss: false, start: "2026-10-06" }),
];
vi.mock("../src/generated/published", () => ({
  published: { events: fixture, kinds: ["music"], regions: ["Central KC"], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));

import DontMissList from "../src/components/DontMissList.svelte";

describe("DontMissList", () => {
  it("renders every bucket with its heading, cards in order, and the empty line", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") });
    render(DontMissList);
    await tick();
    const sections = screen.getAllByRole("region");
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual(["This week, Oct 5–11", "Next two weeks, through Oct 19", "Further out"]);
    const first = within(sections[0]!).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(first).toEqual(["Tuesday show", "Closing run"]);
    expect(within(sections[0]!).getByText("Why A.")).toBeInTheDocument();
    expect(within(sections[0]!).getByText("On now, closes Sun Oct 11")).toBeInTheDocument();
    expect(within(sections[1]!).getByText("Later show")).toBeInTheDocument();
    expect(within(sections[2]!).getByText(/Nothing flagged yet/)).toBeInTheDocument();
    expect(screen.queryByText("Plain show")).toBeNull();
    vi.useRealTimers();
  });

  it("re-buckets on the visitor's date", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-12T12:00:00Z") }); // the following Monday
    render(DontMissList);
    await tick();
    const sections = screen.getAllByRole("region");
    expect(sections[0]).toHaveAttribute("aria-label", "This week, Oct 12–18");
    expect(within(sections[0]!).getByText("Later show")).toBeInTheDocument();
    expect(screen.queryByText("Tuesday show")).toBeNull(); // past
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && pnpm vitest run test/dont-miss-list.test.ts` → FAIL.

- [ ] **Step 3: The card and the list**

`site/src/components/DontMissCard.svelte`:

```svelte
<script lang="ts">
  import { formatDay, formatTime, isDateOnly, localDate } from "../lib/dates";
  import { firstDay, hostOf, isMultiDay } from "../lib/events";
  import { closingLine } from "../lib/horizon";
  import { slugify } from "../lib/slugs";
  import type { PublishedEvent } from "../lib/types";
  import SaveButton from "./SaveButton.svelte";

  let { event, today }: { event: PublishedEvent; today: string } = $props();
  let dateLine = $derived(
    isMultiDay(event) ? closingLine(event, today) : `${formatDay(firstDay(event)!)}${isDateOnly(event.start!) ? "" : `, ${formatTime(event.start!)}`}`,
  );
</script>

<article class="card" style={`--hue: var(--kind-${slugify(event.kind)})`}>
  <p class="date">{dateLine}</p>
  <h3><a href={`/e/${event.id}`}>{event.title}</a></h3>
  <p class="why">{event.whyLine}</p>
  <p class="meta">
    <span>{event.venue} · {event.neighborhood}</span>
    <span class="chip">{event.kind}</span>
    <a class="primary" href={event.primaryUrl} rel="noopener">{hostOf(event.primaryUrl)}</a>
    <SaveButton id={event.id} title={event.title} />
    <span class="verified">Verified {formatDay(localDate(event.lastVerified))}</span>
  </p>
</article>

<style>
  .card { border-left: 3px solid var(--hue); padding: var(--space-2) 0 var(--space-2) var(--space-4); margin-block: var(--space-4); }
  .date { margin: 0; font-size: var(--text-sm); color: var(--fg-muted); }
  h3 { margin: 0; font-size: var(--text-xl); line-height: var(--leading-tight); }
  h3 a { color: inherit; text-decoration: none; }
  h3 a:hover { text-decoration: underline; }
  .why { margin: var(--space-1) 0 var(--space-2); font-size: var(--text-lg); }
  .meta { margin: 0; display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-3); align-items: center; font-size: var(--text-xs); color: var(--fg-faint); }
  .chip { color: var(--hue); border: 1px solid color-mix(in srgb, var(--hue) 40%, transparent); border-radius: 999px; padding: 0 var(--space-2); }
</style>
```

(The chip is inline here rather than `KindChip.astro` because Astro components cannot render inside Svelte; the two share the token names.)

`site/src/components/DontMissList.svelte`:

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { published } from "../generated/published";
  import { todayIn } from "../lib/dates";
  import { bucketDontMiss, horizonHeading, HORIZONS } from "../lib/horizon";
  import DontMissCard from "./DontMissCard.svelte";

  const emptyLines = { "through-sunday": "Nothing flagged yet for this week.", "next-two-weeks": "Nothing flagged yet for the next two weeks.", "further-out": "Nothing flagged yet further out." } as const;
  let today = $state(published.buildToday);
  onMount(() => { today = todayIn(published.timeZone, new Date()); });
  let buckets = $derived(bucketDontMiss(published.events, today));
  let total = $derived(HORIZONS.reduce((n, h) => n + buckets[h].length, 0));
</script>

{#if total === 0}
  <p>Nothing is flagged don't-miss right now. <a href="/explore">Browse everything</a> instead.</p>
{/if}
{#each HORIZONS as h (h)}
  {@const heading = horizonHeading(h, today)}
  <section aria-label={heading}>
    <h2>{heading}</h2>
    {#if buckets[h].length === 0}
      <p class="empty">{emptyLines[h]}</p>
    {:else}
      {#each buckets[h] as event (event.id)}
        <DontMissCard {event} {today} />
      {/each}
    {/if}
  </section>
{/each}

<style>
  h2 { font-size: var(--text-md); text-transform: uppercase; letter-spacing: 0.04em; color: var(--fg-muted); margin: var(--space-8) 0 var(--space-2); border-bottom: 1px solid var(--rule); padding-bottom: var(--space-1); }
  .empty { color: var(--fg-faint); font-size: var(--text-sm); }
</style>
```

- [ ] **Step 4: Run to verify pass**

Run: `cd site && pnpm vitest run test/dont-miss-list.test.ts` → PASS.

- [ ] **Step 5: The front page**

`site/src/pages/index.astro`:

```astro
---
import Base from "../layouts/Base.astro";
import DontMissList from "../components/DontMissList.svelte";
import { published } from "../generated/published";
import { siteConfig } from "../site.config";
import { isDated } from "../lib/events";

const alwaysThere = published.events.filter((e) => !isDated(e)).sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
const count = published.events.length;
---
<Base title={siteConfig.name} description={siteConfig.tagline}>
  <h1>What's on in Kansas City</h1>
  <p class="lede">{siteConfig.tagline} The events below are the ones worth going out of your way for, with a line on why; <a href="/explore">everything else</a> is one click away.</p>

  <DontMissList client:load />

  <section aria-labelledby="always">
    <h2 id="always">Always there</h2>
    <p class="note">These repeat on a schedule and are never on the list above.</p>
    <ul class="always">
      {alwaysThere.map((e) => (
        <li>
          <a href={`/e/${e.id}`}>{e.title}</a>
          <span class="when">{e.schedule}</span>
          <span class="where">{e.venue} · {e.neighborhood}</span>
          <a class="primary" href={e.primaryUrl} rel="noopener">{new URL(e.primaryUrl).hostname.replace(/^www\./, "")}</a>
        </li>
      ))}
    </ul>
  </section>

  <p class="explore"><a href="/explore">Browse all {count} events</a></p>
</Base>

<style>
  h1 { font-size: var(--text-2xl); line-height: var(--leading-tight); margin: var(--space-8) 0 var(--space-2); }
  .lede { color: var(--fg-muted); margin-bottom: var(--space-6); }
  h2 { font-size: var(--text-md); text-transform: uppercase; letter-spacing: 0.04em; color: var(--fg-muted); margin: var(--space-12) 0 var(--space-1); border-bottom: 1px solid var(--rule); padding-bottom: var(--space-1); }
  .note { font-size: var(--text-sm); color: var(--fg-faint); margin: 0 0 var(--space-3); }
  .always { list-style: none; padding: 0; margin: 0; }
  .always li { display: grid; grid-template-columns: 1fr auto; gap: 0 var(--space-3); padding: var(--space-1) 0; border-bottom: 1px solid var(--rule); font-size: var(--text-sm); }
  .always .when { color: var(--fg-muted); text-align: right; }
  .always .where, .always .primary { font-size: var(--text-xs); color: var(--fg-faint); }
  .explore { margin: var(--space-12) 0; font-size: var(--text-lg); }
</style>
```

- [ ] **Step 6: The methods page**

`site/src/pages/about.astro`, in `<Base title="About" description="How this list is made, and how to report a wrong listing.">`, with these sections as `h2`s and plain prose under each, written in the spec's register (no exclamation marks, nouns for headings):

- **What this is**: one paragraph from the tagline; who it is for; that it is free and has no ads, accounts, or tracking.
- **How it is made**: a weekly research job reads venue and organizer pages directly; a date and venue are published only when read from the event's own page, otherwise the event is held back; each event shows when it was last verified; the research stamp in the header says when the job last ran; after nine days without a run every page says so.
- **What don't-miss means**: an editorial call that a one-off or limited run is worth going out of your way for, made by a model under written rules in the repo, with a one-line reason; recurring events are never flagged.
- **The data**: `/events.json` is the full dataset, free to reuse with a link back; a pointer to `/llms.txt`.
- **Wrong listing?**: a link `href={`${siteConfig.repoUrl}/issues/new?title=${encodeURIComponent("Wrong listing: ")}`}` and one sentence on what to include (the event, the page it links to, what is wrong).
- **The code**: a link to `siteConfig.repoUrl`.

- [ ] **Step 7: Build and look**

Run: `cd site && pnpm test && pnpm build && pnpm preview`. Open `/` and `/about` at 320 px, 768 px, and 1280 px in both schemes. Check: three horizon headings with dates, cards with why-lines and the primary host link, an "Always there" list, the browse-all count; no horizontal scroll at 320 px; the font is served from `/_astro/`.

- [ ] **Step 8: Commit**

```bash
git add site/src/components/DontMissList.svelte site/src/components/DontMissCard.svelte site/src/pages/index.astro site/src/pages/about.astro site/test/dont-miss-list.test.ts
git commit -m "$(cat <<'EOF'
Render the front page's don't-miss list and the methods page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Event pages, calendar files, and the plain-text endpoints

**Model:** sonnet

**Files:**
- Create: `site/src/pages/e/[id].astro`, `site/src/pages/e/[id].ics.ts`, `site/src/components/EventPageIsland.svelte`
- Create: `site/src/pages/events.json.ts`, `site/src/pages/llms.txt.ts`, `site/src/pages/robots.txt.ts`, `site/src/pages/404.astro`
- Test: `site/test/event-page-island.test.ts`, `site/test/endpoints.test.ts`

**Interfaces:**
- Consumes: `published` (Task 3); `toIcs` (Task 7); `formatLong`, `formatTime`, `formatDay`, `isDateOnly`, `localDate`, `todayIn` (Task 2); `firstDay`, `lastDay`, `isDated`, `isMultiDay`, `isPast`, `hostOf` (Task 2); `closingLine` (Task 4); `SaveButton`, `Base`, `KindChip` (Task 9); `siteConfig` (Task 1).
- Produces: `/e/<id>`, `/e/<id>.ics`, `/events.json`, `/llms.txt`, `/robots.txt`, `/404`; `EventPageIsland.svelte` with `{ id: string; title: string; lastDay?: string }`.

- [ ] **Step 1: The island, test first**

`site/test/event-page-island.test.ts`:

```ts
import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/generated/published", () => ({
  published: { events: [], kinds: [], regions: [], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));
import EventPageIsland from "../src/components/EventPageIsland.svelte";

describe("EventPageIsland", () => {
  it("shows the save button and no notice while the event is ahead", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") });
    await tick();
    render(EventPageIsland, { id: "evt_1", title: "A show", lastDay: "2026-10-09" });
    expect(screen.getByRole("button", { name: "Save A show" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    vi.useRealTimers();
  });

  it("says so once the event has passed on the visitor's clock", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-12T12:00:00Z") });
    await tick();
    render(EventPageIsland, { id: "evt_1", title: "A show", lastDay: "2026-10-09" });
    expect(screen.getByRole("status")).toHaveTextContent("This has already happened");
    vi.useRealTimers();
  });

  it("never shows the notice for an undated event", async () => {
    vi.useFakeTimers({ now: new Date("2099-01-01T12:00:00Z") });
    await tick();
    render(EventPageIsland, { id: "evt_1", title: "Trivia" });
    expect(screen.queryByRole("status")).toBeNull();
    vi.useRealTimers();
  });
});
```

`site/src/components/EventPageIsland.svelte`:

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { published } from "../generated/published";
  import { todayIn } from "../lib/dates";
  import SaveButton from "./SaveButton.svelte";

  let { id, title, lastDay }: { id: string; title: string; lastDay?: string } = $props();
  let today = $state(published.buildToday);
  onMount(() => { today = todayIn(published.timeZone, new Date()); });
  let passed = $derived(lastDay !== undefined && lastDay < today);
</script>

{#if passed}
  <p class="notice" role="status">This has already happened. The page stays up until the next weekly run; <a href="/explore">see what's coming</a>.</p>
{/if}
<SaveButton {id} {title} />

<style>
  .notice { background: var(--bg-raised); border: 1px solid var(--rule); border-radius: var(--radius); padding: var(--space-2) var(--space-3); font-size: var(--text-sm); color: var(--fg-muted); }
</style>
```

Run the test before (FAIL) and after (PASS).

- [ ] **Step 2: The event page**

`site/src/pages/e/[id].astro`:

```astro
---
import Base from "../../layouts/Base.astro";
import KindChip from "../../components/KindChip.astro";
import EventPageIsland from "../../components/EventPageIsland.svelte";
import { published } from "../../generated/published";
import { formatDay, formatLong, formatTime, isDateOnly, localDate } from "../../lib/dates";
import { firstDay, hostOf, isDated, isMultiDay, lastDay } from "../../lib/events";
import { closingLine } from "../../lib/horizon";
import { siteConfig } from "../../site.config";
import type { PublishedEvent } from "../../lib/types";

export function getStaticPaths() {
  return published.events.map((event) => ({ params: { id: event.id }, props: { event } }));
}
const { event } = Astro.props as { event: PublishedEvent };
const today = published.buildToday;

function dateLine(e: PublishedEvent): string {
  if (!isDated(e)) return e.schedule ?? "";
  if (isMultiDay(e)) return closingLine(e, today);
  const day = formatLong(firstDay(e)!);
  return isDateOnly(e.start!) ? day : `${day}, ${formatTime(e.start!)}`;
}
const line = dateLine(event);
const description = `${line} at ${event.venue}, ${event.neighborhood}.${event.whyLine ? ` ${event.whyLine}` : ""}`;
const reportUrl = `${siteConfig.repoUrl}/issues/new?title=${encodeURIComponent(`Wrong listing: ${event.title}`)}&body=${encodeURIComponent(`Event: ${siteConfig.origin}/e/${event.id}\nPrimary page: ${event.primaryUrl}\n\nWhat is wrong:\n`)}`;
const moreLikeThis = published.events
  .filter((e) => e.id !== event.id && e.kind === event.kind && isDated(e) && firstDay(e) !== undefined)
  .sort((a, b) => firstDay(a)!.localeCompare(firstDay(b)!))
  .slice(0, 5);
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Event",
  name: event.title,
  ...(event.start && { startDate: event.start }),
  ...(event.end && { endDate: event.end }),
  location: { "@type": "Place", name: event.venue, address: { "@type": "PostalAddress", addressLocality: event.neighborhood, addressRegion: "Kansas City" } },
  url: event.primaryUrl,
  ...(event.whyLine && { description: event.whyLine }),
};
---
<Base title={event.title} description={description} jsonLd={jsonLd}>
  <article class="event">
    <p class="kind"><KindChip kind={event.kind} />{event.dontMiss && <span class="mark">Don't miss</span>}</p>
    <h1>{event.title}</h1>
    <p class="date">{line}</p>
    <p class="where">{event.venue} · {event.neighborhood} · {event.region}</p>
    {event.whyLine && <blockquote class="why">{event.whyLine}</blockquote>}
    <p class="primary"><a href={event.primaryUrl} rel="noopener">Details and tickets at {hostOf(event.primaryUrl)}</a></p>
    <div class="actions">
      <EventPageIsland client:load id={event.id} title={event.title} lastDay={lastDay(event)} />
      {isDated(event) && <a class="ics" href={`/e/${event.id}.ics`} download>Add to calendar</a>}
    </div>
    <p class="verified">Date and venue verified {formatDay(localDate(event.lastVerified))} from the page linked above. <a href={reportUrl}>Wrong? Report it</a>.</p>
  </article>

  {moreLikeThis.length > 0 && (
    <section aria-labelledby="more">
      <h2 id="more">More like this</h2>
      <ul>
        {moreLikeThis.map((e) => (
          <li><a href={`/e/${e.id}`}>{e.title}</a> <span>{formatDay(firstDay(e)!)} · {e.venue}</span></li>
        ))}
      </ul>
    </section>
  )}
</Base>

<style>
  .event { margin-top: var(--space-8); }
  .kind { display: flex; gap: var(--space-2); align-items: center; margin: 0; }
  .mark { color: var(--accent); font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  h1 { font-size: var(--text-2xl); line-height: var(--leading-tight); margin: var(--space-2) 0; }
  .date { font-size: var(--text-lg); margin: 0; }
  .where { color: var(--fg-muted); margin: 0 0 var(--space-4); }
  .why { margin: 0 0 var(--space-4); padding-left: var(--space-4); border-left: 3px solid var(--accent); font-size: var(--text-lg); }
  .primary { font-size: var(--text-lg); margin: 0 0 var(--space-4); }
  .actions { display: flex; gap: var(--space-3); align-items: center; margin-bottom: var(--space-6); }
  .verified { font-size: var(--text-xs); color: var(--fg-faint); }
  h2 { font-size: var(--text-md); text-transform: uppercase; letter-spacing: 0.04em; color: var(--fg-muted); margin: var(--space-12) 0 var(--space-2); border-bottom: 1px solid var(--rule); }
  ul { list-style: none; padding: 0; } li { padding: var(--space-1) 0; } li span { font-size: var(--text-xs); color: var(--fg-faint); }
</style>
```

- [ ] **Step 3: The calendar file and the text endpoints**

`site/src/pages/e/[id].ics.ts`:

```ts
import type { APIRoute } from "astro";
import { published } from "../../generated/published";
import { isDated } from "../../lib/events";
import { toIcs } from "../../lib/ics";
import { siteConfig } from "../../site.config";

export function getStaticPaths() {
  return published.events.filter(isDated).map((event) => ({ params: { id: event.id }, props: { event } }));
}

export const GET: APIRoute = ({ props }) => {
  const body = toIcs([props.event], { siteName: siteConfig.name, stamp: published.lastSuccessfulRun });
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8" } });
};
```

`site/src/pages/events.json.ts` (verbatim: read the file as text, never re-serialize):

```ts
import { readFileSync } from "node:fs";
import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  const path = process.env.SITE_DATASET ? new URL(`../../${process.env.SITE_DATASET}`, import.meta.url) : new URL("../../../data/events.json", import.meta.url);
  return new Response(readFileSync(path, "utf8"), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
```

`site/src/pages/llms.txt.ts`:

```ts
import type { APIRoute } from "astro";
import { published } from "../generated/published";
import { siteConfig } from "../site.config";

export const GET: APIRoute = () =>
  new Response(
    `# ${siteConfig.name}

> ${siteConfig.tagline}

A weekly research job reads Kansas City venue and organizer pages directly and publishes an event only when its date and venue were read from the event's own page (cite-or-drop). Anything it cannot cite is held back. Every event shows when it was last verified. Don't-miss is an editorial call, made under written rules, that a one-off or limited run is worth going out of the way for; recurring events are never flagged.

Last run: ${published.lastSuccessfulRun}. ${published.events.length} active events.

## Pages

- ${siteConfig.origin}/ : the don't-miss list by horizon, then recurring events
- ${siteConfig.origin}/explore : every active event, filterable by date, kind, region, don't-miss, and search (filters are in the query string)
- ${siteConfig.origin}/e/<id> : one event; add .ics for a calendar file
- ${siteConfig.origin}/about : how the site is made and where to report a wrong listing

## Data

- ${siteConfig.origin}/events.json : the full dataset, JSON, free to reuse with a link back
- ${siteConfig.repoUrl} : the code and the research rules
`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
```

`site/src/pages/robots.txt.ts`:

```ts
import type { APIRoute } from "astro";
import { siteConfig } from "../site.config";
export const GET: APIRoute = () => new Response(`User-agent: *\nAllow: /\nSitemap: ${siteConfig.origin}/sitemap-index.xml\n`, { headers: { "Content-Type": "text/plain" } });
```

`site/src/pages/404.astro`: `<Base title="Not found" description="That page is gone or never was.">` with an `h1` "Nothing here", one line ("The event may have passed or been taken down after a failed check."), and links to `/explore` and `/`.

- [ ] **Step 4: Endpoint tests against a build**

`site/test/endpoints.test.ts` (runs after `pnpm build`; it is the one test that needs `dist/`, so it skips itself when `dist/` is absent or was built from a different dataset, such as the e2e fixture):

```ts
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { published } from "../src/generated/published";

const dist = new URL("../dist/", import.meta.url);
const has = (p: string) => existsSync(new URL(p, dist));
const read = (p: string) => readFileSync(new URL(p, dist), "utf8");

// Runs only against a build made from the same dataset as the generated module (an e2e build in dist/ would not match).
const matchesPublished = has("llms.txt") && read("llms.txt").includes(`Last run: ${published.lastSuccessfulRun}.`);

describe.skipIf(!matchesPublished)("built output", () => {
  it("emits a page and a calendar file per dated event, and none for anything else", () => {
    const sample = published.events.find((e) => e.recurrence === "one-off")!;
    expect(has(`e/${sample.id}.html`)).toBe(true);
    expect(has(`e/${sample.id}.ics`)).toBe(true);
    const recurring = published.events.find((e) => e.recurrence === "recurring");
    if (recurring) expect(has(`e/${recurring.id}.ics`)).toBe(false);
  });

  it("publishes the dataset verbatim", () => {
    const source = readFileSync(new URL(process.env.SITE_DATASET ? `../${process.env.SITE_DATASET}` : "../../data/events.json", import.meta.url), "utf8");
    expect(read("events.json")).toBe(source);
  });

  it("writes llms.txt, robots.txt, the sitemap, and the 404", () => {
    expect(read("llms.txt")).toContain("/events.json");
    expect(read("robots.txt")).toContain("Allow: /");
    expect(has("sitemap-index.xml")).toBe(true);
    expect(read("404.html")).toContain("Nothing here");
  });

  it("carries Event JSON-LD and the share image on an event page", () => {
    const sample = published.events.find((e) => e.dontMiss)!;
    const html = read(`e/${sample.id}.html`);
    expect(html).toContain('"@type":"Event"');
    expect(html).toContain("/og.png");
    expect(html).toContain(sample.whyLine!.slice(0, 20));
  });
});
```

- [ ] **Step 5: Build and run**

Run: `cd site && pnpm build && pnpm test`. Expected: the build emits ~560 `e/*.html` and the `.ics` files; all tests pass including the built-output suite. Open `pnpm preview` and view an event page and `/404` in both schemes.

- [ ] **Step 6: Commit**

```bash
git add site/src/pages site/src/components/EventPageIsland.svelte site/test/event-page-island.test.ts site/test/endpoints.test.ts
git commit -m "$(cat <<'EOF'
Add a page and calendar file per event, the dataset, llms.txt, robots, and 404

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: The explorer

**Model:** opus

**Files:**
- Create: `site/src/components/Explorer.svelte`, `site/src/components/FilterRail.svelte`, `site/src/components/ResultRow.svelte`, `site/src/pages/explore.astro`
- Test: `site/test/explorer.test.ts`

**Interfaces:**
- Consumes: `published` (Task 3); `Filters`, `DEFAULT_FILTERS`, `parseQuery`, `toQuery`, `isDefault`, `WHEN_PRESETS` (Task 5); `groupResults`, `rowDateLine` (Task 6); `todayIn`, `formatDay`, `localDate` (Task 2); `hostOf` (Task 2); `saves()` (Task 8); `slugify` (Task 5); `SaveButton` (Task 9).
- Produces: `Explorer.svelte` (no props); `FilterRail.svelte` with `{ filters: Filters; onchange: (f: Filters) => void; kinds: string[]; regions: string[] }`; `ResultRow.svelte` with `{ event: PublishedEvent; today: string }`; `/explore`. Task 13 adds an export button into `Explorer.svelte` next to the count.

- [ ] **Step 1: Write the failing component test**

`site/test/explorer.test.ts`:

```ts
import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "../src/lib/saves";
import { event } from "./fixtures/event";

const fixture = [
  event({ id: "a", title: "Friday jazz", start: "2026-10-09T19:00:00-05:00", kind: "music", region: "Central KC" }),
  event({ id: "b", title: "Saturday film", start: "2026-10-10", kind: "film", region: "Lawrence", neighborhood: "Lawrence", venue: "Liberty Hall" }),
  event({ id: "c", title: "Later talk", start: "2026-10-20T18:00:00-05:00", kind: "talks/readings", region: "Central KC" }),
  event({ id: "d", title: "Exhibition", recurrence: "limited-run", start: "2026-09-01", end: "2026-10-25", kind: "art/exhibitions", region: "Central KC", dontMiss: true, whyLine: "Closing soon." }),
  event({ id: "r", title: "Trivia", recurrence: "recurring", start: undefined, schedule: "Tuesdays", kind: "food/drink", region: "Central KC" }),
];
vi.mock("../src/generated/published", () => ({
  published: { events: fixture, kinds: ["music", "film", "talks/readings", "art/exhibitions", "food/drink"], regions: ["Central KC", "Lawrence", "Elsewhere in the metro"], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));
import Explorer from "../src/components/Explorer.svelte";

const rows = () => screen.getAllByRole("article").map((a) => within(a).getByRole("heading").textContent);

describe("Explorer", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") });
    localStorage.removeItem(STORAGE_KEY);
    history.replaceState(null, "", "/explore");
  });

  it("renders every dated event grouped by day with the count, and no recurring events", () => {
    render(Explorer);
    expect(screen.getByRole("status")).toHaveTextContent("4 events");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["On now", "Fri Oct 9", "Sat Oct 10", "Tue Oct 20"]);
    expect(rows()).toEqual(["Exhibition", "Friday jazz", "Saturday film", "Later talk"]);
    expect(screen.queryByText("Trivia")).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });

  it("filters by kind chip and writes the URL", async () => {
    render(Explorer);
    await fireEvent.click(screen.getByRole("button", { name: "film" }));
    expect(rows()).toEqual(["Saturday film"]);
    expect(screen.getByRole("button", { name: "film" })).toHaveAttribute("aria-pressed", "true");
    expect(location.search).toBe("?kind=film");
    expect(screen.getByRole("status")).toHaveTextContent("1 event");
  });

  it("reads its state from the URL on mount", async () => {
    history.replaceState(null, "", "/explore?when=weekend&kind=music&kind=film");
    render(Explorer);
    await vi.runAllTimersAsync();
    expect(rows()).toEqual(["Friday jazz", "Saturday film"]);
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("searches, includes always-there, and clears", async () => {
    render(Explorer);
    await fireEvent.input(screen.getByRole("searchbox"), { target: { value: "liberty" } });
    expect(rows()).toEqual(["Saturday film"]);
    await fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(rows()).toHaveLength(4);
    await fireEvent.click(screen.getByRole("switch", { name: "Include always-there" }));
    expect(screen.getByText("Trivia")).toBeInTheDocument();
    expect(location.search).toBe("?recurring=1");
  });

  it("says what is active when nothing matches", async () => {
    render(Explorer);
    await fireEvent.input(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(screen.getByRole("status")).toHaveTextContent("0 events");
    expect(screen.getByText(/No events match/)).toBeInTheDocument();
  });

  it("shows only saved events when asked", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["c"]));
    render(Explorer);
    await fireEvent.click(screen.getByRole("switch", { name: "Saved only" }));
    expect(rows()).toEqual(["Later talk"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && pnpm vitest run test/explorer.test.ts` → FAIL.

- [ ] **Step 3: The row**

`site/src/components/ResultRow.svelte`:

```svelte
<script lang="ts">
  import { formatDay, localDate } from "../lib/dates";
  import { hostOf } from "../lib/events";
  import { rowDateLine } from "../lib/group";
  import { slugify } from "../lib/slugs";
  import type { PublishedEvent } from "../lib/types";
  import SaveButton from "./SaveButton.svelte";

  let { event, today }: { event: PublishedEvent; today: string } = $props();
</script>

<article class="row" class:flagged={event.dontMiss} style={`--hue: var(--kind-${slugify(event.kind)})`}>
  <span class="when">{rowDateLine(event, today)}</span>
  <div class="main">
    <h3><a href={`/e/${event.id}`}>{event.title}</a>{#if event.dontMiss}<span class="mark" title="Don't miss">●</span>{/if}</h3>
    {#if event.whyLine}<p class="why">{event.whyLine}</p>{/if}
    <p class="meta">
      {event.venue} · {event.neighborhood}
      <span class="chip">{event.kind}</span>
      <a class="primary" href={event.primaryUrl} rel="noopener">{hostOf(event.primaryUrl)}</a>
      <span class="verified">verified {formatDay(localDate(event.lastVerified))}</span>
    </p>
  </div>
  <SaveButton id={event.id} title={event.title} />
</article>

<style>
  .row { display: grid; grid-template-columns: 7.5rem 1fr auto; gap: 0 var(--space-3); align-items: baseline; padding: var(--space-1) 0; border-bottom: 1px solid var(--rule); font-size: var(--text-sm); min-height: 0; }
  .when { color: var(--fg-muted); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  h3 { font-size: var(--text-md); font-weight: 500; margin: 0; line-height: var(--leading-tight); }
  h3 a { color: inherit; text-decoration: none; } h3 a:hover { text-decoration: underline; }
  .mark { color: var(--accent); margin-left: var(--space-1); font-size: var(--text-xs); }
  .why { margin: 0; color: var(--fg); font-size: var(--text-sm); }
  .meta { margin: 0; font-size: var(--text-xs); color: var(--fg-faint); display: flex; flex-wrap: wrap; gap: 0 var(--space-2); }
  .chip { color: var(--hue); border: 1px solid color-mix(in srgb, var(--hue) 40%, transparent); border-radius: 999px; padding: 0 var(--space-2); }
  .flagged { border-left: 3px solid var(--accent); padding-left: var(--space-2); }
  @media (max-width: 640px) { .row { grid-template-columns: 1fr auto; } .when { grid-column: 1 / -1; font-size: var(--text-xs); } }
</style>
```

An unflagged row has one title line and one meta line at `--text-sm`/`--text-xs`: about 2.6 rem, under the 28 px bar at 1024 px once `.meta` fits one line; verify in the browser at step 7 and tighten padding if needed.

- [ ] **Step 4: The filter rail**

`site/src/components/FilterRail.svelte`:

```svelte
<script lang="ts">
  import { WHEN_PRESETS, type Filters } from "../lib/query";

  let { filters, onchange, kinds, regions }: { filters: Filters; onchange: (f: Filters) => void; kinds: string[]; regions: string[] } = $props();
  const whenLabels: Record<(typeof WHEN_PRESETS)[number], string> = { today: "Today", weekend: "Through Sunday", "7d": "Next 7 days", "30d": "Next 30 days", all: "All" };
  let customFrom = $state("from" in filters.when ? filters.when.from : "");
  let customTo = $state("from" in filters.when ? filters.when.to : "");

  const toggleIn = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  function applyRange() {
    if (customFrom && customTo) onchange({ ...filters, when: customFrom <= customTo ? { from: customFrom, to: customTo } : { from: customTo, to: customFrom } });
  }
</script>

<div class="rail">
  <fieldset>
    <legend>When</legend>
    <div class="segments" role="group" aria-label="When">
      {#each WHEN_PRESETS as p (p)}
        <button type="button" aria-pressed={"preset" in filters.when && filters.when.preset === p} onclick={() => onchange({ ...filters, when: { preset: p } })}>{whenLabels[p]}</button>
      {/each}
    </div>
    <div class="range">
      <label>From <input type="date" bind:value={customFrom} onchange={applyRange} /></label>
      <label>To <input type="date" bind:value={customTo} onchange={applyRange} /></label>
    </div>
  </fieldset>

  <fieldset>
    <legend>Kind</legend>
    <div class="chips">
      {#each kinds as k (k)}
        <button type="button" aria-pressed={filters.kinds.includes(k)} onclick={() => onchange({ ...filters, kinds: toggleIn(filters.kinds, k) })}>{k}</button>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>Region</legend>
    <div class="chips">
      {#each regions as r (r)}
        <button type="button" aria-pressed={filters.regions.includes(r)} onclick={() => onchange({ ...filters, regions: toggleIn(filters.regions, r) })}>{r}</button>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>Show</legend>
    <label><input type="checkbox" role="switch" checked={filters.dontMiss} onchange={() => onchange({ ...filters, dontMiss: !filters.dontMiss })} /> Don't-miss only</label>
    <label><input type="checkbox" role="switch" checked={filters.recurring} onchange={() => onchange({ ...filters, recurring: !filters.recurring })} /> Include always-there</label>
    <label><input type="checkbox" role="switch" checked={filters.saved} onchange={() => onchange({ ...filters, saved: !filters.saved })} /> Saved only</label>
  </fieldset>

  <label class="search">Search <input type="search" value={filters.q} oninput={(e) => onchange({ ...filters, q: e.currentTarget.value })} placeholder="Title, venue, neighborhood, why" /></label>

  <label class="sort">Sort <select value={filters.sort} onchange={(e) => onchange({ ...filters, sort: e.currentTarget.value === "venue" ? "venue" : "date" })}><option value="date">By date</option><option value="venue">By venue</option></select></label>
</div>

<style>
  .rail { display: flex; flex-direction: column; gap: var(--space-4); font-size: var(--text-sm); }
  fieldset { border: 0; padding: 0; margin: 0; }
  legend { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.04em; color: var(--fg-muted); margin-bottom: var(--space-1); }
  .segments, .chips { display: flex; flex-wrap: wrap; gap: var(--space-1); }
  button { font: inherit; font-size: var(--text-xs); background: none; color: var(--fg-muted); border: 1px solid var(--rule); border-radius: 999px; padding: var(--space-1) var(--space-2); cursor: pointer; }
  button[aria-pressed="true"] { color: var(--accent-fg); background: var(--accent); border-color: var(--accent); }
  .range { display: flex; gap: var(--space-2); margin-top: var(--space-2); } .range label { display: flex; flex-direction: column; font-size: var(--text-xs); }
  input, select { font: inherit; }
  .search input { width: 100%; padding: var(--space-1) var(--space-2); }
</style>
```

- [ ] **Step 5: The island**

`site/src/components/Explorer.svelte`:

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { published } from "../generated/published";
  import { todayIn } from "../lib/dates";
  import { groupResults } from "../lib/group";
  import { DEFAULT_FILTERS, isDefault, parseQuery, toQuery, type Filters } from "../lib/query";
  import { saves } from "../lib/saves";
  import FilterRail from "./FilterRail.svelte";
  import ResultRow from "./ResultRow.svelte";

  const known = { kinds: published.kinds, regions: published.regions };
  // Server-rendered with the build's date and default filters; the visitor's take over on mount.
  let today = $state(published.buildToday);
  let filters = $state<Filters>(DEFAULT_FILTERS);
  let saved = $state<ReadonlySet<string>>(new Set());
  let mounted = $state(false);

  onMount(() => {
    today = todayIn(published.timeZone, new Date());
    filters = parseQuery(new URLSearchParams(location.search), known);
    const off = saves().subscribe((ids) => { saved = ids; });
    mounted = true;
    return off;
  });

  function change(next: Filters) {
    filters = next;
    const q = toQuery(next, known);
    history.replaceState(null, "", q === "" ? location.pathname : `${location.pathname}?${q}`);
  }

  let groups = $derived(groupResults(published.events, filters, today, saved));
  let count = $derived(groups.reduce((n, g) => n + g.events.length, 0));
  let active = $derived(!isDefault(filters));
</script>

<div class="explorer">
  <aside class="rail" aria-label="Filters">
    <details class="sheet" open>
      <summary>Filters</summary>
      <FilterRail {filters} onchange={change} kinds={published.kinds} regions={published.regions} />
    </details>
  </aside>

  <section class="results" aria-label="Events">
    <div class="bar">
      <p role="status" aria-live="polite" class="count">{count} {count === 1 ? "event" : "events"}</p>
      {#if active}<button type="button" class="clear" onclick={() => change(DEFAULT_FILTERS)}>Clear filters</button>{/if}
    </div>

    {#if count === 0}
      <p class="empty">No events match these filters. <button type="button" class="link" onclick={() => change(DEFAULT_FILTERS)}>Clear them</button> to see everything.</p>
    {/if}
    {#each groups as g (g.key)}
      <h2>{g.heading}</h2>
      {#each g.events as event (event.id)}
        <ResultRow {event} {today} />
      {/each}
    {/each}
  </section>
</div>

<style>
  .explorer { display: grid; grid-template-columns: 16rem 1fr; gap: var(--space-8); align-items: start; }
  .rail { position: sticky; top: var(--space-4); }
  .sheet summary { display: none; }
  .bar { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); position: sticky; top: 0; background: var(--bg); padding: var(--space-2) 0; z-index: 2; }
  .count { margin: 0; color: var(--fg-muted); font-size: var(--text-sm); }
  .clear, .link { font: inherit; font-size: var(--text-sm); color: var(--accent); background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; }
  h2 { font-size: var(--text-sm); text-transform: uppercase; letter-spacing: 0.04em; color: var(--fg-muted); margin: var(--space-6) 0 var(--space-1); position: sticky; top: 2.25rem; background: var(--bg); padding: var(--space-1) 0; z-index: 1; }
  .empty { color: var(--fg-muted); }
  @media (max-width: 800px) {
    .explorer { grid-template-columns: 1fr; gap: var(--space-4); }
    .rail { position: static; }
    .sheet summary { display: list-item; cursor: pointer; font-weight: 500; }
    .sheet:not([open]) summary { margin-bottom: var(--space-2); }
  }
</style>
```

The `<details>` is open on wide screens and collapsible on phones; it is `open` in the HTML so no-JS readers see the controls. The `mounted` flag exists for Task 13's export button.

- [ ] **Step 6: The page**

`site/src/pages/explore.astro`:

```astro
---
import Base from "../layouts/Base.astro";
import Explorer from "../components/Explorer.svelte";
import { published } from "../generated/published";
const description = `Every one of ${published.events.length} active Kansas City events, by date, kind, and region.`;
---
<Base title="Explore" description={description}>
  <h1>Explore</h1>
  <Explorer client:load />
</Base>
<style>
  h1 { font-size: var(--text-2xl); margin: var(--space-8) 0 var(--space-4); }
</style>
```

`Base.astro`'s `main.measure` is too narrow for a rail plus results; add a `wide?: boolean` prop to `Base.astro` that swaps `.measure` for a `.wide` class (`max-width: 72rem`), and pass `wide` here.

- [ ] **Step 7: Run tests, build, and look**

Run: `cd site && pnpm test && pnpm build && pnpm preview`. Open `/explore`, `/explore?when=weekend&kind=music`, and `/explore?region=central-kc&sort=venue` at 320 px and 1280 px in both schemes. Check: the URL updates as chips are toggled; back leaves the page; sticky headings; ~30 unflagged rows on a 1280×800 window; keyboard reaches every control with a visible focus ring; the count is announced (VoiceOver or NVDA if available, else inspect the live region).

- [ ] **Step 8: Commit**

```bash
git add site/src/components/Explorer.svelte site/src/components/FilterRail.svelte site/src/components/ResultRow.svelte site/src/pages/explore.astro site/src/layouts/Base.astro site/test/explorer.test.ts
git commit -m "$(cat <<'EOF'
Add the explorer: filters in the URL, results by day, always there on request

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Export this view

**Model:** sonnet

**Files:**
- Modify: `site/src/components/Explorer.svelte` (the bar next to the count)
- Create: `site/src/lib/download.ts`
- Test: `site/test/explorer-export.test.ts`

**Interfaces:**
- Consumes: `toIcs` (Task 7); `groups`, `mounted`, `count` in `Explorer.svelte` (Task 12); `siteConfig` (Task 1).
- Produces: `downloadText(filename, text, mime, deps?)` in `site/src/lib/download.ts`, where `deps` defaults to the browser's `Blob`, `URL`, and `document` and is injectable for tests; an "Export this view" button in the explorer bar.

- [ ] **Step 1: Write the failing tests**

`site/test/explorer-export.test.ts`:

```ts
import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadText } from "../src/lib/download";
import { event } from "./fixtures/event";

const fixture = [
  event({ id: "a", title: "Friday jazz", start: "2026-10-09T19:00:00-05:00" }),
  event({ id: "r", title: "Trivia", recurrence: "recurring", start: undefined, schedule: "Tuesdays" }),
];
vi.mock("../src/generated/published", () => ({
  published: { events: fixture, kinds: ["music"], regions: ["Central KC"], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));
vi.mock("../src/lib/download", () => ({ downloadText: vi.fn() }));
import Explorer from "../src/components/Explorer.svelte";

describe("export this view", () => {
  beforeEach(() => { vi.useFakeTimers({ now: new Date("2026-10-05T12:00:00Z") }); history.replaceState(null, "", "/explore"); vi.mocked(downloadText).mockClear(); });

  it("downloads the current results as a calendar", async () => {
    render(Explorer);
    await vi.runAllTimersAsync();
    await fireEvent.click(screen.getByRole("button", { name: "Export this view" }));
    expect(downloadText).toHaveBeenCalledTimes(1);
    const [name, text, mime] = vi.mocked(downloadText).mock.calls[0]!;
    expect(name).toBe("kc-events.ics");
    expect(mime).toBe("text/calendar");
    expect(text).toContain("SUMMARY:Friday jazz");
    expect(text).not.toContain("Trivia");
  });

  it("is disabled with nothing to export", async () => {
    history.replaceState(null, "", "/explore?q=zzz");
    render(Explorer);
    await vi.runAllTimersAsync();
    expect(screen.getByRole("button", { name: "Export this view" })).toBeDisabled();
  });
});

describe("downloadText", () => {
  it("creates an object URL, clicks an anchor, and revokes", async () => {
    const { downloadText: real } = await vi.importActual<typeof import("../src/lib/download")>("../src/lib/download");
    const a = { href: "", download: "", click: vi.fn() };
    const deps = { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn(), createAnchor: () => a as unknown as HTMLAnchorElement, makeBlob: (parts: string[], type: string) => ({ parts, type }) as unknown as Blob };
    real("f.ics", "BEGIN:VCALENDAR", "text/calendar", deps);
    expect(a.download).toBe("f.ics");
    expect(a.href).toBe("blob:x");
    expect(a.click).toHaveBeenCalled();
    expect(deps.revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && pnpm vitest run test/explorer-export.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`site/src/lib/download.ts`:

```ts
type Deps = {
  createObjectURL: (b: Blob) => string;
  revokeObjectURL: (u: string) => void;
  createAnchor: () => HTMLAnchorElement;
  makeBlob: (parts: string[], type: string) => Blob;
};

const browser = (): Deps => ({
  createObjectURL: (b) => URL.createObjectURL(b),
  revokeObjectURL: (u) => URL.revokeObjectURL(u),
  createAnchor: () => document.createElement("a"),
  makeBlob: (parts, type) => new Blob(parts, { type }),
});

/** Hands the visitor a file through a Blob URL and a click on an anchor; iOS Safari opens .ics in a viewer instead, which is the platform's call. */
export function downloadText(filename: string, text: string, mime: string, deps: Deps = browser()): void {
  const url = deps.createObjectURL(deps.makeBlob([text], mime));
  const a = deps.createAnchor();
  a.href = url;
  a.download = filename;
  a.click();
  deps.revokeObjectURL(url);
}
```

In `Explorer.svelte`, add to the script:

```ts
  import { toIcs } from "../lib/ics";
  import { downloadText } from "../lib/download";
  import { siteConfig } from "../site.config";
  import { isDated } from "../lib/events";

  let exportable = $derived(groups.flatMap((g) => g.events).filter(isDated));
  function exportView() {
    downloadText("kc-events.ics", toIcs(exportable, { siteName: siteConfig.name, stamp: new Date().toISOString() }), "text/calendar");
  }
```

and in the `.bar`, after the count:

```svelte
      <button type="button" class="export" disabled={!mounted || exportable.length === 0} onclick={exportView}>Export this view</button>
```

styled like `.clear` but as a bordered small button (`border: 1px solid var(--rule); border-radius: var(--radius); padding: var(--space-1) var(--space-2); font-size: var(--text-xs)`), `[disabled] { opacity: 0.5; cursor: default; }`. `new Date()` is in a component, not `lib/`, so the grep allows it.

- [ ] **Step 4: Run to verify pass**

Run: `cd site && pnpm test` → PASS (including the Task 12 suite, which must not have changed).

- [ ] **Step 5: Try it**

`pnpm build && pnpm preview`; on `/explore?when=weekend` click Export and open the file in a calendar app: the events land on the right days.

- [ ] **Step 6: Commit**

```bash
git add site/src/components/Explorer.svelte site/src/lib/download.ts site/test/explorer-export.test.ts
git commit -m "$(cat <<'EOF'
Export the explorer's current view as a calendar file

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: End-to-end suite, size check, and CI

**Model:** sonnet

**Files:**
- Create: `site/playwright.config.ts`, `site/e2e/fixtures/events.json`, `site/e2e/site.spec.ts`, `site/e2e/a11y.spec.ts`
- Create: `site/scripts/size-check.ts` (replacing the stub), `.github/workflows/site-ci.yml`

**Interfaces:**
- Consumes: the built site; `build:e2e` and `preview` scripts (Task 1).
- Produces: `pnpm --filter kc-events-site test:e2e`; the size check run by `pnpm build`; CI on PRs and `main`.

- [ ] **Step 1: The fixture dataset**

`site/e2e/fixtures/events.json`: a valid dataset (it goes through `parseDataset`) for a build on **Monday 2026-10-05**. Each event needs `firstSeen`, `lastVerified`, `status: "active"`, `verificationFailures: 0`, `lead`, and `evidence` with both `date` and `venue` (copy the shape from `test/load-dataset.test.ts`'s `activeEvent`). Events:

| id | title | kind | recurrence | start / end | neighborhood | dontMiss |
|---|---|---|---|---|---|---|
| `evt_e2e000000001` | Fabio Frizzi plays Fulci | music | one-off | `2026-10-06T19:00:00-05:00` | Crossroads | yes, why-line "A rare touring occasion for a Kansas City stage." |
| `evt_e2e000000002` | Saturday comedy hour | comedy | one-off | `2026-10-10` | Westport | no |
| `evt_e2e000000003` | Friday night jazz | music | one-off | `2026-10-09T20:00:00-05:00` | Olathe | no |
| `evt_e2e000000004` | Mid-month reading | talks/readings | one-off | `2026-10-17T18:00:00-05:00` | Downtown | yes, why-line "The author's only Midwest stop." |
| `evt_e2e000000005` | November festival | festivals/markets | one-off | `2026-11-20` / `2026-11-22` | Lawrence | yes, why-line "Once a year." |
| `evt_e2e000000006` | Closing exhibition | art/exhibitions | limited-run | `2026-09-20` / `2026-10-11` | Plaza & Museum District | yes, why-line "Closes Sunday." |
| `evt_e2e000000007` | Artboards | art/exhibitions | limited-run | (no start) / `2026-12-31` | Crossroads | no |
| `evt_e2e000000008` | Pub trivia | food/drink | recurring | schedule "Every Tuesday, 7pm" | Midtown | no |
| `evt_e2e000000009` | County fair talk | other | one-off | `2026-10-08T18:30:00-05:00` | Johnson County | no |
| `evt_e2e000000010` | Already happened | music | one-off | `2026-10-03T20:00:00-05:00` | Downtown | no |

`lastSuccessfulRun` and `generatedAt`: `2026-10-05T06:30:00-05:00`. `sourceState: {}`, `discoveryState: {}`, `schemaVersion: 1`. Event 10 is dropped at build (past on Oct 5) and is there to prove it.

- [ ] **Step 2: Playwright config**

`site/playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:4321", trace: "retain-on-failure" },
  webServer: { command: "pnpm build:e2e && pnpm preview --port 4321", port: 4321, reuseExistingServer: false, timeout: 180_000 },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
```

In this remote environment Chromium is at `/opt/pw-browsers/chromium` via `PLAYWRIGHT_BROWSERS_PATH`; do not run `playwright install` here. CI installs it (step 5).

- [ ] **Step 3: The specs**

`site/e2e/site.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

const BUILD_DAY = new Date("2026-10-05T17:00:00Z"); // noon Monday in Chicago
async function on(page: Page, when: Date, path: string) {
  await page.clock.setFixedTime(when);
  await page.goto(path);
}

test("the front page buckets the fixture's don't-miss events", async ({ page }) => {
  await on(page, BUILD_DAY, "/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What's on in Kansas City");
  const sections = page.getByRole("region");
  await expect(sections.nth(0)).toHaveAttribute("aria-label", "This week, Oct 5–11");
  await expect(sections.nth(0).getByRole("heading", { level: 3 })).toHaveText(["Fabio Frizzi plays Fulci", "Closing exhibition"]);
  await expect(sections.nth(1).getByRole("heading", { level: 3 })).toHaveText(["Mid-month reading"]);
  await expect(sections.nth(2).getByRole("heading", { level: 3 })).toHaveText(["November festival"]);
  await expect(page.getByText("Pub trivia")).toBeVisible();
  await expect(page.getByText("Browse all 9 events")).toBeVisible();
});

test("the explorer honors the URL and writes it back", async ({ page }) => {
  await on(page, BUILD_DAY, "/explore?when=weekend&kind=music");
  await expect(page.getByRole("status")).toHaveText("2 events");
  await expect(page.getByRole("article").getByRole("heading")).toHaveText(["Fabio Frizzi plays Fulci", "Friday night jazz"]);
  await page.getByRole("button", { name: "comedy" }).click();
  await expect(page).toHaveURL(/when=weekend&kind=music&kind=comedy/);
  await expect(page.getByRole("status")).toHaveText("3 events");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL("/explore");
});

test("the region fallback places a region-named neighborhood", async ({ page }) => {
  await on(page, BUILD_DAY, "/explore?region=johnson-county");
  await expect(page.getByRole("article").getByRole("heading")).toHaveText(["County fair talk", "Friday night jazz"]);
});

test("an event page exists, downloads a calendar, and knows when it has passed", async ({ page }) => {
  await on(page, BUILD_DAY, "/e/evt_e2e000000001");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fabio Frizzi plays Fulci");
  await expect(page.locator('script[type="application/ld+json"]')).toContainText('"@type":"Event"');
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Add to calendar" }).click();
  expect((await download).suggestedFilename()).toBe("evt_e2e000000001.ics");
  await expect(page.getByRole("status")).toHaveCount(0);
  await on(page, new Date("2026-10-12T17:00:00Z"), "/e/evt_e2e000000001");
  await expect(page.getByRole("status")).toContainText("This has already happened");
});

test("a past event has no page, and the 404 renders", async ({ page }) => {
  const res = await page.goto("/e/evt_e2e000000010");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nothing here");
});

test("the staleness banner appears after nine days", async ({ page }) => {
  await on(page, new Date("2026-10-15T17:00:00Z"), "/");
  await expect(page.getByRole("status")).toContainText("last researched on Mon Oct 5");
});

test("the dataset is published verbatim and llms.txt points at it", async ({ request }) => {
  const json = await (await request.get("/events.json")).text();
  expect(JSON.parse(json).events).toHaveLength(10);
  expect(await (await request.get("/llms.txt")).text()).toContain("/events.json");
});

for (const path of ["/", "/explore", "/e/evt_e2e000000001", "/about"]) {
  test(`${path} makes no third-party requests and does not scroll sideways at 320px`, async ({ page }) => {
    const foreign: string[] = [];
    page.on("request", (r) => { if (!r.url().startsWith("http://localhost:4321")) foreign.push(r.url()); });
    await page.setViewportSize({ width: 320, height: 640 });
    await on(page, BUILD_DAY, path);
    await page.waitForLoadState("networkidle");
    expect(foreign).toEqual([]);
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth - document.scrollingElement!.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
```

`site/e2e/a11y.spec.ts`:

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const scheme of ["light", "dark"] as const) {
  for (const path of ["/", "/explore", "/e/evt_e2e000000001", "/about", "/404"]) {
    test(`${path} passes axe in ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.clock.setFixedTime(new Date("2026-10-05T17:00:00Z"));
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });
  }
}
```

Astro's preview server serves `404.html` for unknown paths with a 404 status; if `/404` itself returns 200 that is fine for the axe test.

- [ ] **Step 4: The size check**

`site/scripts/size-check.ts`:

```ts
/** Fails the build when a page's compressed transfer (HTML + referenced CSS + JS, transitively) exceeds its budget. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const dist = new URL("../dist/", import.meta.url).pathname;
const budgets: Record<string, number> = { "index.html": 50_000, "explore.html": 100_000 };
const firstEvent = readdirSync(join(dist, "e")).find((f) => f.endsWith(".html"));
if (firstEvent) budgets[`e/${firstEvent}`] = 40_000;

function assets(text: string): string[] {
  return [...text.matchAll(/\/_astro\/[\w.-]+\.(?:js|css)/g)].map((m) => m[0]);
}

let failed = false;
for (const [page, budget] of Object.entries(budgets)) {
  const html = readFileSync(join(dist, page), "utf8");
  const seen = new Set<string>();
  const queue = assets(html);
  let bytes = gzipSync(html).length;
  while (queue.length > 0) {
    const asset = queue.pop()!;
    if (seen.has(asset)) continue;
    seen.add(asset);
    const path = join(dist, asset);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf8");
    bytes += gzipSync(content).length;
    if (asset.endsWith(".js")) queue.push(...assets(content));
  }
  const ok = bytes <= budget;
  if (!ok) failed = true;
  console.log(`${ok ? "ok  " : "OVER"} ${page}: ${bytes} / ${budget} bytes gzipped (${seen.size} assets)`);
}
if (failed) process.exit(1);
```

Font files are not counted: they are the same for every page and `woff2` is already compressed; the budget is about markup and script. Say so in a comment.

- [ ] **Step 5: CI**

`.github/workflows/site-ci.yml`:

```yaml
# Guards the site on pull requests and pushes to main. The weekly research commit is pushed with the
# default GITHUB_TOKEN, which does not trigger workflows, so on that commit the build assertions run
# only inside Vercel's build; that build is the one that would publish bad data, so it is enough.
name: Site

on:
  pull_request:
  push:
    branches: [main]

jobs:
  site:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r typecheck
      - run: pnpm -r test
      - run: pnpm --filter kc-events-site exec playwright install --with-deps chromium
      - run: pnpm --filter kc-events-site test:e2e
      - run: pnpm --filter kc-events-site build
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: site/playwright-report
```

`pnpm --filter kc-events-site build` runs the real build with the size check last.

- [ ] **Step 6: Run it all locally**

Run: `cd site && pnpm test:e2e && pnpm build`. Expected: every spec passes; the size check prints three `ok` lines. If a page is over budget, the fix is in that page's task (most likely a chunk the explorer pulls in that the front page also loads); do not raise the budget.

- [ ] **Step 7: Commit**

```bash
git add site/playwright.config.ts site/e2e site/scripts/size-check.ts .github/workflows/site-ci.yml
git commit -m "$(cat <<'EOF'
Test the built site end to end, check page budgets, and run both in CI

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Vercel, and the design pass on the preview

**Model:** opus (the design pass). The Vercel steps are done by the orchestrator with Evan's Vercel account, through the Vercel MCP tools in this session or the dashboard; a subagent does not create the project.

**Files:**
- Modify: whatever the design pass touches under `site/src/styles/` and `site/src/components/`; `docs/superpowers/specs/2026-10-04-public-site-design.md` (record the production URL under section 3).

**Interfaces:** none new.

- [ ] **Step 1: Create the Vercel project** (orchestrator, with confirmation from Evan before each outward-facing call)

Settings, exactly:

- Git repository: this repo; production branch `main`.
- Root Directory: `site`; "Include source files outside of the Root Directory in the Build Step": **on**.
- Framework preset: Astro. Build command: `pnpm build`. Output directory: `dist`. Install command: default (Vercel detects the pnpm workspace and installs at the repo root).
- Node.js version: 22.x (also pinned by `site/package.json` `engines`).
- Ignored Build Step (Project Settings → Git): **Custom**, command `git diff --quiet HEAD^ HEAD -- . ../data/events.json ../src ../research.config.yaml ../pnpm-lock.yaml ../pnpm-workspace.yaml`. If the monorepo "Skip deployment when no changes are detected" switch is present, turn it **off** so the custom command is the only skip rule.
- Environment variables: none. (`SITE_ORIGIN` is set only after a custom domain exists.)

- [ ] **Step 2: Prove the deploy triggers** (orchestrator)

1. Push a branch with a one-line change to `data/runs/README.md` (create the file if needed, a docs-only change): Vercel must report the deployment as **skipped** by the ignored build step.
2. Push a branch that touches `data/events.json` (bump `generatedAt` by one second, nothing else): Vercel must build and give a preview URL.
3. `curl -sI https://<preview>/events.json | grep -i -E 'cache-control|access-control'`: both headers present.
4. `curl -s -o /dev/null -w '%{http_code}' https://<preview>/e/nothing-here`: `404`.
5. Revert both changes without merging; record the production URL in the spec under section 3.

- [ ] **Step 3: The design pass on the preview URL** (opus subagent)

Read the spec's section 9 and load `impeccable:impeccable` if available. On the preview URL, at 320 px, 768 px, and 1280 px, in both schemes, review `/`, `/explore`, an event page, and `/about` against these and fix in the site's source what fails:

- Calm density: the explorer shows about 30 unflagged rows at 1280×800; the front page's cards read as a list, not a wall.
- The why-line is the largest secondary text; metadata is quiet; titles read at arm's length on a phone.
- Kind hues appear only as chips and left rules; don't-miss is one treatment (mark + heavier card) that does not fight the hue.
- Every text pairing clears 4.5:1 in both schemes (axe already checks; this is the eye check for near-misses).
- Focus rings visible on every control; the skip link works; the filter sheet collapses on phones and opens on wide screens.
- No motion anywhere except a hover underline.
- Copy: nouns for headings, no exclamation marks, the glossary's terms.

Each fix is a small commit with a plain subject ("Tighten the explorer's row height on wide screens"). Re-run `pnpm test:e2e && pnpm build` before each commit so the budgets and axe hold.

- [ ] **Step 4: Evan's review**

Send Evan the preview URL. The spec says design review happens here, after the explorer exists; what he asks for becomes issues, not scope for this task.

- [ ] **Step 5: Commit**

```bash
git add site docs/superpowers/specs/2026-10-04-public-site-design.md
git commit -m "$(cat <<'EOF'
Polish the site's design on the preview and record the production URL

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## After the plan

Milestone two's second half, the hub push, is a separate spec. Follow-ups named by the spec and not in this plan: a map (needs a venue coordinate table), venue and kind landing pages, a daily rebuild through a deploy hook, the name and domain, and the job-side neighborhood remap (Task 0's issue).
