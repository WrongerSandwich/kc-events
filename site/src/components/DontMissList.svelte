<script lang="ts">
  import { onMount } from "svelte";
  // dont-miss, not events: the front page ships only the flagged events (its budget is 50 KB; the full list is about 26).
  import { dontMiss } from "../generated/dont-miss";
  import { meta } from "../generated/meta";
  import { todayIn } from "../lib/dates";
  import { bucketDontMiss, horizonHeading, HORIZONS } from "../lib/horizon";
  import DontMissCard from "./DontMissCard.svelte";

  const emptyLines = { "through-sunday": "Nothing flagged yet for this week.", "next-two-weeks": "Nothing flagged yet for the next two weeks.", "further-out": "Nothing flagged yet further out." } as const;
  // Server-rendered with the build's date; the visitor's date takes over on mount (the hydration rule).
  let today = $state(meta.buildToday);
  onMount(() => { today = todayIn(meta.timeZone, new Date()); });
  let buckets = $derived(bucketDontMiss(dontMiss, today));
  let total = $derived(HORIZONS.reduce((n, h) => n + buckets[h].length, 0));
</script>

{#if total === 0}
  <p>Nothing is flagged don't-miss right now. <a href="/explore">Browse everything</a> instead.</p>
{/if}
{#each HORIZONS as h (h)}
  {@const heading = horizonHeading(h, today)}
  <section aria-label={heading}>
    <h2 class="section-heading">{heading}</h2>
    {#if buckets[h].length === 0}
      <p class="empty">{emptyLines[h]}</p>
    {:else}
      {#each buckets[h] as event (event.id)}
        <DontMissCard {event} {today} />
      {/each}
    {/if}
  </section>
{/each}

<style>
  .empty { color: var(--fg-faint); font-size: var(--text-sm); }
</style>
