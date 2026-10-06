<script lang="ts">
  import { DEFAULT_FILTERS, WHEN_LABELS, WHEN_PRESETS, type Filters } from "../lib/query";
  import { slugify } from "../lib/slugs";
  import KindIcon from "./KindIcon.svelte";

  let { filters, onchange, kinds, regions }: { filters: Filters; onchange: (f: Filters) => void; kinds: string[]; regions: string[] } = $props();

  // The range inputs follow the range in force, so a shared ?when=a..b link fills them; between changes they hold a
  // half-entered range locally until both ends are set. The effect reads only the range's key, a string, so a change
  // to any other filter leaves a half-entered range alone.
  let range = $state({ from: "", to: "" });
  let rangeKey = $derived("from" in filters.when ? `${filters.when.from}..${filters.when.to}` : "");
  $effect(() => {
    const [from = "", to = ""] = rangeKey.split("..");
    range = { from, to };
  });

  const toggleIn = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  function applyRange() {
    const { from, to } = range;
    if (from && to) onchange({ ...filters, when: from <= to ? { from, to } : { from: to, to: from } });
    // Emptying one end of a range in force ends the range, so the inputs never look empty while it still filters.
    else if ("from" in filters.when) onchange({ ...filters, when: DEFAULT_FILTERS.when });
  }
</script>

<div class="rail">
  <fieldset>
    <legend>When</legend>
    <div class="segments" role="group" aria-label="When">
      {#each WHEN_PRESETS as p (p)}
        <button type="button" aria-pressed={"preset" in filters.when && filters.when.preset === p} onclick={() => onchange({ ...filters, when: { preset: p } })}>{WHEN_LABELS[p]}</button>
      {/each}
    </div>
    <div class="range">
      <label>From <input type="date" bind:value={range.from} onchange={applyRange} /></label>
      <label>To <input type="date" bind:value={range.to} onchange={applyRange} /></label>
    </div>
  </fieldset>

  <fieldset>
    <legend>Kind</legend>
    <div class="chips">
      {#each kinds as k (k)}
        <button type="button" class={`kind kind-${slugify(k)}`} aria-pressed={filters.kinds.includes(k)} onclick={() => onchange({ ...filters, kinds: toggleIn(filters.kinds, k) })}><KindIcon kind={k} />{k}</button>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>Region</legend>
    <div class="chips">
      {#each regions as r (r)}
        <button type="button" aria-pressed={filters.regions.includes(r)} onclick={() => onchange({ ...filters, regions: toggleIn(filters.regions, r) })}>{r}</button>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>Show</legend>
    <label><input type="checkbox" role="switch" checked={filters.dontMiss} onchange={() => onchange({ ...filters, dontMiss: !filters.dontMiss })} /> Don't-miss only</label>
    <label><input type="checkbox" role="switch" checked={filters.recurring} onchange={() => onchange({ ...filters, recurring: !filters.recurring })} /> Include always-there</label>
    <label><input type="checkbox" role="switch" checked={filters.saved} onchange={() => onchange({ ...filters, saved: !filters.saved })} /> Saved only</label>
  </fieldset>

  <label class="search">Search <input type="search" value={filters.q} oninput={(e) => onchange({ ...filters, q: e.currentTarget.value })} placeholder="Title, venue, neighborhood, why" /></label>

  <label class="sort">Sort <select value={filters.sort} onchange={(e) => onchange({ ...filters, sort: e.currentTarget.value === "venue" ? "venue" : "date" })}><option value="date">By date</option><option value="venue">By venue</option></select></label>
</div>

<style>
  .rail { display: flex; flex-direction: column; gap: var(--space-4); font-size: var(--text-sm); }
  fieldset { border: 0; padding: 0; margin: 0; }
  legend { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.04em; color: var(--fg-muted); margin-bottom: var(--space-1); }
  .segments, .chips { display: flex; flex-wrap: wrap; gap: var(--space-1); }
  button { font: inherit; font-size: var(--text-xs); background: none; color: var(--fg-muted); border: 1px solid var(--rule); border-radius: 999px; padding: var(--space-1) var(--space-2); cursor: pointer; }
  button[aria-pressed="true"] { color: var(--accent-fg); background: var(--accent); border-color: var(--accent); }
  /* Kind buttons carry their kind: the icon in its colour, and when on, the kind's own tint and shade. */
  .kind { display: inline-flex; align-items: center; gap: 0.3em; }
  .kind :global(.kind-icon) { color: var(--hue); }
  .kind[aria-pressed="true"] { color: var(--hue); background: var(--hue-tint); border-color: var(--hue); font-weight: var(--weight-medium); }
  .range { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); } .range label { display: flex; flex-direction: column; font-size: var(--text-xs); }
  /* The Show switches, one per line with the box beside its words. */
  fieldset > label { display: flex; align-items: center; gap: var(--space-2); }
  input, select { font: inherit; }
  /* Chromium's dark-scheme select is grey (#6b6b6b), under 4.5:1 with --fg; the raised surface clears AA in both schemes. */
  /* The inputs too: Chromium's dark field is #3b3b3b, where its placeholder grey is about 2.4:1. */
  select, input[type="date"], input[type="search"] { background: var(--bg-raised); color: var(--fg); border: 1px solid var(--fg-faint); border-radius: 4px; }
  input::placeholder { color: var(--fg-faint); opacity: 1; }
  /* Tabbing onto a date field's calendar button matches neither :focus-visible nor :focus on the field, only
     :focus-within, so the field rings whenever focus is inside it, mouse clicks included. The inner parts are in a
     closed shadow tree, so :has(:focus-visible) cannot see them; no supported way to ring only for the keyboard. */
  input[type="date"]:focus-within { outline: 2px solid var(--focus); outline-offset: 2px; }
  .search input { width: 100%; padding: var(--space-1) var(--space-2); }
</style>
