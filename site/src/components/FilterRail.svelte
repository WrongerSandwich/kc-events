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
  // The fields wait behind "Custom dates…" so the presets lead; a range in force opens it, so a shared ?when=a..b link
  // shows its dates. Closed, a native disclosure keeps the fields out of the Tab order.
  let custom = $state(false);
  $effect(() => {
    if (rangeKey !== "") custom = true;
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
    <details class="custom" bind:open={custom}>
      <summary>Custom dates…</summary>
      <div class="range">
        <label>From <input type="date" bind:value={range.from} onchange={applyRange} /></label>
        <label>To <input type="date" bind:value={range.to} onchange={applyRange} /></label>
      </div>
    </details>
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
    <label><input type="checkbox" checked={filters.dontMiss} onchange={() => onchange({ ...filters, dontMiss: !filters.dontMiss })} /> Don't-miss only</label>
    <label><input type="checkbox" checked={filters.recurring} onchange={() => onchange({ ...filters, recurring: !filters.recurring })} /> Include always-there</label>
    <label><input type="checkbox" checked={filters.saved} onchange={() => onchange({ ...filters, saved: !filters.saved })} /> Saved only</label>
  </fieldset>

  <label class="sort">Sort <select value={filters.sort} onchange={(e) => onchange({ ...filters, sort: e.currentTarget.value === "venue" ? "venue" : "date" })}><option value="date">By date</option><option value="venue">By venue</option></select></label>
</div>

<style>
  .rail { display: flex; flex-direction: column; gap: var(--space-4); font-size: var(--text-sm); }
  fieldset { border: 0; padding: 0; margin: 0; }
  /* Sentence case, as the front page sets its labels. */
  legend { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--fg); margin-bottom: var(--space-1); }
  .segments, .chips { display: flex; flex-wrap: wrap; gap: var(--space-1); }
  button { font: inherit; font-size: var(--text-xs); background: none; color: var(--fg-muted); border: 1px solid var(--rule); border-radius: 999px; padding: var(--space-1) var(--space-2); cursor: pointer; }
  /* One pressed look across the rail: a tint, an edge and words in a shade, and medium weight. Kind buttons take their
     kind's tint and shade from their .kind-<slug> class; every other button the grey pressed tint and ink, set here on
     the rail so a kind button's own class still wins. */
  .rail { --hue: var(--fg); --hue-tint: var(--pressed-tint); }
  button[aria-pressed="true"] { color: var(--hue); background: var(--hue-tint); border-color: var(--hue); font-weight: var(--weight-medium); }
  /* Kind buttons carry their kind: the icon in its colour. */
  .kind { display: inline-flex; align-items: center; gap: 0.3em; }
  .kind :global(.kind-icon) { color: var(--hue); }
  .custom { margin-top: var(--space-2); }
  .custom summary { display: inline-flex; align-items: center; min-height: 1.75rem; font-size: var(--text-xs); color: var(--fg-muted); cursor: pointer; }
  .custom summary:hover { color: var(--fg); }
  .range { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-1); } .range label { display: flex; flex-direction: column; font-size: var(--text-xs); }
  /* The Show checkboxes, one per line with the box beside its words. */
  fieldset > label { display: flex; align-items: center; gap: var(--space-2); }
  input, select { font: inherit; }
  /* Chromium's dark-scheme select is grey (#6b6b6b), under 4.5:1 with --fg; the raised surface clears AA in both schemes. */
  /* The date fields too: Chromium's dark field is #3b3b3b. (Explorer's search field has the same surface.) */
  select, input[type="date"] { background: var(--bg-raised); color: var(--fg); border: 1px solid var(--fg-faint); border-radius: 4px; }
  /* Tabbing onto a date field's calendar button matches neither :focus-visible nor :focus on the field, only
     :focus-within, so the field rings whenever focus is inside it, mouse clicks included. The inner parts are in a
     closed shadow tree, so :has(:focus-visible) cannot see them; no supported way to ring only for the keyboard. */
  input[type="date"]:focus-within { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
