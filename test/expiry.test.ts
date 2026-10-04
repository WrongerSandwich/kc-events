import { describe, expect, it } from "vitest";
import type { Event } from "../src/dataset.js";
import { expire, expirePast, strike } from "../src/expiry.js";

const event: Event = {
  id: "evt_000000000001",
  title: "Big Show",
  start: "2026-10-10T20:00:00-05:00",
  venue: "Knuckleheads Saloon",
  neighborhood: "East Bottoms",
  primaryUrl: "https://venue.test/calendar",
  kind: "music",
  recurrence: "one-off",
  dontMiss: false,
  firstSeen: "2026-10-02T22:15:00-05:00",
  lastVerified: "2026-10-02T22:15:00-05:00",
  status: "active",
  verificationFailures: 0,
  consecutiveOutages: 0,
  lead: { lane: "registry", source: "Knuckleheads" },
  evidence: { date: "Sat, Oct 10", venue: "Knuckleheads Saloon" },
};

describe("expiry", () => {
  describe("past", () => {
    it("an event whose start date is before today expires with reason past", () => {
      expect(expirePast(event, "2026-10-11")).toMatchObject({ status: "expired", expiryReason: "past" });
    });

    it("an event happening today, or later, is not past", () => {
      expect(expirePast(event, "2026-10-10")).toBe(event);
      expect(expirePast(event, "2026-10-02")).toBe(event);
    });

    it("a run judges by its end date when it has one", () => {
      const run = { ...event, end: "2026-10-17" };
      expect(expirePast(run, "2026-10-15")).toBe(run);
      expect(expirePast(run, "2026-10-18")).toMatchObject({ status: "expired", expiryReason: "past" });
    });

    it("an unverified event can be past; an event with no date, or one already expired for another reason, is left alone", () => {
      const unverified: Event = { ...event, status: "unverified" };
      expect(expirePast(unverified, "2026-10-11")).toMatchObject({ status: "expired", expiryReason: "past" });

      const { start: _, ...undated } = { ...event, status: "unverified" as const };
      expect(expirePast(undated, "2026-10-11")).toBe(undated);

      const cancelled = expire(event, "cancelled");
      expect(expirePast(cancelled, "2026-10-11")).toBe(cancelled);
    });
  });

  describe("two-strike", () => {
    it("one failed re-verification leaves the event active with one strike", () => {
      expect(strike(event)).toMatchObject({ status: "active", verificationFailures: 1 });
    });

    it("a second consecutive failure expires the event with reason two-strike", () => {
      expect(strike(strike(event))).toMatchObject({ status: "expired", expiryReason: "two-strike", verificationFailures: 2 });
    });
  });

  describe("cancelled", () => {
    it("expiring for cancellation records the reason and keeps everything else", () => {
      expect(expire(event, "cancelled")).toEqual({ ...event, status: "expired", expiryReason: "cancelled" });
    });
  });
});
