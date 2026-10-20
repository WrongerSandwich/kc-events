/**
 * Site-level values, safe in the browser: islands import this file, so nothing here reads the environment.
 * The time zone is the job's (`timezone` in research.config.yaml), read at build, not duplicated here.
 * The canonical origin is build-only, in src/build/origin.ts.
 */
export const siteConfig = {
  name: "KC This Week",
  tagline: "A weekly researched, ad-free list of what's worth doing in Kansas City.",
  repoUrl: "https://github.com/WrongerSandwich/kc-events",
  /** The about page's Buy Me a Coffee badge links here; the badge image is a copy in public/, so nothing loads from their servers. */
  supportUrl: "https://buymeacoffee.com/EvanTrout",
  /** Days after the last successful run before every page shows the staleness banner. */
  staleAfterDays: 9,
  /**
   * The postal address the Event JSON-LD gives each region of research.config.yaml (a test holds the two in step).
   * `kansasCity` is which of the region's neighborhoods are parts of Kansas City: all of them, or only those listed,
   * every other being a city of its own. The catch-all region has no entry: its events state Kansas City and no state.
   */
  regionAddress: {
    "Central KC": { state: "MO", kansasCity: "all" },
    "South KC": { state: "MO", kansasCity: "all" },
    Northland: { state: "MO", kansasCity: ["Northland"] },
    "Kansas City, Kansas": { state: "KS", kansasCity: ["Kansas City, Kansas"] },
    "Johnson County": { state: "KS", kansasCity: [] },
    "Eastern Jackson County": { state: "MO", kansasCity: [] },
    Lawrence: { state: "KS", kansasCity: [] },
  } as Record<string, { state: string; kansasCity: "all" | readonly string[] } | undefined>,
} as const;
