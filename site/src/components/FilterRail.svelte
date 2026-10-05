<script lang="ts">
  import { WHEN_LABELS, WHEN_PRESETS, type Filters } from "../lib/query";

  let { filters, onchange, kinds, regions }: { filters: Filters; onchange: (f: Filters) => void; kinds: string[]; regions: string[] } = $props();

  // The range inputs follow the filter in force, so a shared ?when=a..b link fills them; between changes they
  // hold a half-entered range locally until both ends are set.
  let range = $state({ from: "", to: "" });
  $effect(() => {
    const when = filters.when;
    range = "from" in when ? { from: when.from, to: when.to } : { from: "", to: "" };
  });

  const toggleIn = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  function applyRange() {
    const { from, to } = range;
    if (from && to) onchange({ ...filters, when: from <= to ? { from, to } : { from: to, to: from } });
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
        <button type="button" aria-pressed={filters.kinds.includes(k)} onclick={() => onchange({ ...filters, kinds: toggleIn(filters.kinds, k) })}>{k}</button>
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
  .range { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); } .range label { display: flex; flex-direction: column; font-size: var(--text-xs); }
  input, select { font: inherit; }
  /* Chromium's dark-scheme select is grey (#6b6b6b), under 4.5:1 with --fg; the raised surface clears AA in both schemes. */
  select { background: var(--bg-raised); color: var(--fg); border: 1px solid var(--fg-faint); border-radius: 4px; }
  .search input { width: 100%; padding: var(--space-1) var(--space-2); }
</style>
