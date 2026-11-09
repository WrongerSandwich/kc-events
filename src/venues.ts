/**
 * The venue table (ADR 0013, amended #258): `data/venues.yaml`, a committed, hand-kept file of one row per venue,
 * keyed on the venue's display name (a venueAliases key, or the name as pages give it). The site's build reads a
 * row's address, position and site for the venue's page; the run reads a row's `neighborhood`, when it has one, and
 * places every event at the venue there each run, whatever its page says (#150). The run never writes the file, and a
 * table that does not parse stops it before any write, as the registry does.
 */
import { z } from "zod";
import { ELSEWHERE_IN_THE_METRO, type RunConfig } from "./config.js";
import { normalizeName, venueAndRoom } from "./identity.js";

/** The one shape an address may take: street, city, state, and ZIP, so the site can split it for JSON-LD. */
export const ADDRESS = /^([^,]+), ([^,]+), (MO|KS) (\d{5})$/;

/** Around the metro and Lawrence, generously: a position outside it is a swapped pair or a sign dropped. */
export const METRO = { lat: [38.5, 39.7], lng: [-95.6, -93.9] } as const;

const rowSchema = z
  .object({
    name: z.string().trim().min(1),
    address: z.string().trim().regex(ADDRESS, 'is not one line of street, city, MO or KS, and ZIP ("1601 Broadway Blvd, Kansas City, MO 64108")').optional(),
    lat: z.number().min(METRO.lat[0]).max(METRO.lat[1]).optional(),
    lng: z.number().min(METRO.lng[0]).max(METRO.lng[1]).optional(),
    url: z.string().regex(/^https?:\/\/[^\s]+$/, "is not an http or https URL").optional(),
    /** The neighborhood every event at the venue is placed in: one a region of the config lists, never the catch-all. */
    neighborhood: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine((r) => (r.lat === undefined) === (r.lng === undefined), "has lat without lng, or lng without lat")
  // A district (the Crossroads) has no one street address; it has a position.
  .refine((r) => r.address !== undefined || r.lat !== undefined, "has neither an address nor a position");

export type VenueRow = z.infer<typeof rowSchema>;

/** What of the config a venue table is checked against. */
export type VenueTableConfig = Pick<RunConfig, "neighborhoods" | "venueAliases">;

/**
 * The rows of a venue table as parsed; an empty or absent body is no rows. Throws naming the row that does not parse,
 * one keyed on a name venueAliases files under another venue (with the key to use), two rows for one venue, and a
 * neighborhood no region lists or the catch-all, so a row the config would not place is refused where it is written.
 */
export function parseVenueTable(raw: unknown, config: VenueTableConfig): VenueRow[] {
  const body = raw ?? [];
  if (!Array.isArray(body)) throw new Error("the venue table is not a list of venue rows");
  const listed = new Map(Object.values(config.neighborhoods).flat().map((n) => [normalizeName(n), n]));
  const seen = new Map<string, string>();
  return body.map((item, i) => {
    const parsed = rowSchema.safeParse(item);
    if (!parsed.success) {
      const name = typeof (item as { name?: unknown })?.name === "string" ? `"${(item as { name: string }).name}"` : `${i + 1}`;
      const why = parsed.error.issues.map((issue) => `${issue.path.join(".") || "row"} ${issue.message}`).join("; ");
      throw new Error(`venue table row ${name}: ${why}`);
    }
    const row = parsed.data;
    const { venue } = venueAndRoom(row.name, config.venueAliases);
    if (venue !== row.name) throw new Error(`venue table row "${row.name}" is a name venueAliases files under "${venue}"; key the row on "${venue}"`);
    const key = normalizeName(row.name);
    const other = seen.get(key);
    if (other !== undefined) throw new Error(`venue table rows "${other}" and "${row.name}" are one venue; keep one`);
    seen.set(key, row.name);
    if (row.neighborhood !== undefined) {
      if (normalizeName(row.neighborhood) === normalizeName(ELSEWHERE_IN_THE_METRO)) {
        throw new Error(`venue table row "${row.name}" names the catch-all; place a venue only in a neighborhood a region lists`);
      }
      if (!listed.has(normalizeName(row.neighborhood))) {
        throw new Error(`venue table row "${row.name}" names "${row.neighborhood}", which no region lists`);
      }
    }
    return row;
  });
}

/** The table's venues with a neighborhood, by display name: the map the run places events by. */
export function venueNeighborhoods(rows: readonly VenueRow[]): Record<string, string> {
  return Object.fromEntries(rows.flatMap((r) => (r.neighborhood === undefined ? [] : [[r.name, r.neighborhood]])));
}
