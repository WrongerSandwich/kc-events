// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REPORT_TEMPLATE } from "../src/lib/report";
import { handleReport, issueFor, LABELS, MAX_WHAT } from "../src/server/report";

const SITE = "https://www.kcthisweek.com";
const form = readFileSync(fileURLToPath(new URL(`../../.github/ISSUE_TEMPLATE/${REPORT_TEMPLATE}`, import.meta.url)), "utf8");

/** A fake GitHub API: records each request and answers with `status`. */
function github(status = 201) {
  const calls: { url: string; init: RequestInit; body: { title: string; body: string; labels: string[] } }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(init.body as string) });
    return Response.json({ html_url: "https://github.com/WrongerSandwich/kc-events/issues/999" }, { status });
  }) as typeof globalThis.fetch;
  return { calls, fetch };
}

const eventFields = {
  title: "Dark Forest",
  event: `${SITE}/e/evt_1`,
  "primary-page": "https://powellgardens.org/events",
  "event-page": "https://powellgardens.org/event/dark-forest/",
};

function post(fields: Record<string, string>, json = false): Request {
  return new Request(`${SITE}/api/report`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...(json && { Accept: "application/json" }) },
    body: new URLSearchParams(fields),
  });
}

async function send(fields: Record<string, string>, { json = false, token = "secret-token", status = 201 } = {}) {
  const api = github(status);
  const response = await handleReport(post(fields, json), { token, origins: [SITE], fetch: api.fetch });
  return { response, calls: api.calls };
}

describe("the report function", () => {
  it("files an event's report as the issue form would: title, labels, headings, and the event's pages", async () => {
    const { response, calls } = await send({ what: "It is on the 23rd, not the 22nd.", website: "", ...eventFields });
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call!.url).toBe("https://api.github.com/repos/WrongerSandwich/kc-events/issues");
    expect((call!.init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    expect(call!.body.title).toBe("Wrong listing: Dark Forest");
    expect(call!.body.labels).toEqual(LABELS);
    expect(form).toMatch(new RegExp(`^labels: \\[${LABELS.join(", ")}\\]$`, "m"));
    const body = call!.body.body;
    for (const label of [...form.matchAll(/^      label: (.+)$/gm)].map((m) => m[1]!)) expect(body).toContain(`### ${label}\n`);
    expect(body).toContain(`${SITE}/e/evt_1`);
    expect(body).toContain("https://powellgardens.org/events");
    expect(body).toContain("https://powellgardens.org/event/dark-forest/");
    expect(body).toContain("It is on the 23rd, not the 22nd.");
    expect(body).toMatch(/report form on the site/);
    expect(await response.text()).toContain("Sent. Thanks.");
  });

  it("answers the form's script in JSON", async () => {
    const { response } = await send({ what: "Wrong venue.", ...eventFields }, { json: true });
    expect(await response.json()).toEqual({ ok: true });
    const empty = await send({ what: "  " }, { json: true });
    expect(empty.response.status).toBe(400);
    expect(await empty.response.json()).toEqual({ ok: false, reason: "Say what is wrong." });
  });

  it("files a report from the about page with no event, titled by its first line", async () => {
    const { calls } = await send({ what: "The Midland show is listed twice.\nOnce on Friday." });
    expect(calls[0]!.body.title).toBe("Wrong listing: The Midland show is listed twice.");
    expect(calls[0]!.body.body).toContain("### Event on kcthisweek.com\n\n_No response_");
  });

  it("keeps what the reader wrote plain text, so it can mention no one and load nothing", () => {
    const { body } = issueFor({ what: "@someone ![x](https://evil.example/x.png) ```` and more" });
    expect(body).toContain("`````text\n@someone");
  });

  const refusals: [string, Record<string, string>][] = [
    ["a filled honeypot", { what: "Wrong date.", website: "https://spam.example", ...eventFields }],
    ["an empty what", { what: "", ...eventFields }],
    ["an overlong what", { what: "x".repeat(MAX_WHAT + 1), ...eventFields }],
    ["an event page on another site", { what: "Wrong date.", ...eventFields, event: "https://evil.example/e/evt_1" }],
    ["a site page that is not an event's", { what: "Wrong date.", ...eventFields, event: `${SITE}/about` }],
    ["a primary page that is not http(s)", { what: "Wrong date.", ...eventFields, "primary-page": "javascript:alert(1)" }],
    ["an own page that is not a URL", { what: "Wrong date.", ...eventFields, "event-page": "not a url" }],
    ["event context without its title", { what: "Wrong date.", event: `${SITE}/e/evt_1`, "primary-page": "https://powellgardens.org/" }],
    ["a field the form does not have", { what: "Wrong date.", email: "me@example.com" }],
  ];
  for (const [name, fields] of refusals) {
    it(`files nothing for ${name}, and says it could not send`, async () => {
      const { response, calls } = await send(fields);
      expect(calls).toHaveLength(0);
      expect(response.status).toBeGreaterThanOrEqual(400);
      const html = await response.text();
      expect(html).toContain("Could not send.");
      expect(html).toContain("report it on GitHub");
    });
  }

  it("files nothing for a repeated field or an oversized body", async () => {
    const api = github();
    const repeated = new Request(`${SITE}/api/report`, { method: "POST", body: "what=a&what=b" });
    expect((await handleReport(repeated, { token: "t", origins: [SITE], fetch: api.fetch })).status).toBe(400);
    const huge = new Request(`${SITE}/api/report`, { method: "POST", body: `what=${"x".repeat(20_000)}` });
    expect((await handleReport(huge, { token: "t", origins: [SITE], fetch: api.fetch })).status).toBe(413);
    expect(api.calls).toHaveLength(0);
  });

  it("refuses a post from another site's page, so no page elsewhere can file through its visitors", async () => {
    const api = github();
    const deps = { token: "t", origins: [SITE], fetch: api.fetch };
    const body = new URLSearchParams({ what: "spam" });
    const foreign = new Request(`${SITE}/api/report`, { method: "POST", headers: { Origin: "https://evil.example" }, body });
    expect((await handleReport(foreign, deps)).status).toBe(403);
    const crossSite = new Request(`${SITE}/api/report`, { method: "POST", headers: { "Sec-Fetch-Site": "cross-site" }, body });
    expect((await handleReport(crossSite, deps)).status).toBe(403);
    expect(api.calls).toHaveLength(0);
    const own = new Request(`${SITE}/api/report`, { method: "POST", headers: { Origin: SITE, "Sec-Fetch-Site": "same-origin" }, body });
    expect((await handleReport(own, deps)).status).toBe(200);
  });

  it("sends a refused post from an event's page back to that page", async () => {
    const api = github();
    const request = new Request(`${SITE}/api/report`, { method: "POST", headers: { Referer: `${SITE}/e/evt_1` }, body: new URLSearchParams({ what: "" }) });
    expect(await (await handleReport(request, { token: "t", origins: [SITE], fetch: api.fetch })).text()).toContain('href="/e/evt_1"');
  });

  it("answers anything but a POST with 405", async () => {
    const api = github();
    const response = await handleReport(new Request(`${SITE}/api/report`), { token: "t", origins: [SITE], fetch: api.fetch });
    expect(response.status).toBe(405);
    expect(api.calls).toHaveLength(0);
  });

  it("says it could not send when the token is missing or GitHub refuses, and never shows the token", async () => {
    const missing = await send({ what: "Wrong date." }, { token: "" });
    expect(missing.response.status).toBe(503);
    expect(missing.calls).toHaveLength(0);
    const refused = await send({ what: "Wrong date.", ...eventFields }, { status: 401 });
    expect(refused.response.status).toBe(502);
    const html = await refused.response.text();
    expect(html).toContain("Could not send.");
    expect(html).not.toContain("secret-token");
    // The failure page's GitHub link carries the event's context, and its back link returns to the event.
    expect(html).toContain("template=wrong-listing.yml");
    expect(html).toContain('href="/e/evt_1"');
  });
});
