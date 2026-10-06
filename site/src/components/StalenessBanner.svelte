<script lang="ts">
  import { onMount } from "svelte";
  import { meta } from "../generated/meta";
  import { addDays, formatShort, localDate, todayIn } from "../lib/dates";
  import { siteConfig } from "../site.config";

  const runDay = localDate(meta.lastSuccessfulRun);
  const staleFrom = addDays(runDay, siteConfig.staleAfterDays + 1);
  // Server-rendered with the build's date; the visitor's date takes over on mount.
  let today = $state(meta.buildToday);
  onMount(() => { today = todayIn(meta.timeZone, new Date()); });
  let stale = $derived(today >= staleFrom);
</script>

{#if stale}
  <div class="banner" role="status">
    <p class="measure">This list was last researched on {formatShort(runDay)} and may have missed changes since. Check the event's own page before you go.</p>
  </div>
{/if}

<style>
  .banner { background: var(--bg-raised); border-top: 1px solid var(--rule); padding-block: var(--space-2); font-size: var(--text-sm); color: var(--fg); }
</style>
