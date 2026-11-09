/**
 * Build-time: the venue table, data/venues.yaml (#137, ADR 0013), and the venue pages made from it and the published
 * events. A table row adds an address, a position, and the venue's site to a page every venue with a published event
 * has anyway; a row whose venue has nothing coming up still makes one. The row's neighborhood is the job's (#258): the
 * run places the venue's events by it, and a page's neighborhood still comes from its events.
 */
import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { venueAndRoom, type VenueAliases } from "../../../src/identity.ts";
import { ADDRESS, parseVenueTable, type VenueTableConfig } from "../../../src/venues.ts";
import type { Geo, PublishedEvent, PublishedVenue, VenueAddress } from "../lib/types";
import { venueSlug } from "../lib/venues";

export type VenueRow = { name: string; address?: VenueAddress; geo?: Geo; url?: string };

function splitAddress(line: string): VenueAddress {
  const [, street, locality, region, postalCode] = ADDRESS.exec(line)!;
  return { street: street!, locality: locality!, region: region as "MO" | "KS", postalCode: postalCode! };
}

/**
 * The rows of a venue table file, parsed as the job parses it (src/venues.ts, against the config's aliases and
 * neighborhoods) and with each address split; none when no path is given. Throws naming the row that does not parse,
 * and when the file is not there: a table moved or renamed would otherwise drop every address from the site without a
 * word.
 */
export function readVenueTable(path: string | undefined, config: VenueTableConfig): VenueRow[] {
  if (path === undefined) return [];
  if (!existsSync(path)) throw new Error(`no venue table at ${path}`);
  return parseVenueTable(parseYaml(readFileSync(path, "utf8")), config).map((r) => ({
    name: r.name,
    ...(r.address !== undefined && { address: splitAddress(r.address) }),
    ...(r.lat !== undefined && { geo: { lat: r.lat, lng: r.lng! } }),
    ...(r.url !== undefined && { url: r.url }),
  }));
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
 * keyed on a known venue spelled another way (one keyed on an alias is refused as the table is parsed), on two rows
 * for one page, and on a venue name with no letter or digit to make a slug from. A row whose venue no record in the
 * dataset is at only warns: the job archives expired records eight weeks on, so a quiet venue's row would otherwise
 * refuse the weekly data commit's build, and the site would stop refreshing (audit 2026-10-21, E2).
 */
export function buildVenues(opts: { rows: VenueRow[]; events: PublishedEvent[]; recordVenues: readonly string[]; aliases: VenueAliases }): PublishedVenue[] {
  // The display names exactly as the site shows them, so a row also keeps a venue's spelling: "the truman" is no name.
  const known = new Set([...opts.recordVenues.map((n) => venueAndRoom(n, opts.aliases).venue), ...Object.keys(opts.aliases)]);
  const knownBySlug = new Map([...known].map((name) => [venueSlug(name), name]));
  const rows = new Map<string, VenueRow>();
  for (const row of opts.rows) {
    const slug = venueSlug(row.name);
    if (!known.has(row.name)) {
      const spelled = knownBySlug.get(slug);
      if (spelled !== undefined) throw new Error(`venue table row "${row.name}" is spelled other than the site spells "${spelled}"; key the row on "${spelled}"`);
      console.warn(`site: venue table row "${row.name}" names no venue a record in the dataset is at, and venueAliases has no entry for it: its page lists nothing until an event appears there; remove the row if the venue is gone`);
    }
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
