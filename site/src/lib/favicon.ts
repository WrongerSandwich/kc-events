/**
 * The favicon: a small calendar tile, an ink header band over a white body, in the style of the cards' date tiles.
 * Without a day it is the static icon (public/apple-touch-icon.png and /favicon.svg); with one, the browser swaps it
 * in for today. Ink is the site's --fg and --accent in light mode, as hex because an icon cannot read the page's
 * tokens; the white body keeps the tile visible on dark browser chrome too.
 */

const INK = "#171717";
const TILE = `<rect x="1" y="2" width="30" height="29" rx="6" fill="${INK}"/><rect x="3.5" y="11" width="25" height="17.5" rx="3" fill="#fff"/>`;

export function faviconSvg(day?: number): string {
  if (day !== undefined && !(Number.isInteger(day) && day >= 1 && day <= 31)) throw new Error(`faviconSvg needs a day of the month, got ${day}`);
  const number = day === undefined ? "" : `<text x="16" y="26" text-anchor="middle" font-family="system-ui,sans-serif" font-size="15" font-weight="700" fill="${INK}">${day}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${TILE}${number}</svg>`;
}
