/**
 * Text folded for matching: lowercase, accents dropped (NFKD splits "é" into "e" and a mark), and every run of anything
 * but letters and digits one space. "Café — Jazz/Blues" → "cafe jazz blues".
 */
export function fold(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}
