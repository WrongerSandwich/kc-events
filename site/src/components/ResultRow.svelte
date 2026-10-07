<script lang="ts">
  import { formatShort, localDate } from "../lib/dates";
  import { hostOf, detailsUrl } from "../lib/events";
  import { rowDateLine } from "../lib/group";
  import type { PublishedEvent } from "../lib/types";
  import KindChip from "./KindChip.svelte";
  import SaveButton from "./SaveButton.svelte";

  // withDay: the list has no day headings (the venue sort), so the date line carries the day.
  let { event, today, withDay = false }: { event: PublishedEvent; today: string; withDay?: boolean } = $props();
  let dateLine = $derived(rowDateLine(event, today, withDay));
  let verifiedOn = $derived(formatShort(localDate(event.lastVerified)));
</script>

<article class="row" class:flagged={event.dontMiss} class:always={event.recurrence === "recurring"} class:with-day={withDay}>
  <span class="when">{dateLine}</span>
  <div class="title">
    <h3><a href={`/e/${event.id}`}>{event.title}</a></h3>{#if event.dontMiss}<span class="dont-miss">Don't miss</span>{/if}
  </div>
  <span class="where" title={`${event.venue} · ${event.neighborhood}`}><span class="venue">{event.venue}</span><span class="hood">{` · ${event.neighborhood}`}</span></span>
  <KindChip kind={event.kind} />
  <!-- Out of the Tab order, so a row is two stops (title, Save); the event page links the source too. -->
  <a class="host" href={detailsUrl(event)} title={hostOf(detailsUrl(event))} tabindex="-1">{hostOf(detailsUrl(event))}</a>
  <span class="verified"><span aria-hidden="true">✓ {verifiedOn}</span><span class="visually-hidden">Verified {verifiedOn}</span></span>
  <SaveButton id={event.id} title={event.title} large />
  {#if event.whyLine}<p class="why">{event.whyLine}</p>{/if}
</article>

<style>
  /* Phones and tablets: every row has one shape. The date line, then the title, then the kind chip leading the venue
     and neighborhood, so the chip sits at the same place on every row; Save spans those lines at the row's end, at its
     44 px card size; the why-line runs full width under them. */
  .row {
    display: grid; align-items: center; gap: 2px var(--space-2); padding: var(--space-1) 0;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas: "when when save" "title title save" "chip where save" "why why why";
    border-bottom: 1px solid var(--rule); font-size: var(--text-sm); line-height: var(--leading-tight);
  }
  .when { grid-area: when; color: var(--fg-muted); font-size: var(--text-xs); }
  /* The title, then a don't-miss tag that never gives way to it. */
  .title { grid-area: title; min-width: 0; display: flex; align-items: baseline; gap: var(--space-2); }
  .title h3 { min-width: 0; font-size: var(--text-md); font-weight: var(--weight-medium); margin: 0; }
  .title a { color: inherit; text-decoration: none; }
  .title a:hover { text-decoration: underline; }
  /* The don't-miss tag is base.css's; in a row it never gives way to the title. */
  .title :global(.dont-miss) { flex: none; }
  .where, .host, .verified { font-size: var(--text-xs); color: var(--fg-faint); }
  .where { grid-area: where; }
  /* The chip is KindChip's element, so the row reaches it with :global. */
  .row :global(.chip) { grid-area: chip; }
  .host { grid-area: host; }
  .verified { grid-area: verified; }
  .row :global(button.save) { grid-area: save; }
  .why { grid-area: why; margin: 0; font-size: var(--text-sm); color: var(--fg); }
  .where, .host { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  /* Venue and neighborhood give way together, in proportion to their length; from 1024 px only the venue does. */
  .where { display: flex; }
  .venue { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .hood { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: pre; }
  /* Below 800 px the host and the verified stamp leave the row; the event page keeps both. */
  .host, .verified { display: none; }
  @media (min-width: 800px) {
    .host, .verified { display: revert; }
    /* A long host gives way, its full name in the title. */
    .host { max-width: 8rem; }
    .row {
      grid-template-columns: auto minmax(0, 1fr) auto auto auto;
      grid-template-areas: "when when when when save" "title title title title save" "chip where host verified save" "why why why why why";
    }
  }

  /* 1024-1279 px: two lines, the date and the title on the first, the details under the title. */
  /* The date column holds the widest dated line on one line: "Runs through Mon May 20", 171 px at this size; with the
     day first (the venue sort), "Mon May 20, 10:00 am–Mon May 20", 239 px. Every row of a list has the same flag, so
     the column stays aligned. */
  @media (min-width: 1024px) {
    .row {
      --when-width: 11.25rem;
      gap: 0 var(--space-2);
      grid-template-columns: var(--when-width) minmax(0, 1fr) auto auto auto auto;
      grid-template-areas: "when title title title title title" ". where chip host verified save" ". why why why why why";
    }
    .row.with-day { --when-width: 15.5rem; }
    .when { font-size: var(--text-sm); }
    /* The save button is slimmer in a row than on a card; button.save outranks SaveButton's own .save and .large rules. */
    .row :global(button.save) { min-height: auto; min-width: auto; padding: 0 var(--space-2); font-size: var(--text-xs); }
    .why { padding-bottom: 2px; }
    /* An always-there schedule phrase may run longer than any dated line, so it wraps, and those rows are exempt from
       the one-line rule. */
    .row:not(.always) .when { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .hood { flex: none; overflow: visible; }
    /* base.css gives headings text-wrap: balance, which would reset an inherited nowrap, so the h3 sets its own. */
    .title h3 { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  }

  /* 1280 px and up: an unflagged row is a single line, 25 px tall (20 px title + 4 px padding + 1 px rule). The date is
     set small, like the other details, so the title (natural width up to 18rem) and the venue and neighborhood (at
     least 12rem, then the rest) share the room. The widest dated lines at this size are 149 px, and 206 px with the day
     first. The trailing columns have fixed widths, so the kind chips, hosts, stamps and Save buttons each make a column
     down the list, whatever a row's title or venue: the widest chip ("outdoors/community") is 154 px, the widest stamp
     ("✓ Sep 30") about 50 px, and Save widens to 68 px once saved. */
  @media (min-width: 1280px) {
    .when { font-size: var(--text-xs); }
    .row :global(.chip) { justify-self: start; }
    .row :global(button.save) { justify-self: stretch; }
    .row {
      --when-width: 9.75rem;
      --chip-width: 9.75rem; --host-width: 8rem; --verified-width: 3.5rem; --save-width: 4.25rem;
      padding: 2px 0;
      --title-max: 18rem;
      grid-template-columns: var(--when-width) fit-content(var(--title-max)) minmax(12rem, 1fr) var(--chip-width) var(--host-width) var(--verified-width) var(--save-width);
      grid-template-areas: "when title where chip host verified save" ". why why why why why why";
    }
    .row.with-day { --when-width: 13.5rem; }
  }
  /* 1440 px and up the container is wider (base.css), so the title can take more. */
  @media (min-width: 1440px) {
    .row { --title-max: 22rem; }
  }
  /* The tightest one-line width: the host gives up the most so the title and the venue keep theirs. */
  @media (min-width: 1280px) and (max-width: 1439px) {
    .row { --host-width: 6rem; }
  }
</style>
