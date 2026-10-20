/**
 * Venue line art (#149): a small stroke-only drawing of a venue's building in its page's header, coloured by what the
 * venue hosts. Each drawing is three groups of strokes by role, so the colour sits on the role and never in the art:
 * `outline` is the building's main form, `detail` its windows, ribs, or columns, `accent` one or two small marks.
 * VenueArt.astro colours the groups by the venue's kinds, ranked by every record in the dataset at it, expired ones
 * included (PublishedVenue.kindCounts). Strokes only, no fill, so one drawing serves the light and dark schemes.
 *
 * The drawings were made by hand for this site from photographs of the buildings, in a 120 by 64 box with whole
 * coordinates; no editor metadata, no third-party art. A pilot of three; a venue with no entry here renders as before.
 */
export type VenueArt = {
  viewBox: string;
  /** The building's main form and the ground. */
  outline: string;
  /** Windows, ribs, columns. */
  detail: string;
  /** One or two small marks. */
  accent: string;
};

export type ArtRole = keyof Omit<VenueArt, "viewBox">;
export const ART_ROLES: readonly ArtRole[] = ["outline", "detail", "accent"];

/**
 * What a kind after the venue's top one needs to colour a group: at least this share of the venue's records, and at
 * least two of them (ART_MIN_RECORDS), so one stray booking, a lone comedy night at a music hall, colours nothing.
 */
export const ART_CUTOFF = 0.1;
export const ART_MIN_RECORDS = 2;

export type ArtColours = Record<ArtRole, string>;

/**
 * The kind each stroke group takes: the venue's top kind the outline, the second the detail, the third the accent,
 * with the top kind filling any group left over, so a single-kind venue is all one colour. The top kind always
 * counts; a kind after it is left out under ART_CUTOFF of the records or ART_MIN_RECORDS. A tie goes by `order`, the
 * config's list of kinds, a kind it does not list after them, so the ranking is the same on every build. A venue with
 * no record at all is "other", the grey.
 */
export function illustrationColours(counts: Record<string, number>, order: readonly string[]): ArtColours {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const rank = (kind: string) => {
    const i = order.indexOf(kind);
    return i === -1 ? order.length : i;
  };
  const ranked = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .filter(([, n], i) => i === 0 || (n >= ART_MIN_RECORDS && n >= total * ART_CUTOFF))
    .map(([kind]) => kind);
  const top = ranked[0] ?? "other";
  return { outline: top, detail: ranked[1] ?? top, accent: ranked[2] ?? top };
}

/** The drawings, by the venue page's slug (venueSlug of the display name). */
export const venueArt: Record<string, VenueArt> = {
  // Moshe Safdie's nested shells from the south-east: the tallest in front, five more stepping down behind it, each a
  // quarter-ellipse rising to a vertical glass face; the slots on the end wall as the accent.
  "kauffman-center-for-the-performing-arts": {
    viewBox: "0 0 120 64",
    outline: '<path d="M4 56H116"/><path d="M6 56A34 46 0 0 1 40 10V56"/>',
    detail:
      '<path d="M40 16A32 43 0 0 1 52 13V56"/><path d="M52 20A30 39 0 0 1 64 17V56"/><path d="M64 25A28 34 0 0 1 76 22V56"/><path d="M76 31A26 28 0 0 1 88 28V56"/><path d="M88 38A24 21 0 0 1 100 35V56"/>',
    accent: '<path d="M104 40v5M108 40v5"/>',
  },
  // The 1933 building's south front: the central portico, raised, between two wings; six columns under its frieze
  // and the wings' tall windows; one of the shuttlecocks on the lawn as the accent.
  "nelson-atkins-museum-of-art": {
    viewBox: "0 0 120 64",
    outline: '<path d="M2 56H118"/><path d="M4 56V22H30V13H70V22H96V56"/><path d="M30 22H70"/>',
    detail:
      '<path d="M33 26h4m-2 0v26M39 26h4m-2 0v26M45 26h4m-2 0v26M51 26h4m-2 0v26M57 26h4m-2 0v26M63 26h4m-2 0v26"/><path d="M31 52H69M28 56V53H72V56"/><path d="M10 30v16M16 30v16M22 30v16M78 30v16M84 30v16M90 30v16"/>',
    accent: '<path d="M104 51L99 36M108 51V34M112 51L117 36"/><path d="M99 36Q108 31 117 36"/><circle cx="108" cy="53" r="3"/>',
  },
  // The two-storey painted-brick front on West 19th: a stepped parapet, three arched windows over the storefront and
  // its door, the string course between; the cartouche on the parapet and the stoop's railings as the accent.
  "bird-comedy-theater": {
    viewBox: "0 0 120 64",
    outline: '<path d="M4 56H116"/><path d="M24 56V20H44V16H76V20H96V56"/>',
    detail:
      '<path d="M24 34H96"/><path d="M31 31V24a4 4 0 0 1 8 0v7M56 31V24a4 4 0 0 1 8 0v7M81 31V24a4 4 0 0 1 8 0v7"/><path d="M28 52V40H50V52M70 52V40H92V52M55 56V40H65V56"/>',
    accent: '<circle cx="60" cy="13" r="3"/><path d="M52 56V47h3M68 56V47h-3"/>',
  },
};
