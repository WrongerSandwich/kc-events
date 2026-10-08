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
} as const;
