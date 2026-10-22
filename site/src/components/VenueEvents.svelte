<script lang="ts">
  import { meta } from "../generated/meta";
  import { groupResults } from "../lib/group";
  import { DEFAULT_FILTERS, EVERY_DATE } from "../lib/query";
  import type { PublishedEvent } from "../lib/types";
  import ResultRow from "./ResultRow.svelte";

  // A venue page's events (#137): the explorer's groups and rows, recurring events included and "On now" open, since
  // one venue's list is short. Rendered at build only, as of the build's day, like the changes page's lists
  // (ChangeRows.svelte), so the page ships no script and the row's Save is left to the event's own page. Styled by
  // styles/venues.css, not a style block of its own (that file says why).
  let { events }: { events: PublishedEvent[] } = $props();
  let groups = $derived(groupResults(events, { ...DEFAULT_FILTERS, when: EVERY_DATE, recurring: true }, meta.buildToday, new Set()));
</script>

{#if groups.length === 0}
  <p class="venue-none">Nothing listed at the moment.</p>
{:else}
  {#each groups as g (g.key)}
    <h2 class="section-heading group">{g.heading}</h2>
    {#each g.events as event (event.id)}
      <ResultRow {event} today={meta.buildToday} />
    {/each}
  {/each}
{/if}
