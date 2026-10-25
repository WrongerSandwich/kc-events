<script lang="ts">
  import { shortWeekday } from "../lib/dates";
  import { dayPresets, railPresets, shownPreset } from "../lib/filter";
  import { DEFAULT_FILTERS, WHEN_LABELS, type Filters } from "../lib/query";
  import { kindLabel, slugify } from "../lib/slugs";
  import KindIcon from "./KindIcon.svelte";

  // counts: what each kind's and region's chip would list (facetCounts), shown on the chip, so a dead end is seen
  // before it is pressed.
  let { filters, today, onchange, kinds, regions, counts }: {
    filters: Filters; today: string; onchange: (f: Filters) => void; kinds: string[]; regions: string[];
    counts: { kinds: Map<string, number>; regions: Map<string, number> };
  } = $props();

  // From Thursday, a chip for each weekend day still to come (#183), after Today: a one-day range, shareable as any.
  let days = $derived(dayPresets(today));
  // The presets less any that is another's days today, and the one pressed for the filter in force (#183's week is
  // "This weekend" on a Friday).
  let presets = $derived(railPresets(today));
  let pressed = $derived(shownPreset(filters.when, today));
  const isDay = (d: string) => "from" in filters.when && filters.when.from === d && filters.when.to === d;

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
  // shows its dates; a day chip's range does not, since the chip shows it. Closed, a native disclosure keeps the
  // fields out of the Tab order.
  let custom = $state(false);
  $effect(() => {
    if (rangeKey !== "" && !days.some((d) => rangeKey === `${d}..${d}`)) custom = true;
  });

  const toggleIn = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  function applyRange() {
    const { from, to } = range;
    if (from && to) onchange({ ...filters, when: from <= to ? { from, to } : { from: to, to: from } });
    // Emptying one end of a range in force ends the range, so the inputs never look empty while it still filters.
    else if ("from" in filters.when) onchange({ ...filters, when: DEFAULT_FILTERS.when });
  }
</script>

<!-- A chip's count: a bare figure on screen, "Film, 7 events" to a screen reader. -->
{#snippet tally(n: number)}<span class="n" aria-hidden="true">{n}</span><span class="visually-hidden">, {n} {n === 1 ? "event" : "events"}</span>{/snippet}

<div class="rail">
  <fieldset>
    <legend>When</legend>
    <div class="segments">
      {#each presets as p (p)}
        <button type="button" aria-pressed={pressed === p} onclick={() => onchange({ ...filters, when: { preset: p } })}>{WHEN_LABELS[p]}</button>
        {#if p === "today"}
          {#each days as d (d)}
            <button type="button" aria-pressed={isDay(d)} onclick={() => onchange({ ...filters, when: { from: d, to: d } })}>{shortWeekday(d)}</button>
          {/each}
        {/if}
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
        {@const n = counts.kinds.get(k) ?? 0}
        <button type="button" class={`kind kind-${slugify(k)}`} class:none={n === 0} aria-pressed={filters.kinds.includes(k)} onclick={() => onchange({ ...filters, kinds: toggleIn(filters.kinds, k) })}><KindIcon kind={k} />{kindLabel(k)}{@render tally(n)}</button>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>Region</legend>
    <div class="chips">
      {#each regions as r (r)}
        {@const n = counts.regions.get(r) ?? 0}
        <button type="button" class:none={n === 0} aria-pressed={filters.regions.includes(r)} onclick={() => onchange({ ...filters, regions: toggleIn(filters.regions, r) })}>{r}{@render tally(n)}</button>
      {/each}
    </div>
  </fieldset>

  <!-- Each switch says what it does under its words, out of its name, so a screen reader hears the name and then the
       line. The rail is on the page once, so the ids are fixed. Don't miss is the bar's, the first lens, not a switch
       here. -->
  <fieldset class="show">
    <legend>Show</legend>
    <label><input type="checkbox" aria-describedby="show-always" checked={filters.recurring} onchange={() => onchange({ ...filters, recurring: !filters.recurring })} /> Always there</label>
    <p class="hint" id="show-always">Adds recurring events, after the days</p>
    <label><input type="checkbox" aria-describedby="show-saved" checked={filters.saved} onchange={() => onchange({ ...filters, saved: !filters.saved })} /> Saved only</label>
    <p class="hint" id="show-saved">Kept in this browser, no account</p>
  </fieldset>
</div>

<style>
  .rail { display: flex; flex-direction: column; gap: var(--space-4); font-size: var(--text-sm); }
  fieldset { border: 0; padding: 0; margin: 0; }
  /* Sentence case, as the front page sets its labels. */
  legend { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--fg); margin-bottom: var(--space-1); }
  .segments, .chips { display: flex; flex-wrap: wrap; gap: var(--space-1); }
  button { font: inherit; font-size: var(--text-xs); background: none; color: var(--fg-muted); border: 1px solid var(--control-border); border-radius: 999px; padding: var(--space-1) var(--space-2); cursor: pointer; }
  /* Phones: 32 px, over WCAG 2.5.8's 24 px with room to spare for a finger (audit 2026-10-21, A5). */
  @media (max-width: 800px) { button { min-height: 2rem; } }
  /* One pressed look across the rail: a tint, an edge and words in a shade, and medium weight. Kind buttons take their
     kind's tint and shade from their .kind-<slug> class; every other button the grey pressed tint and ink, set here on
     the rail so a kind button's own class still wins. */
  .rail { --hue: var(--fg); --hue-tint: var(--pressed-tint); }
  button[aria-pressed="true"] { color: var(--hue); background: var(--hue-tint); border-color: var(--hue); font-weight: var(--weight-medium); }
  /* Kind buttons carry their kind: the icon in its colour. Region buttons share the layout, so a count sits as far
     from its words on both. */
  .chips button { display: inline-flex; align-items: center; gap: 0.3em; }
  .kind :global(.kind-icon) { color: var(--hue); }
  .custom { margin-top: var(--space-2); }
  .custom summary { display: inline-flex; align-items: center; min-height: 1.75rem; font-size: var(--text-xs); color: var(--fg-muted); cursor: pointer; }
  .custom summary:hover { color: var(--fg); }
  .range { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-1); } .range label { display: flex; flex-direction: column; font-size: var(--text-xs); }
  /* A chip's count, quieter than its words; a chip that would list nothing is quieter still, and stays pressable. */
  .n { margin-left: 0.1em; color: var(--fg-faint); font-variant-numeric: tabular-nums; font-weight: var(--weight-regular); }
  button[aria-pressed="true"] .n { color: inherit; }
  button.none:not([aria-pressed="true"]) { color: var(--fg-faint); border-color: var(--rule-strong); border-style: dashed; }
  button.none:not([aria-pressed="true"]) :global(.kind-icon) { color: inherit; }
  /* The Show checkboxes, one per line with the box beside its words, and what each does under them, from the words'
     edge. The box is set at 13 px with no margin, so the line starts 13 px and a gap in. It is ink, as a pressed chip's
     edge is, not the browser's blue. */
  fieldset > label { display: flex; align-items: center; gap: var(--space-2); }
  .show input { width: 13px; height: 13px; margin: 0; flex: none; accent-color: var(--accent); }
  .show .hint { margin: 0 0 var(--space-2) calc(13px + var(--space-2)); font-size: var(--text-xs); line-height: var(--leading-tight); color: var(--fg-muted); }
  .show .hint:last-child { margin-bottom: 0; }
  input { font: inherit; }
  /* The date fields: Chromium's dark field is #3b3b3b, under 4.5:1 with --fg; the raised surface clears AA in both
     schemes. (Explorer's search field and sort have the same surface.) */
  input[type="date"] { background: var(--bg-raised); color: var(--fg); border: 1px solid var(--fg-faint); border-radius: 4px; }
  /* Tabbing onto a date field's calendar button matches neither :focus-visible nor :focus on the field, only
     :focus-within, so the field rings whenever focus is inside it, mouse clicks included. The inner parts are in a
     closed shadow tree, so :has(:focus-visible) cannot see them; no supported way to ring only for the keyboard. */
  input[type="date"]:focus-within { outline: 2px solid var(--focus); outline-offset: 2px; }
  /* Forced colours (Windows High Contrast) paint every button alike, so pressed differed only by weight (audit A4):
     pressed takes the system's selection colours, the icon with its words. */
  @media (forced-colors: active) {
    button[aria-pressed="true"] { forced-color-adjust: none; color: HighlightText; background: Highlight; border-color: Highlight; }
    button[aria-pressed="true"] :global(.kind-icon) { color: HighlightText; }
  }
</style>
