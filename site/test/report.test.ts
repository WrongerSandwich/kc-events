// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REPORT_TEMPLATE, reportUrl } from "../src/lib/report";

const repo = "https://github.com/WrongerSandwich/kc-events";
// The issue form, read as text: the site does not depend on a YAML parser.
const form = readFileSync(fileURLToPath(new URL(`../../.github/ISSUE_TEMPLATE/${REPORT_TEMPLATE}`, import.meta.url)), "utf8");

describe("wrong-listing report link", () => {
  it("opens the issue form, which labels the report needs-triage whoever files it", () => {
    const url = new URL(reportUrl(repo));
    expect(`${url.origin}${url.pathname}`).toBe(`${repo}/issues/new`);
    expect(url.searchParams.get("template")).toBe(REPORT_TEMPLATE);
    expect(form).toMatch(/^labels: \[.*\bneeds-triage\b.*\]$/m);
  });

  it("prefills the title and the form's own fields with the event's pages", () => {
    const url = new URL(
      reportUrl(repo, { title: "Dark Forest", event: "https://www.kcthisweek.com/e/evt_1", primaryUrl: "https://powellgardens.org/", eventUrl: "https://powellgardens.org/event/dark-forest/" }),
    );
    expect(url.searchParams.get("title")).toBe("Wrong listing: Dark Forest");
    expect(url.searchParams.get("event")).toBe("https://www.kcthisweek.com/e/evt_1");
    expect(url.searchParams.get("primary-page")).toBe("https://powellgardens.org/");
    expect(url.searchParams.get("event-page")).toBe("https://powellgardens.org/event/dark-forest/");
    for (const key of ["event", "primary-page", "event-page"]) expect(form).toMatch(new RegExp(`^    id: ${key}$`, "m"));
  });

  it("leaves the event page out when the listing links none", () => {
    const url = new URL(reportUrl(repo, { title: "Fire Feast", event: "https://www.kcthisweek.com/e/evt_2", primaryUrl: "https://powellgardens.org/" }));
    expect(url.searchParams.has("event-page")).toBe(false);
  });
});
