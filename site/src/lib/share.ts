export type ShareData = { title: string; text?: string; url: string };
/** What came of a share: the share sheet took it, the link was copied, the visitor closed the sheet, or nothing worked. */
export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

type Deps = { share?: (data: ShareData) => Promise<void>; writeText?: (text: string) => Promise<void> };

function browser(): Deps {
  if (typeof navigator === "undefined") return {};
  return {
    share: typeof navigator.share === "function" ? (d) => navigator.share(d) : undefined,
    writeText: navigator.clipboard?.writeText ? (t) => navigator.clipboard.writeText(t) : undefined,
  };
}

/**
 * The system share sheet where there is one, else the link copied to the clipboard (#132). A sheet the visitor closes is
 * their answer, so nothing is copied behind it; a sheet that refuses (no user gesture left, a blocked type) falls back
 * to the copy. No third-party script: both are the browser's own.
 */
export async function shareLink(data: ShareData, deps: Deps = browser()): Promise<ShareOutcome> {
  if (deps.share !== undefined) {
    try {
      await deps.share(data);
      return "shared";
    } catch (err) {
      // By name, not class: a DOMException is not an Error in every engine.
      if (typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError") return "cancelled";
    }
  }
  if (deps.writeText === undefined) return "failed";
  try {
    await deps.writeText(data.url);
    return "copied";
  } catch {
    return "failed";
  }
}
