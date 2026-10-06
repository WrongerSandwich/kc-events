<script lang="ts">
  import { onMount } from "svelte";
  import { saves } from "../lib/saves";

  // The count appears once mounted; the server renders the plain link.
  let count = $state<number | undefined>(undefined);
  onMount(() => saves().subscribe((ids) => { count = ids.size; }));
</script>

<!-- The badge is inline-block, which browsers pad with a space when they compute the name, so the name is set. -->
<a href="/explore?saved=1" aria-label={count ? `Saved, ${count}` : undefined}>Saved{#if count}<span class="count"> {count}</span>{/if}</a>

<style>
  .count { display: inline-block; min-width: 1.25rem; margin-left: 0.35em; padding: 0 0.35em; border-radius: 999px; background: var(--accent); color: var(--accent-fg); font-size: var(--text-xs); font-weight: var(--weight-strong); text-align: center; font-variant-numeric: tabular-nums; }
</style>
