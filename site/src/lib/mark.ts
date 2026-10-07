/**
 * The site's mark: a fountain, for the City of Fountains. Three stepped basins under a jet and five drops, filled in
 * currentColor so it takes the ink of wherever it sits: the header beside the name, the tab's icon, the home-screen
 * icon, the share image. Drawn as flat shapes so it reads at 16 px. The five drops are classed drop-1 to drop-5, left
 * to right, so a surface with room for colour (the header, the share image) can give each a kind's hue; the tab and
 * home-screen icons leave them in ink.
 */
export const MARK_VIEWBOX = "0 0 32 32";
export const MARK_INNER =
  '<circle class="drop drop-1" cx="7.5" cy="10.5" r="1.3"/><circle class="drop drop-2" cx="11" cy="6.5" r="1.6"/><circle class="drop drop-3" cx="16" cy="3.5" r="1.9"/><circle class="drop drop-4" cx="21" cy="6.5" r="1.6"/><circle class="drop drop-5" cx="24.5" cy="10.5" r="1.3"/>' +
  '<path d="M15 6h2v6h-2z"/><path d="M9 12h14l-2 4H11z"/><path d="M15 16h2v3h-2z"/><path d="M5 19h22l-2.5 4h-17z"/><path d="M15 23h2v3h-2z"/><path d="M2 26h28l-1 3H3z"/>';

/** The mark as a standalone SVG in `ink` (a hex colour, since an image cannot read the page's tokens). */
export function markSvg(ink = "#171717"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}" fill="${ink}">${MARK_INNER}</svg>`;
}

/**
 * The tab's icon (/favicon.svg): the mark in ink, and in near-white when the browser's chrome is dark, since an icon
 * cannot read the page's tokens but can read the scheme. Safari does not draw SVG icons and shows nothing, as before.
 */
export function faviconSvg(): string {
  const style = `<style>svg{fill:#171717}@media (prefers-color-scheme:dark){svg{fill:#f0f0f0}}</style>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}">${style}${MARK_INNER}</svg>`;
}
