<script lang="ts">
  import { meta } from "../generated/meta";
  import type { PublishedEvent } from "../lib/types";
  import ResultRow from "./ResultRow.svelte";

  // A list on the changes page (#135): the explorer's rows, each with its day since the list has no day headings, and a
  // moved event's line saying what its date was. Rendered at build only, as of the build's day, so the page ships no
  // script: the row's Save, which renders once mounted, is left to the event's own page. Hydrating it here would split
  // the CSS the front page and the explorer share with it into more pieces, past the front page's budget.
  let { rows }: { rows: { event: PublishedEvent; was?: string }[] } = $props();
</script>

<ul class="rows">
  {#each rows as { event, was } (event.id)}
    <li>
      <ResultRow {event} today={meta.buildToday} withDay />
      {#if was}<p class="was">{was}</p>{/if}
    </li>
  {/each}
</ul>

<style>
  /* No Save in these rows, and no column kept for it (#181). */
  .rows { list-style: none; padding: 0; margin: var(--space-2) 0 0; --row-save-width: 0px; }
  /* Under the row's own rule, in the row's muted detail type, lined up with its title where the date has a column. */
  .was { margin: 0; padding: 2px 0 var(--space-1); font-size: var(--text-xs); color: var(--fg-muted); border-bottom: 1px solid var(--rule); }
  li:has(.was) :global(.row) { border-bottom: 0; }
  @media (min-width: 1024px) {
    .was { padding-left: calc(15.5rem + var(--space-2)); }
  }
  @media (min-width: 1280px) {
    .was { padding-left: calc(13.5rem + var(--space-2)); }
  }
</style>
