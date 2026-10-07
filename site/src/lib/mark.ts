/**
 * The site's mark: a fountain, for the City of Fountains. Three stepped basins under a jet and five drops, filled in
 * currentColor so it takes the ink of wherever it sits: the header beside the name, the home-screen icon, the share
 * image. (The tab's icon stays the date tile in favicon.ts, which carries today's date; the mark has no number to
 * show.) Drawn as flat shapes so it reads at 20 px.
 */
export const MARK_VIEWBOX = "0 0 32 32";
export const MARK_INNER =
  '<circle cx="16" cy="3.5" r="1.6"/><circle cx="11" cy="6.5" r="1.3"/><circle cx="21" cy="6.5" r="1.3"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="24.5" cy="10.5" r="1"/>' +
  '<path d="M15 6h2v6h-2z"/><path d="M9 12h14l-2 4H11z"/><path d="M15 16h2v3h-2z"/><path d="M5 19h22l-2.5 4h-17z"/><path d="M15 23h2v3h-2z"/><path d="M2 26h28l-1 3H3z"/>';

/** The mark as a standalone SVG in `ink` (a hex colour, since an image cannot read the page's tokens). */
export function markSvg(ink = "#171717"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}" fill="${ink}">${MARK_INNER}</svg>`;
}
