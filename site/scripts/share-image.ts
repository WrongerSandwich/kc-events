import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(new URL("./share-image.html", import.meta.url).toString());
await page.screenshot({ path: new URL("../public/og.png", import.meta.url).pathname });
await browser.close();
