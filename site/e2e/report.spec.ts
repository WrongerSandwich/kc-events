import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { handleReport, publishedEvents } from "../src/server/report";

// The preview serves only the static build, so /api/report is answered here by the real function, with GitHub faked:
// what the browser posts and what it is shown are the function's own (#129). The event lookup reads the preview's own
// /events.json, as the deployed function reads its deployment's.
async function serveReports(page: Page) {
  const filed: { title: string; body: string; labels: string[] }[] = [];
  const github = (async (_url: string, init: RequestInit) => {
    filed.push(JSON.parse(init.body as string));
    return Response.json({ html_url: "https://github.com/WrongerSandwich/kc-events/issues/1" }, { status: 201 });
  }) as typeof fetch;
  await page.route("**/api/report", async (route) => {
    const request = route.request();
    const response = await handleReport(
      new Request(request.url(), { method: request.method(), headers: await request.allHeaders(), body: request.postData() ?? "" }),
      { token: "e2e-token", origins: ["http://localhost:4321"], fetch: github, published: publishedEvents("http://localhost:4321", fetch) },
    );
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  return filed;
}

test("an event's report sends in place with its pages, and says so", async ({ page }) => {
  const filed = await serveReports(page);
  await page.goto("/e/evt_e2e000000001");
  await page.getByText("Wrong? Report it").click();
  await expect(page.getByText("Posted publicly on GitHub. No name or contact needed.")).toBeVisible();
  await page.getByLabel("What is wrong").fill("It starts at 8, not 7.");
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.locator(".report").getByRole("status")).toHaveText("Sent. Thanks.");
  await expect(page).toHaveURL(/\/e\/evt_e2e000000001$/);
  expect(filed).toHaveLength(1);
  expect(filed[0]!.title).toBe("Wrong listing: Fabio Frizzi plays Fulci");
  expect(filed[0]!.labels).toEqual(["bug", "needs-triage"]);
  expect(filed[0]!.body).toContain("/e/evt_e2e000000001");
  expect(filed[0]!.body).toContain("https://example.com/recordbar/frizzi");
  expect(filed[0]!.body).toContain("https://tickets.example.com/frizzi");
});

test.describe("with JavaScript off", () => {
  test.use({ javaScriptEnabled: false });

  test("the about page's form still posts, and lands on the function's answer", async ({ page }) => {
    const filed = await serveReports(page);
    await page.goto("/about");
    await page.getByText("Report a wrong listing", { exact: true }).click();
    await page.getByLabel("What is wrong").fill("The Midland show is listed twice.");
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByText("Sent. Thanks.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to the about page" })).toHaveAttribute("href", "/about");
    expect(filed).toHaveLength(1);
  });
});

test("the report token is in no built file", () => {
  // build:e2e runs with GITHUB_REPORT_TOKEN set to this sentinel, as Vercel's build has the real one in its environment.
  const dist = fileURLToPath(new URL("../dist-e2e/", import.meta.url));
  const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]));
  const all = files(dist);
  expect(all.length).toBeGreaterThan(0);
  expect(all.filter((f) => readFileSync(f).includes("e2e-report-token-sentinel"))).toEqual([]);
});
