<script lang="ts">
  import { onMount } from "svelte";
  import { saves, upcomingCount, type SavedMap } from "../lib/saves";
  import { clock, watchClock } from "./clock.svelte";

  // The count appears once mounted; the server renders the plain link. Saves that have passed are not counted.
  let saved = $state<SavedMap | undefined>(undefined);
  onMount(() => {
    const unwatch = watchClock();
    const unsubscribe = saves().subscribe((s) => { saved = s; });
    return () => { unwatch(); unsubscribe(); };
  });
  let count = $derived(saved === undefined ? undefined : upcomingCount(saved, clock.today));
</script>

<!-- The badge is inline-block, which browsers pad with a space when they compute the name, so the name is set. -->
<a href="/explore?saved=1" aria-label={count ? `Saved, ${count}` : undefined}>Saved{#if count}<span class="count"> {count}</span>{/if}</a>

<style>
  .count { display: inline-block; min-width: 1.25rem; margin-left: 0.35em; padding: 0 0.35em; border-radius: 999px; background: var(--accent); color: var(--accent-fg); font-size: var(--text-xs); font-weight: var(--weight-strong); text-align: center; font-variant-numeric: tabular-nums; }
</style>
