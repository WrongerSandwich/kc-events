<script lang="ts">
  import { meta } from "../generated/meta";
  import type { ResultGroup } from "../lib/group";
  import ResultRow from "./ResultRow.svelte";

  // A kind or region page's events (#138): the groups landingGroups made, rendered at build only, as of the build's day,
  // like a venue page's (VenueEvents.svelte), so the page ships no script. Styled by styles/venues.css.
  // hide: "kind" on a kind's page, whose rows would all carry its chip (#182).
  let { groups, hide }: { groups: ResultGroup[]; hide?: "kind" } = $props();
</script>

{#if groups.length === 0}
  <p class="venue-none">Nothing listed right now.</p>
{:else}
  {#each groups as g (g.key)}
    <h2 class="section-heading group">{g.heading}</h2>
    {#each g.events as event (event.id)}
      <ResultRow {event} today={meta.buildToday} {hide} />
    {/each}
  {/each}
{/if}
