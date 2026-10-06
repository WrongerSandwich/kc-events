<script lang="ts">
  import { onMount } from "svelte";
  import { meta } from "../generated/meta";
  import { todayIn } from "../lib/dates";
  import SaveButton from "./SaveButton.svelte";

  let { id, title, lastDay }: { id: string; title: string; lastDay?: string } = $props();
  // Server-rendered with the build's date; the visitor's date takes over on mount.
  let today = $state(meta.buildToday);
  onMount(() => { today = todayIn(meta.timeZone, new Date()); });
  let passed = $derived(lastDay !== undefined && lastDay < today);
</script>

{#if passed}
  <p class="notice" role="status">This has already happened. The page stays up until the next weekly run; <a href="/explore">see what's coming</a>.</p>
{/if}
<SaveButton {id} {title} large />

<style>
  .notice { flex: 1 1 100%; background: var(--bg-raised); border: 1px solid var(--rule); border-radius: var(--radius); padding: var(--space-2) var(--space-3); font-size: var(--text-sm); color: var(--fg-muted); }
</style>
