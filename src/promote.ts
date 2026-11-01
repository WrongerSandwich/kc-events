/**
 * The promotion draft (#255): what `pnpm promote <host>` prints and, with `--write`, adds to the registry.
 * Discovery suggests a host (ADR 0012); this drafts the registry source that would admit it, from the
 * events held on it, for a person to review, give its hints, and commit. The CLI is `promote-cli.ts`.
 */
import { stringify } from "yaml";
import { ELSEWHERE_IN_THE_METRO, type RunConfig } from "./config.js";
import type { Dataset, Event } from "./dataset.js";
import { hostOf, onHost } from "./hosts.js";
import { normalizeName } from "./identity.js";
import type { Registry, Source } from "./registry.js";

/** The heading the drafted stanzas go under at the registry's end, once. */
export const PROMOTED_HEADING = "# --- Promoted from discovery";

/** What `pnpm promote` prints for a host, and the stanza `--write` appends. */
export interface PromotionDraft {
  /** The host, without "www." and lowercased. */
  host: string;
  /** The events held for promotion on it, in dataset order. */
  held: Event[];
  /** What the discovery lane remembers of it, if anything. */
  state: Dataset["discoveryState"][string] | undefined;
  /** The registry source that would admit the host, its check hints left for a person to write. */
  stanza: Source & { status: "active" };
}

/**
 * The draft for a host: its held events, its discovery state, and a stanza named for the most common venue
 * among them (else the host, as when another source has that name), its URLs the distinct primary pages with the most held events first, its kind
 * the most common, and its neighborhood the most common one the config lists (else the catch-all). Throws
 * for a host already a registry source's, an aggregator, a ticketing platform, or one with nothing held.
 */
export function promotionDraft(
  hostArg: string,
  { dataset, registry, config, today }: { dataset: Dataset; registry: Registry; config: RunConfig; today: string },
): PromotionDraft {
  const host = hostOf(`https://${hostArg.replace(/^https?:\/\//i, "")}`) ?? hostArg;
  const url = `https://${host}/`;
  // A source on the host or a parent of it admits it already; one only on a subdomain does not (onAdmittedHost).
  const source = registry.sources.find((s) => onHost(url, s.urls.map((u) => hostOf(u) ?? u)));
  if (source) throw new Error(`${host} is already a registry source's host (${source.name}, ${source.status})`);
  if (onHost(url, config.discovery.aggregatorHosts)) throw new Error(`${host} is an aggregator: its pages are read only for their links`);
  if (onHost(url, config.discovery.platformHosts)) throw new Error(`${host} is a ticketing platform: its event pages are primary pages already, and it is no one source`);
  const held = dataset.events.filter((e) => e.heldForPromotion && onHost(e.primaryUrl, [host]));
  if (held.length === 0) throw new Error(`no events held for promotion on ${host}`);

  const urls = byCount(held.map((e) => e.primaryUrl));
  const listed = new Map(Object.values(config.neighborhoods).flat().map((n) => [normalizeName(n), n]));
  const neighborhoods = held.map((e) => listed.get(normalizeName(e.neighborhood))).filter((n): n is string => n !== undefined);
  const venue = byCount(held.map((e) => e.venue?.trim() ?? "").filter((v) => v !== ""))[0];
  // Source names are unique: a venue another source is already named for (Union Station, for a festival held there) gives way to the host.
  const named = venue !== undefined && !registry.sources.some((s) => s.name === venue);
  return {
    host,
    held,
    state: dataset.discoveryState[host],
    stanza: {
      name: named ? venue : host,
      urls,
      kind: byCount(held.map((e) => e.kind))[0]!,
      neighborhood: byCount(neighborhoods)[0] ?? ELSEWHERE_IN_THE_METRO,
      checkHints: "",
      status: "active",
      notes: `Promoted ${today} from discovery: ${held.length} held events on ${urls.length} ${urls.length === 1 ? "page" : "pages"}.`,
    },
  };
}

/** The distinct values, the most frequent first; a tie keeps the order they first appear in. */
function byCount(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

/** The stanza as YAML, indented as a `sources:` entry. */
export function stanzaYaml(stanza: Source): string {
  return stringify([stanza], { lineWidth: 0 })
    .trimEnd()
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

/** The registry's text with the stanza appended at its end, under the promoted heading, which is added once. */
export function withPromoted(registryText: string, stanza: Source): string {
  const heading = registryText.includes(PROMOTED_HEADING) ? "" : `\n  ${PROMOTED_HEADING}\n`;
  return `${registryText.trimEnd()}\n${heading}\n${stanzaYaml(stanza)}\n`;
}
