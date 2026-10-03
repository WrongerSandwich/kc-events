import type { CompletionResult } from "../../src/ports.js";
import type { Source } from "../../src/registry.js";

// Weekly runs at 22:15 Kansas City time: Oct 2, Oct 9, Oct 16 (CDT, UTC-5).
export const WEEK_1 = new Date("2026-10-03T03:15:00Z");
export const WEEK_2 = new Date("2026-10-10T03:15:00Z");
export const WEEK_3 = new Date("2026-10-17T03:15:00Z");
export const WEEK_1_ISO = "2026-10-02T22:15:00-05:00";
export const WEEK_2_ISO = "2026-10-09T22:15:00-05:00";
export const WEEK_3_ISO = "2026-10-16T22:15:00-05:00";

/** A calendar page that came back fine; what is on it is up to the scripted model reply. */
export const PAGE = { status: 200, body: "<html><body>calendar</body></html>" };

/** An active registry source with one calendar page at https://<name>.test/calendar. */
export function source(name: string, overrides: Partial<Omit<Source, "name" | "status">> = {}): Source & { status: "active" } {
  const host = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return { name, urls: [`https://${host}.test/calendar`], kind: "music", neighborhood: "Westport", status: "active", ...overrides };
}

/**
 * What the extraction model says about one candidate on a source's calendar page; fields default
 * to a fully cited single-night show at the source's own venue, a few weeks out.
 */
export function candidateAt(at: Source, overrides: Record<string, unknown> = {}) {
  return {
    title: "Big Show",
    startDate: "2026-10-31",
    startTime: "20:00",
    endDate: null,
    endTime: null,
    schedule: null,
    sportsSeason: false,
    venue: at.name,
    neighborhood: at.neighborhood,
    outsideGeography: false,
    kind: at.kind,
    primaryUrl: at.urls[0],
    dateEvidence: "Sat, Oct 31 · Doors 7:00 PM · Show 8:00 PM",
    venueEvidence: `${at.name}, 1 Main St`,
    notice: "none",
    ...overrides,
  };
}

/** A scripted extraction reply listing these candidates, at a per-call cost. */
export function costing(costUsd: number, ...candidates: unknown[]): CompletionResult {
  return { value: { events: candidates }, costUsd };
}

/** A scripted curation reply carrying these judgments, at a per-call cost. */
export function judging(costUsd: number, ...judgments: { id: string; dontMiss: boolean; why: string }[]): CompletionResult {
  return { value: { judgments }, costUsd };
}
