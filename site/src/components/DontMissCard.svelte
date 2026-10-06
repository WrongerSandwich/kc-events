<script lang="ts">
  import { meta } from "../generated/meta";
  import { formatShort, localDate } from "../lib/dates";
  import { hostOf } from "../lib/events";
  import { slugify } from "../lib/slugs";
  import { dateTile } from "../lib/tile";
  import type { PublishedEvent } from "../lib/types";
  import DateTile from "./DateTile.svelte";
  import KindChip from "./KindChip.svelte";
  import SaveButton from "./SaveButton.svelte";
  import UiIcon from "./UiIcon.svelte";

  let { event, today, now }: { event: PublishedEvent; today: string; now?: string } = $props();
  let tile = $derived(dateTile(event, today, now));
  // Every event the last run reached was verified that day, which the header already says; a card speaks up only
  // when its own check is older than that.
  const runDay = localDate(meta.lastSuccessfulRun);
  let checked = $derived(localDate(event.lastVerified));
</script>

<!-- The kind's colour fills the date tile and the chip; everything else on the card is ink. The id is the week
     strip's jump target. -->
<article class={`card kind-${slugify(event.kind)}`} class:started={tile.started} id={`pick-${event.id}`}>
  <DateTile {tile} id={event.id} />
  <div class="body">
    <h3 style={`view-transition-name: title-${event.id}`}><a href={`/e/${event.id}`}>{event.title}</a></h3>
    <p class="info">
      <span class="visually-hidden">{tile.label}.</span>
      {#if tile.detail}<span class="fact" aria-hidden="true"><UiIcon name="clock" />{tile.detail}</span>{/if}
      <span class="fact"><UiIcon name="map-pin" />{event.venue}, {event.neighborhood}</span>
    </p>
    {#if event.whyLine}<p class="why">{event.whyLine}</p>{/if}
    <p class="tags">
      <KindChip kind={event.kind} />
      <a class="fact primary" href={event.primaryUrl}><UiIcon name="link" />{hostOf(event.primaryUrl)}</a>
      {#if checked < runDay}<span class="fact verified"><UiIcon name="check" />Verified {formatShort(checked)}</span>{/if}
    </p>
  </div>
  <div class="actions">
    <SaveButton id={event.id} title={event.title} large />
    <!-- A plain link to the event's .ics file: it works with or without JavaScript. -->
    <a class="ics" href={`/e/${event.id}.ics`} download aria-label={`Add ${event.title} to your calendar`} title="Add to calendar"><UiIcon name="calendar-plus" /></a>
  </div>
</article>

<style>
  .card {
    display: grid; grid-template-columns: 4rem minmax(0, 1fr) auto; column-gap: var(--space-4); align-items: start;
    margin-top: var(--space-4); scroll-margin-top: var(--space-4);
  }
  .body { min-width: 0; }
  h3 { font-size: var(--text-lg); letter-spacing: -0.01em; line-height: var(--leading-tight); text-wrap: pretty; }
  h3 a { color: inherit; }
  .info { margin-top: var(--space-1); display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); font-size: var(--text-sm); color: var(--fg-muted); font-variant-numeric: tabular-nums; }
  /* A fact with its icon: the icon a shade quieter than the words. */
  .fact { display: inline-flex; align-items: baseline; gap: 0.35em; }
  .fact :global(.ui-icon) { color: var(--fg-faint); align-self: center; }
  .why { margin-top: var(--space-2); color: var(--fg-muted); max-width: 38rem; }
  .tags { margin-top: var(--space-2); display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-4); font-size: var(--text-sm); }
  /* Like the always-there host links: plain until hovered (base.css underlines links in a <p>). */
  .primary { color: var(--fg-muted); text-decoration: none; }
  .primary:hover { color: var(--fg); text-decoration: underline; }
  .verified { color: var(--fg-faint); }
  /* Save, then add to calendar; the slot keeps its width before Save mounts, so nothing re-wraps when it appears. */
  .actions { display: flex; gap: var(--space-2); min-width: calc(4.5rem + var(--tap) + var(--space-2)); justify-content: flex-end; }
  .ics {
    display: inline-flex; align-items: center; justify-content: center; width: var(--tap); height: var(--tap);
    border: 1px solid var(--control-border); border-radius: var(--radius); background: var(--bg-raised); color: var(--fg-muted);
    font-size: var(--text-lg);
    transition: color 150ms var(--ease-out), border-color 150ms var(--ease-out);
  }
  .ics:hover { color: var(--fg); border-color: var(--fg-faint); text-decoration: none; }
  /* Started: dimmed, not hidden (the site knows no end times). Not by opacity, which would drop text below AA: the
     title steps down to the muted ink, which clears 4.5:1 in both schemes, and the kind colours lose most of their
     chroma, which keeps their lightness and so their contrast. */
  h3 a, .card :global(.tile), .card :global(.chip) { transition: color 300ms var(--ease-out), filter 300ms var(--ease-out); }
  .started h3 a { color: var(--fg-muted); }
  .started :global(.tile), .started :global(.chip) { filter: saturate(0.3); }
  @media (prefers-reduced-motion: reduce) { .ics, h3 a, .card :global(.tile), .card :global(.chip) { transition: none; } }
  /* Phones: the actions stack under the tile, so the title gets the width. */
  @media (max-width: 30rem) {
    .card { grid-template-columns: 3.5rem minmax(0, 1fr); grid-template-rows: auto 1fr; column-gap: var(--space-3); }
    .body { grid-column: 2; grid-row: 1 / span 2; }
    .actions { grid-column: 1; grid-row: 2; min-width: 0; flex-direction: column; margin-top: var(--space-2); }
    .actions :global(button), .ics { width: 100%; min-width: 0; padding-inline: 0; }
  }
</style>
