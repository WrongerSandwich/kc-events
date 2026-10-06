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
  let countText = $derived(`${count} ${count === 1 ? "event" : "events"}`);
  // The count on screen follows every keystroke; the live region waits until input settles, so a screen reader hears
  // one count per search, not one per letter. Every change restarts the wait, even one that leaves the count alone.
  let announced = $state(countText);
  $effect(() => {
    void filters;
    const text = countText;
    const settle = setTimeout(() => { announced = text; }, 500);
    return () => clearTimeout(settle);
  });
  let active = $derived(describeFilters(filters));
  let exportable = $derived(groups.flatMap((g) => g.events).filter(isDated));

  function exportView() {
    // new Date() is fine here: this is a component, not lib/ (the no-clock grep covers lib only).
    downloadText("kc-events.ics", toIcs(exportable, { siteName: siteConfig.name, stamp: new Date().toISOString() }), "text/calendar");
  }
</script>

<!-- The bar comes first so search is the explorer's first Tab stop, and its skip link the second; the grid puts the
     filter rail beside it on wide windows and under it on phones, outside the filter sheet. -->
<div class="explorer" style={barHeight > 0 ? `--bar-height: ${barHeight}px` : undefined}>
  <div class="bar" bind:offsetHeight={barHeight}>
    <label class="search"><span class="visually-hidden">Search</span><input type="search" value={filters.q} oninput={(e) => change({ ...filters, q: e.currentTarget.value })} placeholder="Search titles, venues, neighborhoods" /></label>
    <a class="skip" href="#results">Skip to results</a>
    <p class="count" aria-hidden="true">{countText}</p>
    <p role="status" class="visually-hidden">{announced}</p>
    <button type="button" class="export" disabled={!mounted || exportable.length === 0} onclick={exportView}>Export this view</button>
    {#if !isDefault(filters)}<button type="button" class="clear" onclick={() => change(DEFAULT_FILTERS)}>Clear filters</button>{/if}
  </div>

  <aside class="rail" aria-label="Filters">
    <details class="sheet" bind:open={sheetOpen}>
      <summary>Filters{#if active.length > 0}{` (${active.length})`}{/if}</summary>
      <FilterRail {filters} onchange={change} kinds={meta.kinds} regions={meta.regions} />
    </details>
  </aside>

  <!-- Focusable only through the skip link. -->
  <section class="results" id="results" tabindex="-1" aria-label="Events">
    {#if count === 0}
      {#if active.length > 0}
        <p class="empty">No events match <strong>{active.join(" · ")}</strong>. <button type="button" class="link" onclick={() => change(DEFAULT_FILTERS)}>Clear them</button> to see everything.</p>
      {:else}
        <p class="empty">No events to show right now.</p>
      {/if}
    {/if}
    {#snippet rows(events: typeof groups[number]["events"])}
      {#each events as event (event.id)}
        <ResultRow {event} {today} withDay={filters.sort === "venue"} />
      {/each}
    {/snippet}
    {#each groups as g (g.key)}
      {#if g.collapsed}
        <!-- A native disclosure, so it opens without JS and announces its state; closed, it is one line. -->
        <details class="collapsed">
          <summary><h2 class="heading">{g.heading}</h2> · {g.events.length} {g.events.length === 1 ? "event" : "events"}</summary>
          {@render rows(g.events)}
        </details>
      {:else}
        <h2 class="section-heading day">{g.heading}</h2>
        {@render rows(g.events)}
      {/if}
    {/each}
  </section>
</div>

<style>
  /* A narrow rail, so result rows keep room for their titles. The bar sits over the results, the rail beside both. */
  .explorer {
    display: grid; grid-template-columns: 12rem minmax(0, 1fr); grid-template-areas: "rail bar" "rail results";
    gap: 0 var(--space-6); align-items: start;
  }
  .rail { grid-area: rail; }
  .results { grid-area: results; scroll-margin-top: var(--bar-height, var(--tap)); }
  /* The results take focus only from the skip link; the next Tab lands on the first row, which shows the ring. */
  .results:focus { outline: none; }
  /* Sticky beside the results, scrolling on its own when it is taller than the window (a 768 px laptop). */
  .rail { position: sticky; top: var(--space-4); max-height: calc(100dvh - 2 * var(--space-4)); overflow-y: auto; padding: var(--space-1); margin: calc(-1 * var(--space-1)); }
  /* (The padding keeps focus rings on the rail's edge from being clipped by the scroll box.) */
  .sheet summary { display: none; }
  /* Sticky within the whole explorer, not just its grid row, so it stays over the results as they scroll. */
  .bar { grid-area: bar; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); position: sticky; top: 0; background: var(--bg); padding: var(--space-2) 0; z-index: var(--z-bar); }
  .search { flex: 1 1 14rem; max-width: 24rem; }
  /* The raised surface, as in the rail: Chromium's dark field is #3b3b3b, where its placeholder grey is about 2.4:1. */
  .search input { width: 100%; font-size: var(--text-sm); padding: var(--space-1) var(--space-2); background: var(--bg-raised); color: var(--fg); border: 1px solid var(--fg-faint); border-radius: 4px; }
  .search input::placeholder { color: var(--fg-faint); opacity: 1; }
  /* Off screen until focused, then just under the search field. */
  .skip {
    position: absolute; left: 0; top: 100%; z-index: var(--z-skip); transform: translateY(-200vh);
    background: var(--bg-raised); color: var(--fg); border: 1px solid var(--rule); border-radius: var(--radius);
    padding: var(--space-2) var(--space-3); font-size: var(--text-sm);
  }
  .skip:focus { transform: none; }
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
  .collapsed .heading { display: inline; font-size: inherit; font-weight: var(--weight-medium); color: var(--fg); margin: 0; }
  .collapsed[open] summary::before { transform: rotate(45deg); }
  .collapsed[open] summary { position: sticky; top: var(--bar-height, var(--tap)); z-index: var(--z-sticky); margin-bottom: var(--space-1); }
  @media (max-width: 800px) {
    .explorer { grid-template-columns: minmax(0, 1fr); grid-template-areas: "bar" "rail" "results"; gap: var(--space-2); }
    .search { flex-basis: 100%; max-width: none; }
    .search input { min-height: var(--tap); font-size: var(--text-md); }
    .rail { position: static; max-height: none; overflow: visible; padding: 0; margin: 0; }
    .sheet summary { display: list-item; cursor: pointer; font-weight: var(--weight-medium); }
    .sheet:not([open]) summary { margin-bottom: var(--space-2); }
  }
</style>
