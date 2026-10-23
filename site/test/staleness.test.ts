import { afterEach, describe, expect, it, vi } from "vitest";

// Literals only inside a vi.mock factory: vitest hoists the call above every import and declaration.
vi.mock("../src/generated/meta", () => ({
  meta: { kinds: [], regions: [], lastSuccessfulRun: "2026-10-05T06:30:00-05:00", buildToday: "2026-10-05", timeZone: "America/Chicago" },
}));
import { showWhenStale, staleFrom } from "../src/components/header";

/** The banner as StalenessBanner.astro renders it on a fresh build: hidden, for the page's script to show. */
function banner(hidden = true): HTMLElement {
  const el = document.body.appendChild(document.createElement("div"));
  el.setAttribute("role", "status");
  el.hidden = hidden;
  el.textContent = "Out of date.";
  return el;
}

describe("the staleness banner's script", () => {
  let stops: (() => void)[] = [];
  const shown = (el: HTMLElement) => {
    stops.push(showWhenStale(el));
    return el;
  };

  afterEach(() => {
    for (const stop of stops) stop();
    stops = [];
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it("goes stale on the tenth day after the run", () => {
    expect(staleFrom()).toBe("2026-10-15");
  });

  it("stays hidden while the run is fresh", () => {
    vi.useFakeTimers({ now: new Date("2026-10-14T12:00:00Z") }); // 9 days
    expect(shown(banner())).not.toBeVisible();
  });

  it("shows on the tenth day", () => {
    vi.useFakeTimers({ now: new Date("2026-10-15T12:00:00Z") }); // 10 days
    expect(shown(banner())).toBeVisible();
  });

  it("appears when a tab left open comes back on the day the list goes stale (#93)", () => {
    vi.useFakeTimers({ now: new Date("2026-10-14T12:00:00Z") });
    const el = shown(banner());
    expect(el).not.toBeVisible();
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(el).toBeVisible();
  });

  it("goes by the visitor's clock over the build's: a stale build seen on a fresh day hides the banner", () => {
    vi.useFakeTimers({ now: new Date("2026-10-06T12:00:00Z") });
    expect(shown(banner(false))).not.toBeVisible();
  });
});
