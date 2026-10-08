<script lang="ts">
  import { onMount, tick } from "svelte";
  import { events } from "../generated/events";
  import { meta } from "../generated/meta";
  import { todayIn } from "../lib/dates";
  import { downloadText } from "../lib/download";
  import { isDated } from "../lib/events";
  import { groupResults } from "../lib/group";
  import { toIcs } from "../lib/ics";
  import { DEFAULT_FILTERS, filterPills, isDefault, parseQuery, toQuery, type Filters } from "../lib/query";
  import { saves } from "../lib/saves";
  import { slugify } from "../lib/slugs";
  import { siteConfig } from "../site.config";
  import FilterRail from "./FilterRail.svelte";
  import KindIcon from "./KindIcon.svelte";
  import ResultRow from "./ResultRow.svelte";
  import UiIcon from "./UiIcon.svelte";

  const known = { kinds: meta.kinds, regions: meta.regions };
  // Server-rendered with the build's date and default filters; the visitor's take over on mount (the hydration rule).
  let today = $state(meta.buildToday);
  let filters = $state<Filters>(DEFAULT_FILTERS);
  let saved = $state<ReadonlySet<string>>(new Set());
  // The phone layout's filter sheet. Closed in the server HTML too, so the results are on screen from first paint; wide
  // layouts show the rail whatever this says.
  let sheetOpen = $state(false);
  // Export needs the browser; the server-rendered button stays disabled until mount.
  let mounted = $state(false);
  // The bar's height, so the sticky group headings sit just under it however it wraps (search takes a line on phones).
  let barHeight = $state(0);
  let bar: HTMLElement;
  let search: HTMLInputElement;
  let pillList: HTMLElement | undefined = $state();
  let results: HTMLElement;

  onMount(() => {
    today = todayIn(meta.timeZone, new Date());
    filters = parseQuery(new URLSearchParams(location.search), known);
    const unsubscribe = saves().subscribe((ids) => { saved = ids; });
    mounted = true;
    // The explore page hides a filtered link's explorer until its own slice is on screen; show it once this render lands.
    void tick().then(() => { delete document.documentElement.dataset.slice; });
    return unsubscribe;
  });

  async function change(next: Filters) {
    filters = next;
    const q = toQuery(next);
    history.replaceState(null, "", q === "" ? location.pathname : `${location.pathname}?${q}`);
    // Scrolled past the results' top, a new slice would open mid-list; bring its first result up under the bar. The
    // bar is measured now, not through barHeight, which lags a pill that has just wrapped it onto another line.
    await tick();
    const below = results.getBoundingClientRect().top - bar.offsetHeight;
    if (below < 0) window.scrollBy({ top: below, behavior: "instant" });
  }

  // A removed pill takes its button, and keyboard focus with it; hand focus to the pill that took its place, the one
  // before it, or search when none is left.
  async function removePill(index: number, without: Filters) {
    await change(without);
    const left = pillList?.querySelectorAll("button") ?? [];
    (left[Math.min(index, left.length - 1)] ?? search).focus();
  }

  // Where a / is typed rather than taken as the shortcut: a field that takes text. A checkbox or a select does not.
  const TEXT_ENTRY = "textarea, input:not([type=checkbox], [type=radio], [type=button], [type=submit], [type=reset], [type=range], [type=color], [type=file])";
  const isTextEntry = (target: EventTarget | null) => target instanceof HTMLElement && (target.matches(TEXT_ENTRY) || target.isContentEditable);

  // `/` jumps to search from anywhere but a text field; with Ctrl, Cmd or Alt it is someone else's.
  function focusSearch(e: KeyboardEvent) {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.defaultPrevented || isTextEntry(e.target)) return;
    e.preventDefault();
    search.focus();
  }

  // Esc clears a search, then leaves it. Prevented, so the field's own Esc clear does not run alongside; an Esc that
  // cancels an input method's composition is left to it.
  function escapeSearch(e: KeyboardEvent) {
    if (e.key !== "Escape" || e.isComposing) return;
    e.preventDefault();
    if (filters.q === "") search.blur();
    else void change({ ...filters, q: "" });
  }

  let groups = $derived(groupResults(events, filters, today, saved));
  let count = $derived(groups.reduce((n, g) => n + g.events.length, 0));
  let countText = $derived(`${count} ${count === 1 ? "event" : "events"}`);
  // The count on screen follows every keystroke; the live region waits until input settles, so a screen reader hears
  // one count per search, not one per letter. Every change restarts the wait, even one that leaves the count alone.
  const SETTLE_MS = 500;
  let announced = $state(countText);
  $effect(() => {
    void filters;
    const text = countText;
    const settle = setTimeout(() => { announced = text; }, SETTLE_MS);
    return () => clearTimeout(settle);
  });
  let pills = $derived(filterPills(filters));
  let exportable = $derived(groups.flatMap((g) => g.events).filter(isDated));

  function exportView() {
    // new Date() is fine here: this is a component, not lib/ (the no-clock grep covers lib only).
    downloadText("kc-this-week.ics", toIcs(exportable, { siteName: siteConfig.name, stamp: new Date().toISOString() }), "text/calendar");
  }
</script>

<svelte:window onkeydown={focusSearch} />

<!-- The bar comes first so search is the explorer's first Tab stop, and its skip link the second; the grid puts the
     filter rail beside it on wide windows and under it on phones, outside the filter sheet. -->
<div class="explorer" style={barHeight > 0 ? `--bar-height: ${barHeight}px` : undefined}>
  <div class="bar" bind:this={bar} bind:offsetHeight={barHeight}>
    <label class="search"><span class="visually-hidden">Search</span><input type="search" bind:this={search} value={filters.q} oninput={(e) => change({ ...filters, q: e.currentTarget.value })} onkeydown={escapeSearch} aria-keyshortcuts="/" placeholder="Search title, venue, neighborhood, why" />{#if mounted}<kbd class="hint" aria-hidden="true">/</kbd>{/if}</label>
    <a class="skip" href="#results">Skip to results</a>
    <div class="slice">
      <p class="count" aria-hidden="true">{countText}</p>
      {#if pills.length > 0}
        <ul class="pills" aria-label="Active filters" bind:this={pillList}>
          <!-- Keyed by what removing the pill leaves, which differs per pill even if a kind and a region share a name. -->
          {#each pills as p, i (toQuery(p.without))}
            <li><button type="button" class={p.kind === undefined ? "pill" : `pill kind kind-${slugify(p.kind)}`} aria-label={`Remove ${p.label}`} onclick={() => removePill(i, p.without)}>{#if p.kind !== undefined}<KindIcon kind={p.kind} />{/if}{p.label}<UiIcon name="x" /></button></li>
          {/each}
        </ul>
      {/if}
    </div>
    <p role="status" class="visually-hidden">{announced}</p>
    <button type="button" class="export" disabled={!mounted || exportable.length === 0} onclick={exportView}>Export this view</button>
    {#if !isDefault(filters)}<button type="button" class="clear" onclick={() => change(DEFAULT_FILTERS)}>Clear filters</button>{/if}
  </div>

  <aside class="rail" aria-label="Filters">
    <button type="button" class="sheet-toggle" aria-expanded={sheetOpen} aria-controls="filter-sheet" onclick={() => { sheetOpen = !sheetOpen; }}>Filters{#if pills.length > 0}{` (${pills.length})`}{/if}</button>
    <div class="sheet" class:open={sheetOpen} id="filter-sheet">
      <FilterRail {filters} onchange={change} kinds={meta.kinds} regions={meta.regions} />
    </div>
  </aside>

  <!-- Focusable only through the skip link. -->
  <section class="results" id="results" bind:this={results} tabindex="-1" aria-label="Events">
    {#if count === 0}
      {#if pills.length > 0}
        <p class="empty">No events match <strong>{pills.map((p) => p.label).join(" · ")}</strong>. <button type="button" class="link" onclick={() => change(DEFAULT_FILTERS)}>Clear them</button> to see everything.</p>
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
        <h2 class={`section-heading group${filters.sort === "venue" ? " venue" : ""}`}>{g.heading}</h2>
        {@render rows(g.events)}
      {/if}
    {/each}
  </section>
</div>

<style>
  /* A narrow rail, so result rows keep room for their titles. The bar sits over the results, the rail beside both.
     The results' row takes any height the rail has over the two, so a short slice does not open a gap under the bar. */
  .explorer {
    display: grid; grid-template-columns: 12rem minmax(0, 1fr); grid-template-rows: auto 1fr; grid-template-areas: "rail bar" "rail results";
    gap: 0 var(--space-6); align-items: start;
  }
  .rail { grid-area: rail; }
  .results { grid-area: results; scroll-margin-top: var(--bar-height, var(--tap)); }
  /* The results take focus only from the skip link; the next Tab lands on the first row, which shows the ring. */
  .results:focus { outline: none; }
  /* Sticky beside the results, scrolling on its own when it is taller than the window (a 768 px laptop). */
  .rail { position: sticky; top: var(--space-4); max-height: calc(100dvh - 2 * var(--space-4)); overflow-y: auto; padding: var(--space-1); margin: calc(-1 * var(--space-1)); }
  /* (The padding keeps focus rings on the rail's edge from being clipped by the scroll box.) */
  .sheet-toggle { display: none; }
  /* Sticky within the whole explorer, not just its grid row, so it stays over the results as they scroll. */
  .bar { grid-area: bar; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); position: sticky; top: 0; background: var(--bg); padding: var(--space-2) 0; z-index: var(--z-bar); }
  .search { position: relative; flex: 1 1 14rem; max-width: 24rem; }
  /* The raised surface, as in the rail: Chromium's dark field is #3b3b3b, where its placeholder grey is about 2.4:1. */
  .search input { width: 100%; font-size: var(--text-sm); padding: var(--space-1) 1.75rem var(--space-1) var(--space-2); background: var(--bg-raised); color: var(--fg); border: 1px solid var(--fg-faint); border-radius: 4px; }
  .search input::placeholder { color: var(--fg-faint); opacity: 1; }
  /* The / shortcut, at the field's end (in the padding it keeps clear) while it is empty and unfocused; not where
     there is no keyboard to press it. */
  .hint { position: absolute; right: var(--space-2); top: 50%; transform: translateY(-50%); pointer-events: none; font-size: var(--text-xs); color: var(--fg-muted); }
  .search input:focus + .hint, .search input:not(:placeholder-shown) + .hint { display: none; }
  @media (hover: none) { .hint { display: none; } }
  /* Off screen until focused, then just under the search field. */
  .skip {
    position: absolute; left: 0; top: 100%; z-index: var(--z-skip); transform: translateY(-200vh);
    background: var(--bg-raised); color: var(--fg); border: 1px solid var(--rule); border-radius: var(--radius);
    padding: var(--space-2) var(--space-3); font-size: var(--text-sm);
  }
  .skip:focus { transform: none; }
  /* The slice in view: the count, then a pill per filter, which removes it. Kind pills wear their kind as the rail does. */
  .slice { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-2); margin-right: auto; }
  .count { margin: 0; color: var(--fg-muted); font-size: var(--text-sm); }
  .pills { display: flex; flex-wrap: wrap; gap: var(--space-1); list-style: none; margin: 0; padding: 0; }
  .pill {
    display: inline-flex; align-items: center; gap: 0.3em; min-height: 1.75rem; font: inherit; font-size: var(--text-xs);
    color: var(--fg); background: var(--bg-raised); border: 1px solid var(--rule); border-radius: 999px;
    padding: 0 var(--space-2); cursor: pointer;
  }
  .pill:hover { border-color: var(--rule-strong); }
  .pill.kind { color: var(--hue); background: var(--hue-tint); border-color: var(--hue); font-weight: var(--weight-medium); }
  .pill :global(.ui-icon) { width: 0.95em; height: 0.95em; margin-right: -0.15em; }
  .clear, .link { font: inherit; font-size: var(--text-sm); color: var(--accent); background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; }
  .export { font: inherit; font-size: var(--text-xs); color: var(--accent); background: none; border: 1px solid var(--rule); border-radius: var(--radius); padding: var(--space-1) var(--space-2); cursor: pointer; }
  .export[disabled] { opacity: 0.5; cursor: default; }
  .empty { color: var(--fg-muted); }
  /* A collapsed group (On now with no when-filter): one raised line, a full tap target, with a chevron that turns
     when it opens. Open, its line sticks under the bar like a day heading, so it can be closed from anywhere. */
  .collapsed { margin-top: var(--space-2); }
  /* A hundred-odd venues, half of them with a single event: their headings sit closer than the days'. */
  .results :global(.section-heading.venue) { margin-top: var(--space-3); }
  .collapsed summary {
    display: flex; align-items: center; gap: var(--space-2); min-height: var(--tap); padding: 0 var(--space-3);
    background: var(--bg-raised); border: 1px solid var(--rule); border-radius: var(--radius);
    color: var(--fg-muted); font-size: var(--text-sm); cursor: pointer; list-style: none;
  }
  .collapsed summary::-webkit-details-marker { display: none; }
  /* A chevron that turns when its disclosure opens: On now's line, and the phone's Filters button. */
  .collapsed summary::before, .sheet-toggle::before {
    content: ""; width: 0.4em; height: 0.4em; margin-right: var(--space-1);
    border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor;
    transform: rotate(-45deg); transition: transform 150ms var(--ease-out);
  }
  .collapsed summary:hover { border-color: var(--rule-strong); }
  .collapsed .heading { display: inline; font-size: inherit; font-weight: var(--weight-medium); color: var(--fg); margin: 0; }
  .collapsed[open] summary::before, .sheet-toggle[aria-expanded="true"]::before { transform: rotate(45deg); }
  .collapsed[open] summary { position: sticky; top: var(--bar-height, var(--tap)); z-index: var(--z-sticky); margin-bottom: var(--space-1); }
  @media (max-width: 800px) {
    .explorer { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; grid-template-areas: "bar" "rail" "results"; gap: var(--space-2); }
    .search { flex-basis: 100%; max-width: none; }
    .search input { min-height: var(--tap); font-size: var(--text-md); }
    .rail { position: static; max-height: none; overflow: visible; padding: 0; margin: 0; }
    /* Closed by default in CSS and in the server HTML alike, so nothing moves when the page hydrates. */
    .sheet:not(.open) { display: none; }
    .sheet-toggle {
      display: flex; align-items: center; gap: var(--space-2); min-height: var(--tap); padding: 0; font: inherit;
      font-weight: var(--weight-medium); color: var(--fg); background: none; border: 0; cursor: pointer;
    }
    .sheet-toggle::before { margin-left: var(--space-1); }
    .sheet.open { margin-bottom: var(--space-4); }
  }
</style>
