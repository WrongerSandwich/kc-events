<script lang="ts">
  import { onMount } from "svelte";
  import { saves } from "../lib/saves";

  // The count appears once mounted; the server renders the plain link.
  let count = $state<number | undefined>(undefined);
  onMount(() => saves().subscribe((ids) => { count = ids.size; }));
</script>

<a href="/explore?saved=1">Saved{#if count}<span class="count"><span class="visually-hidden">,</span> {count}</span>{/if}</a>

<style>
  .count { display: inline-block; min-width: 1.25rem; margin-left: 0.35em; padding: 0 0.35em; border-radius: 999px; background: var(--accent); color: var(--accent-fg); font-size: var(--text-xs); font-weight: 600; text-align: center; font-variant-numeric: tabular-nums; }
</style>
