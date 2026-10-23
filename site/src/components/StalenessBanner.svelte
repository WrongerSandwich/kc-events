<script lang="ts">
  import { meta } from "../generated/meta";
  import { addDays, formatShort, localDate } from "../lib/dates";
  import { siteConfig } from "../site.config";
  import { islandClock } from "./clock.svelte";

  const runDay = localDate(meta.lastSuccessfulRun);
  const staleFrom = addDays(runDay, siteConfig.staleAfterDays + 1);
  // The build's date as rendered; the visitor's, kept current, once mounted.
  const clock = islandClock();
  let stale = $derived(clock.today >= staleFrom);
</script>

{#if stale}
  <div class="banner" role="status">
    <!-- The header's width, on every page (#181). -->
    <p class="wide">This list was last researched on {formatShort(runDay)} and may have missed changes since. Check the event's own page before you go.</p>
  </div>
{/if}

<style>
  .banner { background: var(--bg-raised); border-top: 1px solid var(--rule); padding-block: var(--space-2); font-size: var(--text-sm); color: var(--fg); }
</style>
