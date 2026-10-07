/**
 * Run as `pnpm exec tsx scripts/icons.ts` after changing src/lib/mark.ts: renders the fountain mark to the two committed
 * raster icons, both the mark on a white square, since iOS fills a transparent home-screen icon with black and a tab
 * icon with no ground vanishes on a dark tab bar:
 *   public/apple-touch-icon.png, 180 px, square-cornered (iOS rounds it);
 *   public/favicon.ico, 32 px with rounded corners, a PNG in an ICO container, for Safari, which draws no SVG icon.
 * Each PNG carries the SVG it was drawn from as a text chunk, so a test can tell when it has gone stale.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { pngToIco } from "../src/build/ico.ts";
import { withPngSource } from "../src/build/png-source.ts";
import { markSvg } from "../src/lib/mark.ts";

const browser = await chromium.launch();
async function render(size: number, mark: number, radius: number): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const svg = markSvg().replace("<svg ", `<svg width="${mark}" height="${mark}" `);
  await page.setContent(`<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;background:#fff;border-radius:${radius}px;display:grid;place-items:center">${svg}</div></body>`);
  const png = await page.screenshot({ omitBackground: true });
  await page.close();
  return withPngSource(png, markSvg());
}
writeFileSync(new URL("../public/apple-touch-icon.png", import.meta.url), await render(180, 124, 0));
writeFileSync(new URL("../public/favicon.ico", import.meta.url), pngToIco(await render(32, 26, 6), 32));
await browser.close();
