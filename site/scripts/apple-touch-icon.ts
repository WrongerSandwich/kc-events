/**
 * Run as `pnpm exec tsx scripts/apple-touch-icon.ts` after changing src/lib/favicon.ts: renders the static tile (no
 * day) to the committed public/apple-touch-icon.png, 180 px square on white, because iOS fills a transparent icon with
 * black. The PNG carries the SVG it was drawn from as a text chunk, so a test can tell when it has gone stale.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { faviconSvg } from "../src/lib/favicon.ts";
import { withPngSource } from "../src/build/png-source.ts";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
await page.setContent(`<body style="margin:0;background:#fff;display:grid;place-items:center;height:180px">${faviconSvg().replace("<svg ", '<svg width="140" height="140" ')}</body>`);
const png = await page.screenshot();
await browser.close();
writeFileSync(new URL("../public/apple-touch-icon.png", import.meta.url), withPngSource(png, faviconSvg()));
