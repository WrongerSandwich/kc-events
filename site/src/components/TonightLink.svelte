<script lang="ts">
  import { tonight } from "../generated/tonight";
  import { tonightLine } from "../lib/tonight";
  import { islandClock } from "./clock.svelte";

  // The build's day as rendered, so the line is there without script; the visitor's day and hour once mounted.
  const clock = islandClock();
  let line = $derived(tonightLine(tonight, clock.today, clock.now));
</script>

{#if line}<a class="tonight" href={line.href}>{line.text}</a>{/if}

<style>
  /* A 24 px target (WCAG 2.5.8). */
  .tonight { display: inline-flex; align-items: center; min-height: 1.5rem; font-size: var(--text-xs); color: var(--fg-muted); font-variant-numeric: tabular-nums; }
  .tonight:hover { color: var(--fg); }
</style>
