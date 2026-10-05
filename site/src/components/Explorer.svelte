<script lang="ts">
  import { onMount } from "svelte";
  import { events } from "../generated/events";
  import { meta } from "../generated/meta";
  import { todayIn } from "../lib/dates";
  import { groupResults } from "../lib/group";
  import { DEFAULT_FILTERS, describeFilters, isDefault, parseQuery, toQuery, type Filters } from "../lib/query";
  import { saves } from "../lib/saves";
  import FilterRail from "./FilterRail.svelte";
  import ResultRow from "./ResultRow.svelte";

  const known = { kinds: meta.kinds, regions: meta.regions };
  // Server-rendered with the build's date and default filters; the visitor's take over on mount (the hydration rule).
  let today = $state(meta.buildToday);
  let filters = $state<Filters>(DEFAULT_FILTERS);
  let saved = $state<ReadonlySet<string>>(new Set());
  // Open in the server HTML so no-JS readers see the controls; on phones it closes after hydration so the count
  // and the results are on screen on arrival.
  let sheetOpen = $state(true);

  onMount(() => {
    today = todayIn(meta.timeZone, new Date());
    filters = parseQuery(new URLSearchParams(location.search), known);
    if (typeof matchMedia === "function" && matchMedia("(max-width: 800px)").matches) sheetOpen = false;
    return saves().subscribe((ids) => { saved = ids; });
  });

  function change(next: Filters) {
    filters = next;
    const q = toQuery(next, known);
    history.replaceState(null, "", q === "" ? location.pathname : `${location.pathname}?${q}`);
  }

  let groups = $derived(groupResults(events, filters, today, saved));
  let count = $derived(groups.reduce((n, g) => n + g.events.length, 0));
  let active = $derived(describeFilters(filters));
</script>

<div class="explorer">
  <aside class="rail" aria-label="Filters">
    <details class="sheet" bind:open={sheetOpen}>
      <summary>Filters{#if active.length > 0}{` (${active.length})`}{/if}</summary>
      <FilterRail {filters} onchange={change} kinds={meta.kinds} regions={meta.regions} />
    </details>
  </aside>

  <section class="results" aria-label="Events">
    <div class="bar">
      <p role="status" aria-live="polite" class="count">{count} {count === 1 ? "event" : "events"}</p>
      {#if !isDefault(filters)}<button type="button" class="clear" onclick={() => change(DEFAULT_FILTERS)}>Clear filters</button>{/if}
    </div>

    {#if count === 0}
      {#if active.length > 0}
        <p class="empty">No events match <strong>{active.join(" · ")}</strong>. <button type="button" class="link" onclick={() => change(DEFAULT_FILTERS)}>Clear them</button> to see everything.</p>
      {:else}
        <p class="empty">No events to show right now.</p>
      {/if}
    {/if}
    {#each groups as g (g.key)}
      <h2 class="section-heading day">{g.heading}</h2>
      {#each g.events as event (event.id)}
        <ResultRow {event} {today} withDay={filters.sort === "venue"} />
      {/each}
    {/each}
  </section>
</div>

<style>
  .explorer { display: grid; grid-template-columns: 16rem 1fr; gap: var(--space-8); align-items: start; }
  /* Sticky beside the results, scrolling on its own when it is taller than the window (a 768 px laptop). */
  .rail { position: sticky; top: var(--space-4); max-height: calc(100dvh - 2 * var(--space-4)); overflow-y: auto; padding: var(--space-1); margin: calc(-1 * var(--space-1)); }
  /* (The padding keeps focus rings on the rail's edge from being clipped by the scroll box.) */
  .sheet summary { display: none; }
  .bar { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); position: sticky; top: 0; background: var(--bg); padding: var(--space-2) 0; z-index: 2; }
  .count { margin: 0; color: var(--fg-muted); font-size: var(--text-sm); }
  .clear, .link { font: inherit; font-size: var(--text-sm); color: var(--accent); background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; }
  /* The shared .section-heading, made sticky and smaller for day groups. */
  .day { font-size: var(--text-sm); margin: var(--space-6) 0 var(--space-1); position: sticky; top: 2.25rem; background: var(--bg); z-index: 1; }
  .empty { color: var(--fg-muted); }
  @media (max-width: 800px) {
    .explorer { grid-template-columns: 1fr; gap: var(--space-4); }
    .rail { position: static; max-height: none; overflow: visible; padding: 0; margin: 0; }
    .sheet summary { display: list-item; cursor: pointer; font-weight: 500; }
    .sheet:not([open]) summary { margin-bottom: var(--space-2); }
  }
</style>
