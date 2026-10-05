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

<article class="row" class:flagged={event.dontMiss} class:always={event.recurrence === "recurring"}>
  <span class="when" title={dateLine}>{dateLine}</span>
  <div class="title">
    <h3><a href={`/e/${event.id}`}>{event.title}</a></h3>{#if event.dontMiss}<span class="mark" role="img" aria-label="Don't miss">●</span>{/if}
  </div>
  <span class="where" title={`${event.venue} · ${event.neighborhood}`}><span class="venue">{event.venue}</span><span class="hood">{` · ${event.neighborhood}`}</span></span>
  <span class={`chip kind-${slugify(event.kind)}`}>{event.kind}</span>
  <a class="host" href={event.primaryUrl} rel="noopener" title={hostOf(event.primaryUrl)}>{hostOf(event.primaryUrl)}</a>
  <span class="verified"><span aria-hidden="true">✓ {verifiedOn}</span><span class="visually-hidden">Verified {verifiedOn}</span></span>
  <SaveButton id={event.id} title={event.title} />
  {#if event.whyLine}<p class="why">{event.whyLine}</p>{/if}
</article>

<style>
  /* Phones and tablets: the row wraps; the date line, the title, the details, then the why-line. */
  .row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--space-2); padding: var(--space-1) 0; border-bottom: 1px solid var(--rule); font-size: var(--text-sm); line-height: var(--leading-tight); }
  .when { flex-basis: 100%; color: var(--fg-muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
  /* The title gets its own line, so the details run under it rather than squeezing it into a narrow column. */
  .title { flex: 1 1 100%; min-width: 0; }
  .title h3 { display: inline; font-size: var(--text-md); font-weight: var(--weight-medium); margin: 0; }
  .title a { color: inherit; text-decoration: none; }
  .title a:hover { text-decoration: underline; }
  .mark { color: var(--accent); margin-left: var(--space-1); font-size: var(--text-xs); }
  .where, .host, .verified { font-size: var(--text-xs); color: var(--fg-faint); }
  .why { flex-basis: 100%; margin: 0; font-size: var(--text-sm); color: var(--fg); }
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
    /* The chip fits every kind name ("outdoors/community" is the widest); a long host gives way, its full name in the title. */
    .chip { grid-area: chip; max-width: 8.5rem; }
    .host { grid-area: host; max-width: 8rem; }
    .verified { grid-area: verified; }
    .row :global(button.save) { grid-area: save; }
    .why { grid-area: why; padding-bottom: 2px; }
    /* Every dated line fits 11.25rem on one line (the widest in today's data, "Runs through Sun Oct 25", is 174 px); an
       always-there schedule phrase may run longer, so it wraps, and those rows are exempt from the one-line rule. */
    .row:not(.always) .when { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .title, .where, .chip, .host { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    /* The venue gives way before the neighborhood, so the neighborhood stays visible on every row. */
    .where { display: flex; }
    .venue { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .hood { flex: none; white-space: pre; }
    /* base.css gives headings text-wrap: balance, which resets the inherited nowrap on the h3 itself. */
    .title h3 { white-space: nowrap; }
  }

  /* 1280 px and up: an unflagged row is a single line, 25 px tall (20 px title + 4 px padding + 1 px rule). The date is
     set small, like the other details, so the title (natural width up to 18rem) and the venue and neighborhood (at
     least 12rem, then the rest) share the room. 9.75rem holds the widest dated line at this size, about 150 px. */
  @media (min-width: 1280px) {
    .when { font-size: var(--text-xs); }
    .row {
      padding: 2px 0;
      grid-template-columns: 9.75rem fit-content(18rem) minmax(12rem, 1fr) auto auto auto auto;
      grid-template-areas: "when title where chip host verified save" ". why why why why why why";
    }
  }
  /* 1440 px and up the container is wider (base.css), so the title can take more. */
  @media (min-width: 1440px) {
    .row { grid-template-columns: 9.75rem fit-content(22rem) minmax(12rem, 1fr) auto auto auto auto; }
  }
  /* The tightest one-line width: the host gives up the most so the title and the venue keep theirs. */
  @media (min-width: 1280px) and (max-width: 1439px) {
    .host { max-width: 6rem; }
  }
</style>
