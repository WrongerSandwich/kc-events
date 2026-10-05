/**
 * The front page's Always there picks: a short, hand-kept list of the recurring things most worth knowing about.
 * Every other recurring event is one link away in the explorer. Edit freely; order here is order on the page.
 *
 * Each pick matches the first active recurring event whose primary page is on `host` (no "www.") and whose title
 * contains `title`, ignoring case and punctuation, so a venue that retitles monthly ("Main Gallery Tours (Nov. 2026)")
 * still matches. A pick that matches nothing is skipped.
 */
export const alwaysTherePicks: readonly { title: string; host: string }[] = [
  { title: "First Friday", host: "kccrossroads.org" },
  { title: "Farmers Market", host: "thecitymarket.org" },
  { title: "Second Fridays Open Studios", host: "zhoubartcenterkc.com" },
  { title: "Kansas City Chiefs", host: "arrowheadstadiumkc.com" },
  { title: "Mavericks", host: "kcmavericks.com" },
  { title: "Trivia", host: "replaylounge.com" },
  { title: "Main Gallery Tours", host: "theworldwar.org" },
];
