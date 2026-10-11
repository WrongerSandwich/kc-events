<script lang="ts">
  import { onMount } from "svelte";
  import SaveButton from "./SaveButton.svelte";
  import { clock, watchClock } from "./clock.svelte";

  let { id, title, lastDay }: { id: string; title: string; lastDay?: string } = $props();
  // The build's date as rendered; the visitor's, kept current, once mounted.
  onMount(watchClock);
  let passed = $derived(lastDay !== undefined && lastDay < clock.today);
</script>

{#if passed}
  <p class="notice" role="status">This has already happened. The page stays up until the next weekly run; <a href="/explore">see what's coming</a>.</p>
{/if}
<SaveButton {id} {title} last={lastDay} large />

<style>
  .notice { flex: 1 1 100%; background: var(--bg-raised); border: 1px solid var(--rule); border-radius: var(--radius); padding: var(--space-2) var(--space-3); font-size: var(--text-sm); color: var(--fg-muted); }
</style>
