<script lang="ts">
  import { meta } from "../generated/meta";
  import { formatShort, localDate } from "../lib/dates";
  import { hostOf } from "../lib/events";
  import { slugify } from "../lib/slugs";
  import { dateTile } from "../lib/tile";
  import type { PublishedEvent } from "../lib/types";
  import KindChip from "./KindChip.svelte";
  import SaveButton from "./SaveButton.svelte";

  let { event, today }: { event: PublishedEvent; today: string } = $props();
  let tile = $derived(dateTile(event, today));
  // Every event the last run reached was verified that day, which the header already says; a card speaks up only
  // when its own check is older than that.
  const runDay = localDate(meta.lastSuccessfulRun);
  let checked = $derived(localDate(event.lastVerified));
</script>

<!-- The kind's colour fills the date tile and the chip; everything else on the card is ink. -->
<article class={`card kind-${slugify(event.kind)}`}>
  <div class="tile" aria-hidden="true">
    <span class="top">{tile.top}</span>
    <span class="day">{tile.day}</span>
    <span class="month">{tile.month}</span>
  </div>
  <div class="body">
    <h3><a href={`/e/${event.id}`}>{event.title}</a></h3>
    <p class="info">
      <span class="visually-hidden">{tile.label}.</span>
      {#if tile.detail}<span aria-hidden="true">{tile.detail}</span><span class="sep" aria-hidden="true">·</span>{/if}
      <span>{event.venue}, {event.neighborhood}</span>
    </p>
    {#if event.whyLine}<p class="why">{event.whyLine}</p>{/if}
    <p class="tags">
      <KindChip kind={event.kind} />
      <a class="primary" href={event.primaryUrl} rel="noopener">{hostOf(event.primaryUrl)}</a>
      {#if checked < runDay}<span class="verified">Verified {formatShort(checked)}</span>{/if}
    </p>
  </div>
  <div class="save"><SaveButton id={event.id} title={event.title} large /></div>
</article>

<style>
  .card {
    display: grid; grid-template-columns: 4rem minmax(0, 1fr) auto; column-gap: var(--space-4); align-items: start;
    margin-top: var(--space-4);
  }
  /* The calendar tile: the kind's tint, its strong shade for the figures. */
  .tile {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding-block: var(--space-2); border-radius: var(--radius);
    background: var(--hue-tint); color: var(--hue);
    font-variant-numeric: tabular-nums; line-height: 1.1;
  }
  .top, .month { font-size: var(--text-xs); font-weight: var(--weight-medium); }
  .day { font-size: var(--text-2xl); font-weight: var(--weight-strong); letter-spacing: var(--tracking-heading); }
  .body { min-width: 0; }
  h3 { font-size: var(--text-lg); letter-spacing: -0.01em; line-height: var(--leading-tight); text-wrap: pretty; }
  h3 a { color: inherit; }
  .info { margin-top: var(--space-1); font-size: var(--text-sm); color: var(--fg-muted); font-variant-numeric: tabular-nums; }
  .sep { margin-inline: 0.4em; }
  .why { margin-top: var(--space-2); color: var(--fg-muted); max-width: 38rem; }
  .tags { margin-top: var(--space-2); display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-3); font-size: var(--text-sm); }
  .primary { color: var(--fg-muted); text-decoration: underline; text-decoration-color: var(--rule-strong); }
  .primary:hover { color: var(--fg); text-decoration-color: currentColor; }
  .verified { color: var(--fg-faint); }
  /* The save slot keeps its width before the button mounts, so the title never re-wraps when it appears. */
  .save { min-width: 4.5rem; display: flex; justify-content: flex-end; }
  /* Phones: Save moves under the tile, so the title gets the width. */
  @media (max-width: 30rem) {
    .card { grid-template-columns: 3.5rem minmax(0, 1fr); grid-template-rows: auto 1fr; column-gap: var(--space-3); }
    .body { grid-column: 2; grid-row: 1 / span 2; }
    .save { grid-column: 1; grid-row: 2; min-width: 0; justify-content: stretch; margin-top: var(--space-2); }
    .save :global(button) { width: 100%; min-width: 0; padding-inline: 0; }
  }
</style>
