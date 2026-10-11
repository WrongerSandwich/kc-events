/**
 * Site-level values, safe in the browser: islands import this file, so nothing here reads the environment.
 * The time zone is the job's (`timezone` in research.config.yaml), read at build, not duplicated here.
 * The canonical origin is build-only, in src/build/origin.ts.
 */
export const siteConfig = {
  name: "KC This Week",
  tagline: "A weekly researched, ad-free list of what's worth doing in Kansas City.",
  repoUrl: "https://github.com/WrongerSandwich/kc-events",
  /** Days after the last successful run before every page shows the staleness banner. */
  staleAfterDays: 9,
  /**
   * The postal address the Event JSON-LD gives each region of research.config.yaml (a test holds the two in step).
   * In a region of `cities` a neighborhood is its own city, unless `kansasCity` names it. The catch-all region has no
   * entry: its events state Kansas City and no state.
   */
  regionAddress: {
    "Central KC": { state: "MO", cities: false },
    "South KC": { state: "MO", cities: false },
    Northland: { state: "MO", cities: true },
    "Kansas City, Kansas": { state: "KS", cities: true },
    "Johnson County": { state: "KS", cities: true },
    "Eastern Jackson County": { state: "MO", cities: true },
    Lawrence: { state: "KS", cities: true },
  } as Record<string, { state: string; cities: boolean } | undefined>,
  /** Neighborhoods in a region of cities that are parts of Kansas City, not cities of their own. */
  kansasCity: ["Northland", "Kansas City, Kansas"] as readonly string[],
} as const;
