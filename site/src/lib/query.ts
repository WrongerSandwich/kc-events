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
  /** A shortlist (#132): exactly these events, in this order; empty for none. */
  ids: string[];
};

/** Every key toQuery can write; the explore page checks for them before the explorer hydrates. */
export const QUERY_KEYS = ["ids", "when", "kind", "region", "dontmiss", "recurring", "saved", "q", "sort"] as const;

/** What the explorer opens on (#183): today through Sunday, the front page's first horizon; omitted from URLs. */
export const DEFAULT_WHEN = { preset: "weekend" } as const satisfies When;
/** Every date: the "All" preset, written out as `when=all` since the default is the week. */
export const EVERY_DATE = { preset: "all" } as const satisfies When;

export const DEFAULT_FILTERS: Filters = { when: DEFAULT_WHEN, kinds: [], regions: [], dontMiss: false, recurring: false, saved: false, q: "", sort: "date", ids: [] };

/** `ids`, the published events' ids, drops a shortlisted id that is not one; without it any well-formed id is kept. */
export type Known = { kinds: readonly string[]; regions: readonly string[]; ids?: readonly string[] };

/** An event id's shape; it needs no escaping in a query string, so a shortlist link keeps its plain commas. */
const ID = /^evt_[A-Za-z0-9_-]+$/;

function parseIds(raw: string | null, known: readonly string[] | undefined): string[] {
  const published = known === undefined ? undefined : new Set(known);
  const out: string[] = [];
  for (const id of (raw ?? "").split(",")) {
    if (ID.test(id) && (published === undefined || published.has(id)) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** A shortlist's query string, without "?": `ids=evt_a,evt_b`. */
export function shortlistQuery(ids: readonly string[]): string {
  return `ids=${ids.filter((id) => ID.test(id)).join(",")}`;
}

/**
 * What a link without `when` means: every date for a shortlist or the saved view, lists the reader was sent or made
 * whose events are not this week's alone; else the week.
 */
function impliedWhen(isList: boolean): { preset: WhenPreset } {
  return isList ? EVERY_DATE : DEFAULT_WHEN;
}

function parseWhen(raw: string | null, implied: When): When {
  if (raw === null) return implied;
  if ((WHEN_PRESETS as readonly string[]).includes(raw)) return { preset: raw as WhenPreset };
  const [from, to, ...rest] = raw.split("..");
  if (rest.length > 0 || from === undefined || to === undefined || !isValidDate(from) || !isValidDate(to)) return implied;
  return from <= to ? { from, to } : { from: to, to: from };
}

/** Filters from a query string; anything unknown or malformed falls back to its default, never throws. */
export function parseQuery(params: URLSearchParams, known: Known): Filters {
  const kinds = slugTable(known.kinds);
  const regions = slugTable(known.regions);
  const pick = (key: string, table: ReturnType<typeof slugTable>) =>
    params.getAll(key).map((s) => table.fromSlug(s)).filter((n): n is string => n !== undefined).filter((n, i, all) => all.indexOf(n) === i);
  const sort = params.get("sort");
  const saved = params.get("saved") === "1";
  // By the link's ids, not those still published: a shortlist that is all gone shows every date in its place.
  const isList = saved || (params.get("ids") ?? "") !== "";
  return {
    when: parseWhen(params.get("when"), impliedWhen(isList)),
    kinds: pick("kind", kinds),
    regions: pick("region", regions),
    dontMiss: params.get("dontmiss") === "1",
    recurring: params.get("recurring") === "1",
    saved,
    q: (params.get("q") ?? "").trim(),
    sort: sort === "venue" ? "venue" : "date",
    ids: parseIds(params.get("ids"), known.ids),
  };
}

/** The query string without "?", defaults omitted (the date filter when it is what the rest implies); "" when everything is default. */
export function toQuery(f: Filters): string {
  const p = new URLSearchParams();
  if ("from" in f.when) p.set("when", `${f.when.from}..${f.when.to}`);
  else if (f.when.preset !== impliedWhen(f.saved || f.ids.length > 0).preset) p.set("when", f.when.preset);
  for (const k of f.kinds) p.append("kind", slugify(k));
  for (const r of f.regions) p.append("region", slugify(r));
  if (f.dontMiss) p.set("dontmiss", "1");
  if (f.recurring) p.set("recurring", "1");
  if (f.saved) p.set("saved", "1");
  if (f.q.trim() !== "") p.set("q", f.q.trim());
  if (f.sort !== "date") p.set("sort", f.sort);
  const rest = p.toString();
  if (f.ids.length === 0) return rest;
  return rest === "" ? shortlistQuery(f.ids) : `${shortlistQuery(f.ids)}&${rest}`;
}

export function isDefault(f: Filters): boolean {
  return toQuery(f) === "";
}

/** One active filter: its words, its kind when it is one, and the filters with it removed. */
export type FilterPill = { label: string; kind?: string; without: Filters };

/**
 * The filters that narrow the results, one pill each, in words ("Through Sunday", "music", "“jazz”"); sort narrows
 * nothing and has none. A date's pill, the default week's among them, widens to every date when removed.
 */
export function filterPills(f: Filters): FilterPill[] {
  const out: FilterPill[] = [];
  if (f.ids.length > 0) out.push({ label: `Shortlist (${f.ids.length})`, without: { ...f, ids: [] } });
  const when = "from" in f.when ? (f.when.from === f.when.to ? formatShort(f.when.from) : formatRange(f.when.from, f.when.to)) : f.when.preset === "all" ? undefined : WHEN_LABELS[f.when.preset];
  if (when !== undefined) out.push({ label: when, without: { ...f, when: EVERY_DATE } });
  for (const k of f.kinds) out.push({ label: k, kind: k, without: { ...f, kinds: f.kinds.filter((x) => x !== k) } });
  for (const r of f.regions) out.push({ label: r, without: { ...f, regions: f.regions.filter((x) => x !== r) } });
  if (f.dontMiss) out.push({ label: "don't-miss only", without: { ...f, dontMiss: false } });
  if (f.recurring) out.push({ label: "including always-there", without: { ...f, recurring: false } });
  if (f.saved) out.push({ label: "saved only", without: { ...f, saved: false } });
  if (f.q.trim() !== "") out.push({ label: `“${f.q.trim()}”`, without: { ...f, q: "" } });
  return out;
}
