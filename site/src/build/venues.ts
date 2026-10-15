/**
 * Build-time only: the venue table, data/venues.yaml (#137, ADR 0013), and the venue pages made from it and the
 * published events. A table row adds an address, a position, and the venue's site to a page every venue with a
 * published event has anyway; a row whose venue has nothing coming up still makes one.
 */
import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { venueAndRoom, type VenueAliases } from "../../../src/identity.ts";
import type { Geo, PublishedEvent, PublishedVenue, VenueAddress } from "../lib/types";
import { venueSlug } from "../lib/venues";

/** The one shape an address may take: street, city, state, and ZIP, so the build can split it for JSON-LD. */
const ADDRESS = /^([^,]+), ([^,]+), (MO|KS) (\d{5})$/;

/** Around the metro and Lawrence, generously: a position outside it is a swapped pair or a sign dropped. */
const METRO = { lat: [38.5, 39.7], lng: [-95.6, -93.9] } as const;

const ROW = z
  .object({
    name: z.string().trim().min(1),
    address: z.string().trim().regex(ADDRESS, "is not one line of street, city, MO or KS, and ZIP (\"1601 Broadway Blvd, Kansas City, MO 64108\")"),
    lat: z.number().min(METRO.lat[0]).max(METRO.lat[1]).optional(),
    lng: z.number().min(METRO.lng[0]).max(METRO.lng[1]).optional(),
    url: z.string().regex(/^https?:\/\/[^\s]+$/, "is not an http or https URL").optional(),
  })
  .strict()
  .refine((r) => (r.lat === undefined) === (r.lng === undefined), "has lat without lng, or lng without lat");

export type VenueRow = { name: string; address: VenueAddress; geo?: Geo; url?: string };

function splitAddress(line: string): VenueAddress {
  const [, street, locality, region, postalCode] = ADDRESS.exec(line)!;
  return { street: street!, locality: locality!, region: region as "MO" | "KS", postalCode: postalCode! };
}

/**
 * The rows of a venue table file; none when no path is given. Throws naming the row that does not parse, and when the
 * file is not there: a table moved or renamed would otherwise drop every address from the site without a word.
 */
export function readVenueTable(path: string | undefined): VenueRow[] {
  if (path === undefined) return [];
  if (!existsSync(path)) throw new Error(`no venue table at ${path}`);
  const raw: unknown = parseYaml(readFileSync(path, "utf8")) ?? [];
  if (!Array.isArray(raw)) throw new Error(`${path} is not a list of venue rows`);
  return raw.map((item, i) => {
    const parsed = ROW.safeParse(item);
    if (!parsed.success) {
      const name = typeof (item as { name?: unknown })?.name === "string" ? `"${(item as { name: string }).name}"` : `${i + 1}`;
      const why = parsed.error.issues.map((issue) => `${issue.path.join(".") || "row"} ${issue.message}`).join("; ");
      throw new Error(`venue table row ${name}: ${why}`);
    }
    const r = parsed.data;
    return {
      name: r.name,
      address: splitAddress(r.address),
      ...(r.lat !== undefined && { geo: { lat: r.lat, lng: r.lng! } }),
      ...(r.url !== undefined && { url: r.url }),
    };
  });
}

/** The value most of the list gives, the first seen of a tie; undefined for an empty list. */
function mostCommon(values: readonly string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | undefined;
  for (const [v, c] of counts) if (best === undefined || c > counts.get(best)!) best = v;
  return best;
}

/**
 * The venue pages: one per slug among the published events' venues and the table's rows, by name. Throws on a row
 * keyed on anything but a display name (an alias, or a name no record in the dataset and no venueAliases entry has),
 * on two rows for one page, and on a venue name with no letter or digit to make a slug from.
 */
export function buildVenues(opts: { rows: VenueRow[]; events: PublishedEvent[]; recordVenues: readonly string[]; aliases: VenueAliases }): PublishedVenue[] {
  // The display names exactly as the site shows them, so a row also keeps a venue's spelling: "the truman" is no name.
  const known = new Set([...opts.recordVenues.map((n) => venueAndRoom(n, opts.aliases).venue), ...Object.keys(opts.aliases)]);
  const rows = new Map<string, VenueRow>();
  for (const row of opts.rows) {
    const { venue } = venueAndRoom(row.name, opts.aliases);
    if (venue !== row.name) throw new Error(`venue table row "${row.name}" is a name venueAliases files under "${venue}"; key the row on "${venue}"`);
    const slug = venueSlug(row.name);
    if (!known.has(row.name)) throw new Error(`venue table row "${row.name}" names no venue: no event in the dataset is at it, as spelled, and venueAliases has no entry for it`);
    const other = rows.get(slug);
    if (other !== undefined) throw new Error(`venue table rows "${other.name}" and "${row.name}" are one venue page, /v/${slug}; keep one`);
    rows.set(slug, row);
  }

  const bySlug = new Map<string, PublishedEvent[]>();
  for (const e of opts.events) {
    const slug = venueSlug(e.venue);
    if (slug === "") throw new Error(`event ${e.id} is at "${e.venue}", which has no letter or digit to make a venue page's slug from`);
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), e]);
  }

  const slugs = new Set([...bySlug.keys(), ...rows.keys()]);
  const venues = [...slugs].map((slug): PublishedVenue => {
    const row = rows.get(slug);
    const events = bySlug.get(slug) ?? [];
    const neighborhood = mostCommon(events.map((e) => e.neighborhood));
    return {
      slug,
      name: row?.name ?? mostCommon(events.map((e) => e.venue))!,
      ...(row?.address !== undefined && { address: row.address }),
      ...(row?.geo !== undefined && { geo: row.geo }),
      ...(row?.url !== undefined && { url: row.url }),
      ...(neighborhood !== undefined && { neighborhood, region: events.find((e) => e.neighborhood === neighborhood)!.region }),
    };
  });
  return venues.sort((a, b) => a.name.localeCompare(b.name));
}
