<script lang="ts">
  import { onMount } from "svelte";
  import { saves } from "../lib/saves";

  // `large` gives the button a 44 px touch target, for cards; rows keep it compact.
  let { id, title, large = false }: { id: string; title: string; large?: boolean } = $props();
  // Saving needs the browser's storage, so the button renders only once mounted: without JavaScript there is no
  // button that does nothing. The store is read on mount so the server never touches storage.
  let mounted = $state(false);
  let saved = $state(false);
  onMount(() => {
    mounted = true;
    return saves().subscribe((ids) => { saved = ids.has(id); });
  });
</script>

{#if mounted}
  <!-- The name stays "Save <title>"; aria-pressed alone says whether it is saved, so it is announced once. -->
  <button type="button" class="save" class:large aria-pressed={saved} aria-label={`Save ${title}`} onclick={() => saves().toggle(id)}>
    {#if saved}<span class="tick" aria-hidden="true">✓</span>Saved{:else}Save{/if}
  </button>
{/if}

<style>
  .save {
    font: inherit; font-size: var(--text-xs); font-weight: var(--weight-medium); color: var(--fg-muted);
    background: var(--bg-raised); border: 1px solid var(--control-border); border-radius: var(--radius);
    padding: var(--space-1) var(--space-2); cursor: pointer;
    transition: background-color 150ms var(--ease-out), color 150ms var(--ease-out), border-color 150ms var(--ease-out);
  }
  .save:hover { color: var(--fg); border-color: var(--fg-faint); }
  .save:active { transform: translateY(1px); }
  .save[aria-pressed="true"] { color: var(--accent-fg); background: var(--accent); border-color: var(--accent); }
  .large { min-height: 2.75rem; min-width: 4.5rem; padding-inline: var(--space-3); font-size: var(--text-sm); }
  .tick { margin-right: 0.3em; }
  @media (prefers-reduced-motion: reduce) {
    .save { transition: none; }
    .save:active { transform: none; }
  }
</style>
