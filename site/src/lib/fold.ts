/**
 * Text folded for matching: lowercase, accents dropped (NFKD splits "ó" into "o" and a combining mark, which is
 * removed), and every run of anything but letters and digits one space. "Café — Jazz/Blues" → "cafe jazz blues",
 * "Rolón" → "rolon". slugify is built on it, so a change here moves the /k/, /r/ and /v/ pages too.
 */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
