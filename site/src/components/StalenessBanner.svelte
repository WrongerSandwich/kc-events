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
    <!-- A warning sign and a lead in words, so it does not read as one more grey panel (#184). The sprite's symbol is
         drawn here rather than through UiIcon, which as this island's import split a chunk onto every page. -->
    <p class="wide"><svg class="mark" aria-hidden="true" focusable="false"><use href="#ui-icon-alert" /></svg> <strong>Out of date.</strong> This list was last researched on {formatShort(runDay)} and may have missed changes since. Check the event's own page before you go.</p>
  </div>
{/if}

<style>
  .banner { background: var(--bg-raised); border-block: 1px solid var(--rule); padding-block: var(--space-2); font-size: var(--text-sm); color: var(--fg); }
  /* The don't-miss tag's red, the site's one alarm colour, on the sign alone; the words stay ink. */
  .mark { display: inline-block; width: 1.1em; height: 1.1em; vertical-align: -0.18em; color: var(--flag-red); }
  strong { font-weight: var(--weight-strong); }
</style>
