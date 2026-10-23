// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REPORT_TEMPLATE } from "../src/lib/report";
import { handleReport, issueFor, LABELS, MAX_BODY, MAX_PER_HOUR, MAX_WHAT, publishedEvents } from "../src/server/report";

const SITE = "https://www.kcthisweek.com";
const form = readFileSync(fileURLToPath(new URL(`../../.github/ISSUE_TEMPLATE/${REPORT_TEMPLATE}`, import.meta.url)), "utf8");

const ISSUES = "https://api.github.com/repos/WrongerSandwich/kc-events/issues";
const FILED = "https://github.com/WrongerSandwich/kc-events/issues/999";

interface Open { number: number; html_url: string; body: string }

/**
 * A fake GitHub API. `calls` holds the issues filed (POST /issues), `comments` the comments posted, `searches` each
 * search's q. A search with author:@me finds `recent` issues opened in the last hour; one for open issues finds `open`.
 * A filing answers with `status`.
 */
function github(status = 201, { recent = 0, open = [] as Open[] } = {}) {
  const calls: { url: string; init: RequestInit; body: { title: string; body: string; labels: string[] } }[] = [];
  const comments: { url: string; body: string }[] = [];
  const searches: string[] = [];
  const fetch = (async (url: string, init: RequestInit = {}) => {
    const { pathname, searchParams } = new URL(url);
    if (pathname === "/search/issues") {
      const q = searchParams.get("q")!;
      searches.push(q);
      return Response.json(q.includes("author:@me") ? { total_count: recent, items: [] } : { total_count: open.length, items: open });
    }
    if (pathname.endsWith("/comments")) {
      comments.push({ url, body: JSON.parse(init.body as string).body });
      return Response.json({ html_url: `${url}#issuecomment-1` }, { status: 201 });
    }
    calls.push({ url, init, body: JSON.parse(init.body as string) });
    return Response.json({ html_url: FILED }, { status });
  }) as typeof globalThis.fetch;
  return { calls, comments, searches, fetch };
}

/** The form names only the event's page on the site; its title and pages come from the published data, never the form. */
const eventFields = { event: `${SITE}/e/evt_1` };
const published = async (id: string) =>
  id === "evt_1" ? { title: "Dark Forest", primaryUrl: "https://powellgardens.org/events", eventUrl: "https://powellgardens.org/event/dark-forest/" } : undefined;

function post(fields: Record<string, string>, json = false): Request {
  return new Request(`${SITE}/api/report`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...(json && { Accept: "application/json" }) },
    body: new URLSearchParams(fields),
  });
}

const NOW = new Date("2026-10-22T15:30:00.000Z");

async function send(fields: Record<string, string>, { json = false, token = "secret-token", status = 201, recent = 0, open = [] as Open[] } = {}) {
  const api = github(status, { recent, open });
  const response = await handleReport(post(fields, json), { token, origins: [SITE], fetch: api.fetch, published }, NOW);
  return { response, calls: api.calls, comments: api.comments, searches: api.searches };
}

describe("the report function", () => {
  it("files an event's report as the issue form would: title, labels, headings, and the event's pages looked up by its id", async () => {
    const { response, calls } = await send({ what: "It is on the 23rd, not the 22nd.", website: "", ...eventFields });
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call!.url).toBe(ISSUES);
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
    // The plain page says where the report went, and links it.
    const html = await response.text();
    expect(html).toContain(`Sent. It is now a <a href="${FILED}">public issue on GitHub</a>.`);
  });

  it("names the pages in words a reader knows, in step with the issue form", () => {
    const { body } = issueFor({ what: "x", context: { title: "t", event: `${SITE}/e/evt_1`, primaryUrl: "https://a.example/", eventUrl: "https://b.example/" } });
    expect(body).toContain("### Page it was read from\n\nhttps://a.example/");
    expect(body).toContain("### Event's own page\n\nhttps://b.example/");
    expect(form).toContain("label: Page it was read from");
    expect(form).toContain("label: Event's own page");
    expect(form).toMatch(/id: primary-page\n\s+attributes:\n\s+label: Page it was read from/);
    expect(form).toMatch(/id: event-page\n\s+attributes:\n\s+label: Event's own page/);
  });

  it("asks GitHub how many issues its token opened in the last hour, and files nothing past the cap", async () => {
    const under = await send({ what: "Wrong date.", ...eventFields }, { recent: MAX_PER_HOUR - 1 });
    expect(under.response.status).toBe(200);
    expect(under.searches[0]).toBe("repo:WrongerSandwich/kc-events is:issue author:@me created:>=2026-10-22T14:30:00Z");
    const over = await send({ what: "Wrong date.", ...eventFields }, { recent: MAX_PER_HOUR, json: true });
    expect(over.response.status).toBe(429);
    expect(await over.response.json()).toEqual({ ok: false, reason: "Too many reports in the last hour." });
    expect(over.calls).toHaveLength(0);
    expect(over.comments).toHaveLength(0);
    const page = await send({ what: "Wrong date." }, { recent: MAX_PER_HOUR + 5 });
    expect(page.response.status).toBe(429);
    expect(await page.response.text()).toContain("Too many reports in the last hour.");
  });

  it("comments on the open needs-triage issue that already carries the event, rather than opening another", async () => {
    const existing: Open = { number: 42, html_url: "https://github.com/WrongerSandwich/kc-events/issues/42", body: `### What is wrong\n\n\`\`\`text\nx\n\`\`\`\n\n### Event on kcthisweek.com\n\n${SITE}/e/evt_1\n` };
    const { response, calls, comments, searches } = await send({ what: "Still the wrong date.", ...eventFields }, { open: [existing], json: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, url: existing.html_url });
    expect(calls).toHaveLength(0);
    expect(comments).toHaveLength(1);
    expect(comments[0]!.url).toBe(`${ISSUES}/42/comments`);
    expect(comments[0]!.body).toContain("```text\nStill the wrong date.\n```");
    expect(comments[0]!.body).toMatch(/report form on the site/);
    expect(searches[1]).toBe(`repo:WrongerSandwich/kc-events is:issue is:open label:needs-triage in:body "${SITE}/e/evt_1"`);
  });

  it("opens a new issue when the open issues search found only carry another event's link", async () => {
    // evt_10 starts with evt_1: search matches words, so a hit that is not the same link must not count.
    const other: Open = { number: 43, html_url: "https://github.com/WrongerSandwich/kc-events/issues/43", body: `### Event on kcthisweek.com\n\n${SITE}/e/evt_10\n` };
    const { calls, comments } = await send({ what: "Wrong date.", ...eventFields }, { open: [other] });
    expect(calls).toHaveLength(1);
    expect(comments).toHaveLength(0);
  });

  it("looks for no duplicate of a report from the about page, which names no event", async () => {
    const { calls, searches } = await send({ what: "The Midland show is listed twice." });
    expect(calls).toHaveLength(1);
    expect(searches).toHaveLength(1);
  });

  it("says it could not send when GitHub's search fails, and files nothing", async () => {
    const fetch = (async (url: string) =>
      new URL(url).pathname === "/search/issues" ? new Response("rate limited", { status: 403 }) : Response.json({ html_url: FILED }, { status: 201 })) as typeof globalThis.fetch;
    const response = await handleReport(post({ what: "Wrong date.", ...eventFields }, true), { token: "t", origins: [SITE], fetch, published }, NOW);
    expect(response.status).toBe(502);
  });

  it("answers the form's script in JSON", async () => {
    const { response } = await send({ what: "Wrong venue.", ...eventFields }, { json: true });
    expect(await response.json()).toEqual({ ok: true, url: FILED });
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
    ["an event page on another site", { what: "Wrong date.", event: "https://evil.example/e/evt_1" }],
    ["a site page that is not an event's", { what: "Wrong date.", event: `${SITE}/about` }],
    ["an event the site does not publish", { what: "Wrong date.", event: `${SITE}/e/evt_gone` }],
    ["a field the form does not have", { what: "Wrong date.", email: "me@example.com" }],
    // The form once carried the event's title and pages; a client that still sends them is refused, so no report can
    // put its own title or links in an issue.
    ["the event's title sent by the client", { what: "Wrong date.", ...eventFields, title: "Free crypto giveaway" }],
    ["the event's pages sent by the client", { what: "Wrong date.", ...eventFields, "primary-page": "https://evil.example/phish", "event-page": "https://evil.example/x" }],
  ];
  for (const [name, fields] of refusals) {
    it(`files nothing for ${name}, and says it could not send`, async () => {
      const { response, calls } = await send(fields);
      expect(calls).toHaveLength(0);
      expect(response.status).toBeGreaterThanOrEqual(400);
      const html = await response.text();
      expect(html).toContain("Could not send.");
      expect(html).toContain("Try again, or use the GitHub link below.");
      expect(html).toContain(">Report it on GitHub</a>");
    });
  }

  it("files nothing for a repeated field or an oversized body, and says why it is too long", async () => {
    const api = github();
    const repeated = new Request(`${SITE}/api/report`, { method: "POST", body: "what=a&what=b" });
    expect((await handleReport(repeated, { token: "t", origins: [SITE], fetch: api.fetch, published })).status).toBe(400);
    const huge = new Request(`${SITE}/api/report`, { method: "POST", headers: { Accept: "application/json" }, body: `what=${"x".repeat(MAX_BODY)}` });
    const refused = await handleReport(huge, { token: "t", origins: [SITE], fetch: api.fetch, published });
    expect(refused.status).toBe(413);
    expect((await refused.json()) as { reason?: string }).toMatchObject({ ok: false, reason: expect.stringMatching(/too long/) });
    expect(api.calls).toHaveLength(0);
  });

  it("files a report at the longest length in a three-byte script, with every field at its limit", async () => {
    // 2,000 CJK characters URL-encode to 18,000 characters, past the old 16,000 cap (#187).
    const fields = { what: "日".repeat(MAX_WHAT), website: "", ...eventFields };
    expect(new URLSearchParams(fields).toString().length).toBeGreaterThan(16_000);
    const { response, calls } = await send(fields);
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("refuses a post from another site's page, so no page elsewhere can file through its visitors", async () => {
    const api = github();
    const deps = { token: "t", origins: [SITE], fetch: api.fetch, published };
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
    expect(await (await handleReport(request, { token: "t", origins: [SITE], fetch: api.fetch, published })).text()).toContain('href="/e/evt_1"');
  });

  it("says it could not send when the published data cannot be read, rather than calling the event unlisted", async () => {
    const api = github();
    const failing = async () => { throw new Error("events.json: 503"); };
    const response = await handleReport(post({ what: "Wrong date.", ...eventFields }, true), { token: "t", origins: [SITE], fetch: api.fetch, published: failing });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false });
    expect(api.calls).toHaveLength(0);
  });

  it("looks an event up in the deployment's own /events.json, by id", async () => {
    const requested: string[] = [];
    const fetch = (async (url: string) => {
      requested.push(url);
      return Response.json({ schemaVersion: 2, events: [{ id: "evt_1", title: "Dark Forest", primaryUrl: "https://powellgardens.org/events", eventUrl: "https://powellgardens.org/event/dark-forest/", venue: "Powell Gardens" }] });
    }) as typeof globalThis.fetch;
    const lookup = publishedEvents(SITE, fetch);
    expect(await lookup("evt_1")).toEqual({ title: "Dark Forest", primaryUrl: "https://powellgardens.org/events", eventUrl: "https://powellgardens.org/event/dark-forest/" });
    expect(await lookup("evt_gone")).toBeUndefined();
    expect(requested).toEqual([`${SITE}/events.json`, `${SITE}/events.json`]);
    const down = publishedEvents(SITE, (async () => new Response("", { status: 503 })) as typeof globalThis.fetch);
    await expect(down("evt_1")).rejects.toThrow(/503/);
  });

  it("answers anything but a POST with 405", async () => {
    const api = github();
    const response = await handleReport(new Request(`${SITE}/api/report`), { token: "t", origins: [SITE], fetch: api.fetch, published });
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
