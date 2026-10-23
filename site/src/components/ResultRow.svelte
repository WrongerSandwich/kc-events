<script lang="ts">
  import { meta } from "../generated/meta";
  import { formatShort, localDate } from "../lib/dates";
  import { daysSaid, isPast, lastDay, venueLine } from "../lib/events";
  import { rowDateLine } from "../lib/group";
  import { kindPath } from "../lib/landing";
  import { venuePath } from "../lib/venues";
  import type { PublishedEvent } from "../lib/types";
  import KindChip from "./KindChip.svelte";
  import SaveButton from "./SaveButton.svelte";

  // withDay: the list has no day headings (the venue sort, or the saved view's passed group), so the date line carries
  // the day. hide: what every row of the page would repeat, the kind on a kind's page, the venue on a venue's (#182).
  let { event, today, withDay = false, hide }: { event: PublishedEvent; today: string; withDay?: boolean; hide?: "kind" | "venue" } = $props();
  let dateLine = $derived(rowDateLine(event, today, withDay));
  // Every event the last run reached was verified that day, which the header already says; a row speaks up only when
  // its own check is older than that, like a pick's card (#182).
  const runDay = localDate(meta.lastSuccessfulRun);
  let checked = $derived(localDate(event.lastVerified));
  let verifiedLine = $derived(`Date and venue verified ${formatShort(checked)}`);
  // Only a save is listed once it has passed (the saved view keeps it), and it says so.
  let passed = $derived(isPast(event, today));
</script>

<article class="row" class:flagged={event.dontMiss} class:always={event.recurrence === "recurring"} class:with-day={withDay} class:passed class:no-chip={hide === "kind"}>
  <!-- The don't-miss tag is in the markup twice, and CSS shows one: on the date line below 1024 px, where that line is
       its own and a wrapped title would throw a tag beside it to the row's edge, and beside the title from 1024 px,
       where the date is a narrow column (#184). The hidden one is display: none, so nothing reads it twice. -->
  <span class="when-line"><span class="when">{dateLine}</span>{#if event.dontMiss && !passed}<span class="dont-miss on-date">Don't miss</span>{/if}</span>
  <div class="title">
    <h3><a href={`/e/${event.id}`} title={event.title}>{event.title}</a></h3>{#if passed}<span class="passed-tag">Passed</span>{:else if event.dontMiss}<span class="dont-miss on-title">Don't miss</span>{/if}
  </div>
  <!-- The venue's page (#137), out of the Tab order, so a row stays two stops (title, Save); the event page links it
       too, and the source, which the row leaves to it (#182). The link's name says whose venue it is, so a list of
       links does not read "recordBar" forty times (#181). On the venue's own page only the room is left. -->
  {#if hide !== "venue"}
    <span class="where" title={`${venueLine(event)} · ${event.neighborhood}`}><a class="venue" href={venuePath(event.venue)} tabindex="-1" aria-label={`${venueLine(event)}, venue of ${event.title}`}>{venueLine(event)}</a><span class="hood">{` · ${event.neighborhood}`}</span></span>
  {:else if event.room}
    <span class="where">{event.room}</span>
  {/if}
  <!-- The chip is the link it looks like, to the kind's page, out of the Tab order like the venue (#181). -->
  {#if hide !== "kind"}<KindChip kind={event.kind} href={kindPath(event.kind)} tabindex={-1} />{/if}
  {#if checked < runDay}<span class="verified" title={verifiedLine}><span aria-hidden="true">✓ {formatShort(checked)}</span><span class="visually-hidden">{verifiedLine}</span></span>{/if}
  <SaveButton id={event.id} title={event.title} last={lastDay(event)} when={daysSaid(event)} />
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
  .when-line { grid-area: when; min-width: 0; display: flex; align-items: center; gap: var(--space-2); }
  .when { min-width: 0; color: var(--fg-muted); font-size: var(--text-xs); }
  /* The title, then a don't-miss tag that never gives way to it. */
  .title { grid-area: title; min-width: 0; display: flex; align-items: baseline; gap: var(--space-2); }
  .title h3 { min-width: 0; font-size: var(--text-md); font-weight: var(--weight-medium); margin: 0; }
  /* The link is the h3's block, so it is as tall as the title's lines; below 1024 px, where a finger taps it, the
     padding makes even a one-line title 24 px, WCAG 2.5.8's size (#182). */
  .title a { display: block; padding-block: 2px; color: inherit; text-decoration: none; }
  .title a:hover { text-decoration: underline; }
  /* The don't-miss tag is base.css's; in a row it never gives way to the title. Below 1024 px it rides the date line. */
  .title :global(.dont-miss) { flex: none; }
  .on-title { display: none; }
  @media (min-width: 1024px) {
    .on-date { display: none; }
    .title .on-title { display: inline-flex; }
  }
  /* A passed save: muted, with base.css's quiet outlined tag where a pick has its red one. */
  .passed h3, .passed .when { color: var(--fg-muted); }
  .where, .verified { font-size: var(--text-xs); color: var(--fg-faint); }
  /* The chip is KindChip's element, so the row reaches it with :global. Below 1024 px it and the venue are 24 px tall,
     so a finger's target never crowds the title's (#182). */
  .row :global(.chip) { grid-area: chip; min-height: 24px; }
  .row :global(button.save) { grid-area: save; }
  /* A sentence that wraps, so it has the page's leading, not the row's. */
  .why { grid-area: why; margin: 0; font-size: var(--text-sm); line-height: var(--leading); color: var(--fg); }
  /* Venue and neighborhood give way together, in proportion to their length; from 1024 px only the venue does. */
  .where { grid-area: where; display: flex; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  /* A 12 px line at the row's 1.25 leading is 15 px, so 4.5 px above and below make 24. */
  .venue { min-width: 0; overflow: hidden; text-overflow: ellipsis; padding-block: 4.5px; }
  /* The venue link reads as the detail it is, in the line's colour; base.css underlines it on hover. */
  a.venue { color: inherit; }
  .hood { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: pre; }
  /* A kind's page has no chip, so its venue line starts where the chip would (#182). */
  @media (max-width: 1023px) {
    .row.no-chip .where { grid-column-start: 1; }
  }
  /* Below 800 px the verified stamp leaves the row; the event page keeps it. */
  .verified { grid-area: verified; display: none; }
  @media (min-width: 800px) {
    .verified { display: revert; }
    .row {
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      grid-template-areas: "when when when save" "title title title save" "chip where verified save" "why why why why";
    }
  }

  /* 1024-1279 px: two lines, the date and the title on the first, the details under the title. */
  /* The date column holds the widest dated line on one line: "Fri–Sun, through Mon May 20", about 175 px at this size; with the
     day first (the venue sort), "Mon May 20, 10:00 am–Mon May 20", 239 px. Every row of a list has the same flag, so
     the column stays aligned. */
  @media (min-width: 1024px) {
    .row {
      --when-width: 11.25rem;
      gap: 0 var(--space-2);
      grid-template-columns: var(--when-width) minmax(0, 1fr) auto auto auto;
      grid-template-areas: "when title title title title" ". where chip verified save" ". why why why why";
    }
    .row.with-day { --when-width: 15.5rem; }
    .when { font-size: var(--text-sm); }
    /* The save button is the card's, slimmer in a row: button.save outranks base.css's .control and SaveButton's .save. */
    .row :global(button.save) { min-height: auto; min-width: auto; padding: 0 var(--space-2); font-size: var(--text-xs); }
    .row :global(.chip) { min-height: auto; }
    .venue { padding-block: 0; }
    .why { padding-bottom: 2px; }
    /* An always-there schedule phrase may run longer than any dated line, so it wraps, and those rows are exempt from
       the one-line rule. */
    .row:not(.always) .when { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .hood { flex: none; overflow: visible; }
    /* A title past two lines is cut there, its whole in the link's title (#182). The clamp is on the link, so its
       focus ring, drawn outside its box, is not clipped with the text. A wrapped title fills its first line rather
       than base.css's balance, which leaves a gap between a short line and a don't-miss tag beside it. */
    .title h3 { text-wrap: pretty; }
    .title a { padding-block: 0; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; }
  }

  /* 1280 px and up: an unflagged row with a short title is a single line, 25 px tall (20 px title + 4 px padding + 1 px
     rule), and a long title takes a second line rather than an ellipsis (#182). The date is set small, like the other
     details, so the title (natural width up to --title-max) and the venue and neighborhood (at least 12rem, then the
     rest) share the room. The widest dated lines at this size are 149 px, and 206 px with the day first. The trailing
     columns have fixed widths, so the kind chips, stamps and Save buttons each make a column down the list, whatever a
     row's title or venue: the widest chip ("outdoors/community") is 154 px, the widest stamp ("✓ Sep 30") about 50 px,
     and Save, its bookmark and "Saved", within its 80 px column. A list that ships no script (a venue, kind, region or
     changes page) has no Save, and its stylesheet sets --row-save-width to 0, so all that is left where Save would be
     is one column gap (#181); a kind's page has no chip, so its column is 0 px, likewise one gap. */
  @media (min-width: 1280px) {
    .when { font-size: var(--text-xs); }
    .row :global(.chip) { justify-self: start; }
    .row :global(button.save) { justify-self: stretch; }
    .row {
      --when-width: 9.75rem;
      --chip-width: 9.75rem; --verified-width: 3.5rem; --save-width: var(--row-save-width, 5rem);
      padding: 2px 0;
      --title-max: 21rem;
      /* Each detail sits on the title's first line when it wraps. */
      align-items: first baseline;
      grid-template-columns: var(--when-width) fit-content(var(--title-max)) minmax(12rem, 1fr) var(--chip-width) var(--verified-width) var(--save-width);
      grid-template-areas: "when title where chip verified save" ". why why why why why";
    }
    .row.no-chip { --chip-width: 0px; }
    .row.with-day { --when-width: 13.5rem; }
  }
  /* 1440 px and up the container is wider (base.css), so the title can take more. */
  @media (min-width: 1440px) {
    .row { --title-max: 26rem; }
  }
</style>
