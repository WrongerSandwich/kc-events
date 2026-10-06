import { formatRange, formatShort, isValidDate } from "./dates";
import { slugify, slugTable } from "./slugs";

export const WHEN_PRESETS = ["today", "fri-sun", "weekend", "7d", "30d", "all"] as const;
export type WhenPreset = (typeof WHEN_PRESETS)[number];
/**
 * The presets' names in the filter rail and in the empty state's summary. `weekend` is older than "This weekend" and
 * keeps meaning today through Sunday, so shared links (the front page's among them) do not change.
 */
export const WHEN_LABELS: Record<WhenPreset, string> = {
  today: "Today",
  "fri-sun": "This weekend",
  weekend: "Through Sunday",
  "7d": "Next 7 days",
  "30d": "Next 30 days",
  all: "All",
};
export type When = { preset: WhenPreset } | { from: string; to: string };
export type Sort = "date" | "venue";

export type Filters = {
  when: When;
  kinds: string[];
  regions: string[];
  dontMiss: boolean;
  recurring: boolean;
  saved: boolean;
  q: string;
  sort: Sort;
};

export const DEFAULT_FILTERS: Filters = { when: { preset: "all" }, kinds: [], regions: [], dontMiss: false, recurring: false, saved: false, q: "", sort: "date" };

export type Known = { kinds: readonly string[]; regions: readonly string[] };

function parseWhen(raw: string | null): When {
  if (raw === null) return { preset: "all" };
  if ((WHEN_PRESETS as readonly string[]).includes(raw)) return { preset: raw as WhenPreset };
  const [from, to, ...rest] = raw.split("..");
  if (rest.length > 0 || from === undefined || to === undefined || !isValidDate(from) || !isValidDate(to)) return { preset: "all" };
  return from <= to ? { from, to } : { from: to, to: from };
}

/** Filters from a query string; anything unknown or malformed falls back to its default, never throws. */
export function parseQuery(params: URLSearchParams, known: Known): Filters {
  const kinds = slugTable(known.kinds);
  const regions = slugTable(known.regions);
  const pick = (key: string, table: ReturnType<typeof slugTable>) =>
    params.getAll(key).map((s) => table.fromSlug(s)).filter((n): n is string => n !== undefined).filter((n, i, all) => all.indexOf(n) === i);
  const sort = params.get("sort");
  return {
    when: parseWhen(params.get("when")),
    kinds: pick("kind", kinds),
    regions: pick("region", regions),
    dontMiss: params.get("dontmiss") === "1",
    recurring: params.get("recurring") === "1",
    saved: params.get("saved") === "1",
    q: (params.get("q") ?? "").trim(),
    sort: sort === "venue" ? "venue" : "date",
  };
}

/** The query string without "?", defaults omitted; "" when everything is default. */
export function toQuery(f: Filters): string {
  const p = new URLSearchParams();
  if ("from" in f.when) p.set("when", `${f.when.from}..${f.when.to}`);
  else if (f.when.preset !== "all") p.set("when", f.when.preset);
  for (const k of f.kinds) p.append("kind", slugify(k));
  for (const r of f.regions) p.append("region", slugify(r));
  if (f.dontMiss) p.set("dontmiss", "1");
  if (f.recurring) p.set("recurring", "1");
  if (f.saved) p.set("saved", "1");
  if (f.q.trim() !== "") p.set("q", f.q.trim());
  if (f.sort !== "date") p.set("sort", f.sort);
  return p.toString();
}

export function isDefault(f: Filters): boolean {
  return toQuery(f) === "";
}

/** The filters that narrow the results, in words ("Through Sunday", "music", "“jazz”"); sort narrows nothing and is left out. */
export function describeFilters(f: Filters): string[] {
  const out: string[] = [];
  if ("from" in f.when) out.push(f.when.from === f.when.to ? formatShort(f.when.from) : formatRange(f.when.from, f.when.to));
  else if (f.when.preset !== "all") out.push(WHEN_LABELS[f.when.preset]);
  out.push(...f.kinds, ...f.regions);
  if (f.dontMiss) out.push("don't-miss only");
  if (f.recurring) out.push("including always-there");
  if (f.saved) out.push("saved only");
  if (f.q.trim() !== "") out.push(`“${f.q.trim()}”`);
  return out;
}
