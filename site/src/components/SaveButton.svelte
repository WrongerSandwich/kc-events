<script lang="ts">
  import { onMount } from "svelte";
  import { saves } from "../lib/saves";

  let { id, title }: { id: string; title: string } = $props();
  // Server-rendered unsaved; the store is read on mount so SSR never touches storage.
  let saved = $state(false);
  onMount(() => saves().subscribe((ids) => { saved = ids.has(id); }));
</script>

<button type="button" class="save" aria-pressed={saved} aria-label={saved ? `Saved: ${title}` : `Save ${title}`} onclick={() => saves().toggle(id)}>
  {saved ? "Saved" : "Save"}
</button>

<style>
  .save { font: inherit; font-size: var(--text-xs); color: var(--fg-muted); background: none; border: 1px solid var(--rule); border-radius: var(--radius); padding: var(--space-1) var(--space-2); cursor: pointer; }
  .save:hover { color: var(--fg); border-color: var(--fg-faint); }
  .save[aria-pressed="true"] { color: var(--accent); border-color: var(--accent); }
</style>
