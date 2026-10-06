<script lang="ts">
  import { onMount } from "svelte";
  import { events } from "../generated/events";
  import { meta } from "../generated/meta";
  import { todayIn } from "../lib/dates";
  import { downloadText } from "../lib/download";
  import { isDated } from "../lib/events";
  import { groupResults } from "../lib/group";
  import { toIcs } from "../lib/ics";
  import { DEFAULT_FILTERS, describeFilters, isDefault, parseQuery, toQuery, type Filters } from "../lib/query";
  import { saves } from "../lib/saves";
  import { siteConfig } from "../site.config";
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
  // Export needs the browser; the server-rendered button stays disabled until mount.
  let mounted = $state(false);
  // The result bar's height, so the sticky day headings sit just under it even when "Clear filters" wraps it.
  let barHeight = $state(0);

  onMount(() => {
    today = todayIn(meta.timeZone, new Date());
    filters = parseQuery(new URLSearchParams(location.search), known);
    // The summary that reopens the sheet exists only in the phone layout, so the sheet follows the layout: closed when
    // a window becomes phone-sized, open again when it widens (a rotated tablet, a resized window).
    const phone = typeof matchMedia === "function" ? matchMedia("(max-width: 800px)") : undefined;
    const follow = (e: { matches: boolean }) => { sheetOpen = !e.matches; };
    if (phone?.matches) sheetOpen = false;
    phone?.addEventListener("change", follow);
    const unsubscribe = saves().subscribe((ids) => { saved = ids; });
    mounted = true;
    return () => { unsubscribe(); phone?.removeEventListener("change", follow); };
  });

  function change(next: Filters) {
    filters = next;
    const q = toQuery(next);
    history.replaceState(null, "", q === "" ? location.pathname : `${location.pathname}?${q}`);
  }

  let groups = $derived(groupResults(events, filters, today, saved));
  let count = $derived(groups.reduce((n, g) => n + g.events.length, 0));
  let active = $derived(describeFilters(filters));
  let exportable = $derived(groups.flatMap((g) => g.events).filter(isDated));

  function exportView() {
    // new Date() is fine here: this is a component, not lib/ (the no-clock grep covers lib only).
    downloadText("kc-events.ics", toIcs(exportable, { siteName: siteConfig.name, stamp: new Date().toISOString() }), "text/calendar");
  }
</script>

<div class="explorer">
  <aside class="rail" aria-label="Filters">
    <details class="sheet" bind:open={sheetOpen}>
      <summary>Filters{#if active.length > 0}{` (${active.length})`}{/if}</summary>
      <FilterRail {filters} onchange={change} kinds={meta.kinds} regions={meta.regions} />
    </details>
  </aside>

  <section class="results" aria-label="Events" style={barHeight > 0 ? `--bar-height: ${barHeight}px` : undefined}>
    <div class="bar" bind:offsetHeight={barHeight}>
      <p role="status" aria-live="polite" class="count">{count} {count === 1 ? "event" : "events"}</p>
      <button type="button" class="export" disabled={!mounted || exportable.length === 0} onclick={exportView}>Export this view</button>
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
      {#if g.collapsed}
        <!-- A native disclosure, so it opens without JS and announces its state; closed, it is one line. -->
        <details class="collapsed">
          <summary><span class="heading">{g.heading}</span> · {g.events.length} {g.events.length === 1 ? "event" : "events"}</summary>
          {#each g.events as event (event.id)}
            <ResultRow {event} {today} withDay={filters.sort === "venue"} />
          {/each}
        </details>
      {:else}
        <h2 class="section-heading day">{g.heading}</h2>
        {#each g.events as event (event.id)}
          <ResultRow {event} {today} withDay={filters.sort === "venue"} />
        {/each}
      {/if}
    {/each}
  </section>
</div>

<style>
  /* A narrow rail, so result rows keep room for their titles. */
  .explorer { display: grid; grid-template-columns: 12rem minmax(0, 1fr); gap: var(--space-6); align-items: start; }
  /* Sticky beside the results, scrolling on its own when it is taller than the window (a 768 px laptop). */
  .rail { position: sticky; top: var(--space-4); max-height: calc(100dvh - 2 * var(--space-4)); overflow-y: auto; padding: var(--space-1); margin: calc(-1 * var(--space-1)); }
  /* (The padding keeps focus rings on the rail's edge from being clipped by the scroll box.) */
  .sheet summary { display: none; }
  .bar { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); position: sticky; top: 0; background: var(--bg); padding: var(--space-2) 0; z-index: var(--z-bar); }
  .count { margin: 0 auto 0 0; color: var(--fg-muted); font-size: var(--text-sm); }
  .clear, .link { font: inherit; font-size: var(--text-sm); color: var(--accent); background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; }
  .export { font: inherit; font-size: var(--text-xs); color: var(--accent); background: none; border: 1px solid var(--rule); border-radius: var(--radius); padding: var(--space-1) var(--space-2); cursor: pointer; }
  .export[disabled] { opacity: 0.5; cursor: default; }
  .empty { color: var(--fg-muted); }
  /* A collapsed group (On now with no when-filter): one raised line, a full tap target, with a chevron that turns
     when it opens. Open, its line sticks under the result bar like a day heading, so it can be closed from anywhere. */
  .collapsed { margin-top: var(--space-2); }
  .collapsed summary {
    display: flex; align-items: center; gap: var(--space-2); min-height: var(--tap); padding: 0 var(--space-3);
    background: var(--bg-raised); border: 1px solid var(--rule); border-radius: var(--radius);
    color: var(--fg-muted); font-size: var(--text-sm); cursor: pointer; list-style: none;
  }
  .collapsed summary::-webkit-details-marker { display: none; }
  .collapsed summary::before {
    content: ""; width: 0.4em; height: 0.4em; margin-right: var(--space-1);
    border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor;
    transform: rotate(-45deg); transition: transform 150ms var(--ease-out);
  }
  .collapsed summary:hover { border-color: var(--rule-strong); }
  .collapsed .heading { color: var(--fg); font-weight: var(--weight-medium); }
  .collapsed[open] summary::before { transform: rotate(45deg); }
  .collapsed[open] summary { position: sticky; top: var(--bar-height, var(--tap)); z-index: var(--z-sticky); margin-bottom: var(--space-1); }
  @media (max-width: 800px) {
    .explorer { grid-template-columns: 1fr; gap: var(--space-4); }
    .rail { position: static; max-height: none; overflow: visible; padding: 0; margin: 0; }
    .sheet summary { display: list-item; cursor: pointer; font-weight: var(--weight-medium); }
    .sheet:not([open]) summary { margin-bottom: var(--space-2); }
  }
</style>
