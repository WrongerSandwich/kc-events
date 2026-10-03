/** Small Markdown helpers shared by the run report and the grading document. */

export function plural(n: number, noun: string, nouns = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : nouns}`;
}

export function markdownList(items: string[]): string {
  return items.length === 0 ? "_None._" : items.map((i) => `- ${i}`).join("\n");
}

/** Keeps free text (error messages, reasons, titles) from breaking a Markdown table row. */
export function tableCell(text: string | undefined): string {
  return (text ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

/** A table with a header row, or the given placeholder when there are no rows. Cells are escaped by the caller. */
export function markdownTable(header: string[], rows: string[][], empty: string): string {
  if (rows.length === 0) return empty;
  return [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}
