<script lang="ts">
  import { formatShort, localDate } from "../lib/dates";
  import { hostOf } from "../lib/events";
  import { rowDateLine } from "../lib/group";
  import { slugify } from "../lib/slugs";
  import type { PublishedEvent } from "../lib/types";
  import SaveButton from "./SaveButton.svelte";

  // withDay: the list has no day headings (the venue sort), so the date line carries the day.
  let { event, today, withDay = false }: { event: PublishedEvent; today: string; withDay?: boolean } = $props();
  let dateLine = $derived(rowDateLine(event, today, withDay));
  let verifiedOn = $derived(formatShort(localDate(event.lastVerified)));
</script>

<article class="row" class:flagged={event.dontMiss} class:always={event.recurrence === "recurring"} style={`--hue: var(--kind-${slugify(event.kind)})`}>
  <span class="when" title={dateLine}>{dateLine}</span>
  <div class="title">
    <h3><a href={`/e/${event.id}`}>{event.title}</a></h3>{#if event.dontMiss}<span class="mark" role="img" aria-label="Don't miss">●</span>{/if}
  </div>
  <span class="where">{event.venue} · {event.neighborhood}</span>
  <span class="chip" title={event.kind}>{event.kind}</span>
  <a class="host" href={event.primaryUrl} rel="noopener" title={hostOf(event.primaryUrl)}>{hostOf(event.primaryUrl)}</a>
  <span class="verified" title={`Verified ${verifiedOn}`}><span aria-hidden="true">✓ {verifiedOn}</span><span class="visually-hidden">Verified {verifiedOn}</span></span>
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

  /* 1024-1279 px: two lines, the date and the title on the first, the details under the title. */
  @media (min-width: 1024px) {
    .row {
      display: grid; align-items: center; gap: 0 var(--space-2); padding: var(--space-1) 0;
      grid-template-columns: 11.25rem minmax(0, 1fr) auto auto auto auto;
      grid-template-areas: "when title title title title title" ". where chip host verified save" ". why why why why why";
    }
    .when { grid-area: when; font-size: var(--text-sm); }
    .title { grid-area: title; }
    .where { grid-area: where; }
    .chip { grid-area: chip; max-width: 6.5rem; }
    .host { grid-area: host; max-width: 7.5rem; }
    .verified { grid-area: verified; }
    .row :global(button.save) { grid-area: save; }
    .why { grid-area: why; padding-bottom: 2px; }
    /* Every dated line fits 11.25rem on one line (the widest in today's data, "Runs through Sun Oct 25", is 174 px); an
       always-there schedule phrase may run longer, so it wraps, and those rows are exempt from the one-line rule. */
    .row:not(.always) .when { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .title, .where, .chip, .host { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    /* base.css gives headings text-wrap: balance, which resets the inherited nowrap on the h3 itself. */
    .title h3 { white-space: nowrap; }
  }

  /* 1280 px and up: an unflagged row is a single line, 25 px tall (20 px title + 4 px padding + 1 px rule). The title
     takes its natural width up to 28rem; venue and neighborhood take what is left, at least 4rem. */
  @media (min-width: 1280px) {
    .row {
      padding: 2px 0;
      grid-template-columns: 11.25rem fit-content(28rem) minmax(4rem, 1fr) auto auto auto auto;
      grid-template-areas: "when title where chip host verified save" ". why why why why why why";
    }
  }
</style>
