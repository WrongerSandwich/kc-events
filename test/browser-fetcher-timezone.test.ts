import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBrowserFetcher } from "../src/adapters/browser-fetcher.js";
import type { PlainFetcher } from "../src/adapters/fetcher.js";

// The browser fetcher in a real Chromium, under TZ=UTC as the GitHub fallback runner is (#322): a
// page whose script formats a date must read as it does in Kansas City, not as it does on the
// machine. The other browser fetcher tests fake Chromium; this one needs the real one, so it is
// skipped where neither Playwright's Chromium nor an installed Chrome will launch.

// Set before any browser launches: Chromium inherits the process's environment, so without the
// fetcher's time zone every page it renders runs in UTC (the contrast below shows that it does).
const machineZone = process.env.TZ;
process.env.TZ = "UTC";

/** A page whose script writes its time zone, and the day of an instant that is the 8th in Kansas City and the 9th in UTC. */
const PAGE = `<!doctype html><html><body><p id="zone"></p><p id="day"></p><script>
  document.getElementById("zone").textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;
  document.getElementById("day").textContent = new Date("2026-10-09T03:00:00Z").toLocaleDateString("en-US");
</script></body></html>`;

/** Playwright's own Chromium, else an installed Chrome (the runner's), else none: the channel a launch works with. */
async function launchable(): Promise<{ channel?: string } | undefined> {
  for (const channel of [undefined, "chrome"]) {
    try {
      await (await chromium.launch({ channel, timeout: 30_000 })).close();
      return { channel };
    } catch {
      // Not installed; try the next.
    }
  }
  return undefined;
}

const browser = await launchable();

/** A plain fetcher whose walk ends where it starts, with a policy that lets the test's local server through. */
function plainFetcher(): PlainFetcher {
  return {
    fetch: async (url) => ({ url, finalUrl: url, status: 200, body: "", robotsAllowed: true }),
    robotsAllows: async () => true,
    policy: { check: async () => undefined, pace: async () => undefined, setCrawlDelay: () => undefined },
  };
}

function rendered(body: string, id: string): string | undefined {
  return new RegExp(`<p id="${id}">([^<]*)</p>`).exec(body)?.[1];
}

describe.skipIf(!browser)("browser fetcher in a real Chromium, under TZ=UTC", () => {
  let server: Server;
  let url: string;

  beforeAll(async () => {
    server = createServer((_request, response) => response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(PAGE));
    await new Promise<void>((listening) => server.listen(0, "127.0.0.1", listening));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/calendar`;
  });

  afterAll(async () => {
    await new Promise((closed) => server.close(closed));
    if (machineZone === undefined) delete process.env.TZ;
    else process.env.TZ = machineZone;
  });

  it("runs on UTC without a time zone of its own, so the test's UTC is real", async () => {
    const plain = await chromium.launch({ channel: browser!.channel });
    try {
      const page = await (await plain.newContext()).newPage();
      await page.goto(url);
      const body = await page.content();
      expect(rendered(body, "zone")).toMatch(/^(UTC|Etc\/UTC)$/);
      expect(rendered(body, "day")).toBe("10/9/2026");
    } finally {
      await plain.close();
    }
  });

  it("renders a page's script-formatted dates in the config's time zone", async () => {
    const fetcher = createBrowserFetcher(plainFetcher(), { timezone: "America/Chicago", channel: browser!.channel, warn: () => undefined });
    try {
      const read = await fetcher.fetch(url);
      expect(read).toMatchObject({ status: 200, robotsAllowed: true });
      expect(rendered(read.body, "zone")).toBe("America/Chicago");
      expect(rendered(read.body, "day")).toBe("10/8/2026");
    } finally {
      await fetcher.close();
    }
  });
});
