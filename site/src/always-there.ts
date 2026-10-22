import type { Pick } from "./lib/always-there";

/**
 * The front page's Always there picks: a short, hand-kept list of the recurring things most worth knowing about.
 * Every other recurring event is one link away in the explorer. Edit freely; order here is order on the page.
 *
 * Each pick matches the first active recurring event whose primary page is on `host` (no "www.") and whose title
 * contains `title`, ignoring case and punctuation, so a venue that retitles monthly ("Main Gallery Tours (Nov. 2026)")
 * still matches. A pick that names a `venue` also needs the event to be at it: "First Friday" alone would take a
 * First Friday night at The Bird off the same site. A pick that matches nothing is skipped.
 */
export const alwaysTherePicks: readonly Pick[] = [
  { title: "First Friday", host: "kccrossroads.org", venue: "Crossroads Arts District" },
  { title: "Farmers Market", host: "thecitymarketkc.org" },
  { title: "Main Gallery Tours", host: "theworldwar.org" },
];
