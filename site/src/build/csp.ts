/**
 * Build-time only: the CSP source for an inline script or style Astro does not hash itself (an `is:inline` element
 * whose text the page builds), for `Astro.csp.insertScriptHash` or `insertStyleHash`. The text must be exactly what
 * the element renders.
 */
import { createHash } from "node:crypto";

export function cspHash(text: string): `sha256-${string}` {
  return `sha256-${createHash("sha256").update(text, "utf8").digest("base64")}`;
}
