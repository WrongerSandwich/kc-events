<script lang="ts">
  import SaveButton from "./SaveButton.svelte";
  import ShareButton from "./ShareButton.svelte";
  import { islandClock } from "./clock.svelte";

  // `shareText` is the event's date line and venue, what a shared link says under its title.
  let { id, title, lastDay, shareText }: { id: string; title: string; lastDay?: string; shareText: string } = $props();
  // The build's date as rendered; the visitor's, kept current, once mounted.
  const clock = islandClock();
  let passed = $derived(lastDay !== undefined && lastDay < clock.today);
</script>

{#if passed}
  <p class="notice" role="status">This has already happened. The page stays up until the next weekly run; <a href="/explore">see what's coming</a>.</p>
{/if}
<SaveButton {id} {title} last={lastDay} />
<!-- The page's own origin, so a preview deployment shares its own link. -->
<ShareButton label="Share" large data={() => ({ title, text: shareText, url: `${location.origin}/e/${id}` })} />

<style>
  .notice { flex: 1 1 100%; background: var(--bg-raised); border: 1px solid var(--rule); border-radius: var(--radius); padding: var(--space-2) var(--space-3); font-size: var(--text-sm); color: var(--fg-muted); }
</style>
