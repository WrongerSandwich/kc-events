/**
 * Run as `pnpm exec tsx scripts/apple-touch-icon.ts` after changing src/lib/favicon.ts: renders the static tile (no day) to the committed
 * public/apple-touch-icon.png, 180 px square on white, because iOS fills a transparent icon with black.
 */
import { chromium } from "@playwright/test";
import { faviconSvg } from "../src/lib/favicon.ts";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
await page.setContent(`<body style="margin:0;background:#fff;display:grid;place-items:center;height:180px">${faviconSvg().replace("<svg ", '<svg width="140" height="140" ')}</body>`);
await page.screenshot({ path: new URL("../public/apple-touch-icon.png", import.meta.url).pathname });
await browser.close();
