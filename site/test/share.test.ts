import { describe, expect, it, vi } from "vitest";
import { shareLink } from "../src/lib/share";

const data = { title: "Late show", text: "Fri Oct 9, 7:00 pm · recordBar", url: "https://www.kcthisweek.com/e/evt_a1" };
const abort = () => Object.assign(new Error("cancelled"), { name: "AbortError" });

describe("shareLink (#132)", () => {
  it("hands the link to the system share sheet when there is one", async () => {
    const share = vi.fn(async () => {});
    const writeText = vi.fn(async () => {});
    expect(await shareLink(data, { share, writeText })).toBe("shared");
    expect(share).toHaveBeenCalledWith(data);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies the link when there is no share sheet", async () => {
    const writeText = vi.fn(async () => {});
    expect(await shareLink(data, { writeText })).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(data.url);
  });

  it("does nothing more when the visitor closes the share sheet", async () => {
    const writeText = vi.fn(async () => {});
    expect(await shareLink(data, { share: async () => { throw abort(); }, writeText })).toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies instead when the share sheet refuses", async () => {
    const writeText = vi.fn(async () => {});
    expect(await shareLink(data, { share: async () => { throw new DOMException("no", "NotAllowedError"); }, writeText })).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(data.url);
  });

  it("says it failed when neither works", async () => {
    expect(await shareLink(data, { writeText: async () => { throw new Error("denied"); } })).toBe("failed");
    expect(await shareLink(data, {})).toBe("failed");
  });
});
