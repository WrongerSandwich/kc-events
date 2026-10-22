/**
 * Text folded for matching: lowercase, accents dropped (NFKD splits "ó" into "o" and a combining mark, and the mark is
 * removed, so an accent inside a word folds as well as one at its end), and every run of anything but letters and
 * digits one space. "Café — Jazz/Blues" → "cafe jazz blues", "Rolón" → "rolon".
 */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
