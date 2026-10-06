<script lang="ts">
  import type { Tile } from "../lib/tile";

  // The calendar tile, in the kind's tint (a .kind-<slug> class on an ancestor sets it). `id` is the event's, and names
  // the tile for the browser's view transition, so the card's tile glides into the event page's and back.
  let { tile, id, large = false }: { tile: Tile; id: string; large?: boolean } = $props();
</script>

<div class="tile" class:large style={`view-transition-name: tile-${id}`} aria-hidden="true">
  <span class="top">{tile.top}</span>
  <span class="day">{tile.day}</span>
  <span class="month">{tile.month}</span>
</div>

<style>
  .tile {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding-block: var(--space-2); border-radius: var(--radius);
    background: var(--hue-tint); color: var(--hue);
    font-variant-numeric: tabular-nums; line-height: 1.1;
  }
  .top, .month { font-size: var(--text-xs); font-weight: var(--weight-medium); }
  .day { font-size: var(--text-2xl); font-weight: var(--weight-strong); letter-spacing: var(--tracking-heading); }
  .large { width: 5rem; padding-block: var(--space-3); }
  .large .top, .large .month { font-size: var(--text-sm); }
  .large .day { font-size: var(--text-3xl); }
</style>
