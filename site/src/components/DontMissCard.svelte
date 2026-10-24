<script lang="ts">
  import { meta } from "../generated/meta";
  import { formatShort, localDate } from "../lib/dates";
  import { admissionLine, daysSaid, hostOf, detailsUrl, lastDay, neighborhoodShown, venueLine } from "../lib/events";
  import { kindPath } from "../lib/landing";
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
  let admission = $derived(admissionLine(event));
</script>

<!-- The kind's colour fills the date tile and the chip; everything else on the card is ink. The id is the week
     strip's jump target. -->
<article class={`card kind-${slugify(event.kind)}`} id={`pick-${event.id}`}>
  <DateTile {tile} id={event.id} />
  <div class="body">
    <h3 style={`view-transition-name: title-${event.id}`}><a href={`/e/${event.id}`}>{event.title}</a></h3>
    <p class="info">
      <span class="visually-hidden">{tile.label}.</span>
      {#if tile.detail}<span class="fact" aria-hidden="true"><UiIcon name="clock" />{tile.detail}</span>{/if}
      <span class="fact"><UiIcon name="map-pin" />{[venueLine(event), neighborhoodShown(event)].filter(Boolean).join(", ")}</span>
      {#if admission}<span class="fact"><UiIcon name="ticket" /><span class="admission">{admission}</span></span>{/if}
    </p>
    {#if event.whyLine}<p class="why">{event.whyLine}</p>{/if}
    <p class="tags">
      <!-- The link it looks like, to the kind's page (#181). -->
      <KindChip kind={event.kind} href={kindPath(event.kind)} />
      <a class="fact primary" href={detailsUrl(event)}><UiIcon name="link" />{hostOf(detailsUrl(event))}</a>
      {#if checked < runDay}<span class="fact verified"><UiIcon name="check" />Verified {formatShort(checked)}</span>{/if}
    </p>
  </div>
  <!-- Save, then Add to calendar: the event page's controls, worded the same at every width (#181). -->
  <div class="actions">
    <SaveButton id={event.id} title={event.title} last={lastDay(event)} when={daysSaid(event)} />
    <!-- A plain link to the event's .ics file: it works with or without JavaScript. -->
    <a class="control" href={`/e/${event.id}.ics`} download aria-label={`Add to calendar: ${event.title}`}><UiIcon name="calendar-plus" />Add to calendar</a>
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
  /* The why line is the pick's reason, so it is in ink, as on an explorer row and the event page (#184). */
  .why { margin-top: var(--space-2); max-width: 38rem; }
  .tags { margin-top: var(--space-2); display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-4); font-size: var(--text-sm); }
  /* Like the always-there host links: plain until hovered (base.css underlines links in a <p>). */
  .primary { color: var(--fg-muted); text-decoration: none; }
  .primary:hover { color: var(--fg); text-decoration: underline; }
  .verified { color: var(--fg-faint); }
  /* Save over Add to calendar, in a column beside the words, both the column's width. The column keeps Save's room
     and stacks from its foot, so Add to calendar stays put when Save mounts above it. */
  .actions { display: flex; flex-direction: column; justify-content: flex-end; gap: var(--space-2); min-height: calc(2 * var(--tap) + var(--space-2)); }
  /* On a card the controls are quiet: no box until hovered, in the muted ink, so the title and the why line carry the
     card and five cards are not ten buttons. The tap target stays 44 px; a saved Save still fills with the accent. */
  .actions :global(.control:not([aria-pressed="true"])) { background: none; border-color: transparent; color: var(--fg-muted); }
  /* Without a box, a centred word floats: each starts at the column's edge, so the two icons line up. */
  .actions :global(.control) { justify-content: flex-start; }
  .actions :global(.control:not([aria-pressed="true"]):hover) { color: var(--fg); background: var(--hue-tint); }
  /* Phones: the title gets the width beside the tile, and Save and Add to calendar sit in a row under the words, the
     first one's icon lined up with the words' left edge. */
  @media (max-width: 30rem) {
    .card { grid-template-columns: 3.5rem minmax(0, 1fr); column-gap: var(--space-3); }
    .actions { grid-column: 2; flex-direction: row; flex-wrap: wrap; justify-content: flex-start; gap: 0; min-height: var(--tap); margin: var(--space-1) 0 0 calc(-1 * var(--space-3)); }
  }
</style>
