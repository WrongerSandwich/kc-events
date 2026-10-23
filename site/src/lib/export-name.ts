import { kindName } from "./landing";
import type { Filters } from "./query";
import { slugify } from "./slugs";

/**
 * What the explorer's export ("Export 12 to calendar") names its file and calendar (#190): after the slice, "KC This
 * Week · Comedy" in `kc-this-week-comedy.ics`, in the order the filter pills come (shortlist, kinds, regions, picks,
 * search). The dates
 * and the sort are left out: the dates narrow a view without being what it is about, and each event carries its own.
 */
export function exportName(f: Filters, siteName: string): { calendarName: string; filename: string } {
  const parts: string[] = [];
  if (f.ids.length > 0) parts.push("Shortlist");
  if (f.kinds.length > 0) parts.push(f.kinds.map(kindName).join(", "));
  if (f.regions.length > 0) parts.push(f.regions.join(", "));
  if (f.dontMiss) parts.push("Picks");
  const q = f.q.trim();
  if (q !== "") parts.push(`“${q}”`);
  const calendarName = [siteName, ...parts].join(" · ");
  return { calendarName, filename: `${slugify(calendarName)}.ics` };
}
