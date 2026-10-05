<script lang="ts">
  import { formatShort, localDate } from "../lib/dates";
  import { hostOf } from "../lib/events";
  import { rowDateLine } from "../lib/group";
  import { slugify } from "../lib/slugs";
  import type { PublishedEvent } from "../lib/types";
  import SaveButton from "./SaveButton.svelte";

  let { event, today }: { event: PublishedEvent; today: string } = $props();
</script>

<article class="row" class:flagged={event.dontMiss} style={`--hue: var(--kind-${slugify(event.kind)})`}>
  <span class="when">{rowDateLine(event, today)}</span>
  <div class="title">
    <h3><a href={`/e/${event.id}`}>{event.title}</a></h3>{#if event.dontMiss}<span class="mark" role="img" aria-label="Don't miss">●</span>{/if}
  </div>
  <span class="where">{event.venue} · {event.neighborhood}</span>
  <span class="chip">{event.kind}</span>
  <a class="host" href={event.primaryUrl} rel="noopener">{hostOf(event.primaryUrl)}</a>
  <span class="verified">verified {formatShort(localDate(event.lastVerified))}</span>
  <SaveButton id={event.id} title={event.title} />
  {#if event.whyLine}<p class="why">{event.whyLine}</p>{/if}
</article>

<style>
  /* Phones and tablets: the row wraps; the date line on top, the why-line at the bottom. */
  .row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--space-2); padding: var(--space-1) 0; border-bottom: 1px solid var(--rule); font-size: var(--text-sm); line-height: var(--leading-tight); }
  .when { flex-basis: 100%; color: var(--fg-muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
  .title { flex: 1 1 12rem; min-width: 0; }
  .title h3 { display: inline; font-size: var(--text-md); font-weight: 500; margin: 0; }
  .title a { color: inherit; text-decoration: none; }
  .title a:hover { text-decoration: underline; }
  .mark { color: var(--accent); margin-left: var(--space-1); font-size: var(--text-xs); }
  .where, .host, .verified { font-size: var(--text-xs); color: var(--fg-faint); }
  .why { flex-basis: 100%; margin: 0; font-size: var(--text-sm); color: var(--fg); }
  .flagged { border-left: 3px solid var(--accent); padding-left: var(--space-2); }
  /* The save button is slimmer in a row than on a card; button.save outranks SaveButton's own .save rule. */
  .row :global(button.save) { padding-block: 0; }

  /* Wide screens: an unflagged row is a single line, 25 px tall (20 px title + 4 px padding + 1 px rule). */
  @media (min-width: 1024px) {
    .row { display: grid; grid-template-columns: 6.5rem minmax(0, 2fr) minmax(0, 1.4fr) auto auto auto auto; align-items: center; gap: 0 var(--space-3); padding: 2px 0; }
    .when { font-size: var(--text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .title, .where { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    /* base.css gives headings text-wrap: balance, which resets the inherited nowrap on the h3 itself. */
    .title h3 { white-space: nowrap; }
    .why { grid-column: 2 / -1; padding-bottom: 2px; }
  }
</style>
