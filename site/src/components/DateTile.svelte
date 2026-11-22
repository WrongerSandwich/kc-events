<script lang="ts">
  import type { Tile } from "../lib/tile";

  // The calendar tile, in the kind's tint (a .kind-<slug> class on an ancestor sets it). `id` is the event's, and names
  // the tile for the browser's view transition, so the card's tile glides into the event page's and back.
  let { tile, id, large = false }: { tile: Tile; id: string; large?: boolean } = $props();
</script>

<div class="tile" class:large class:today={tile.today} style={`view-transition-name: tile-${id}`} aria-hidden="true">
  <span class="top">{tile.top}</span>
  <span class="day">{tile.day}</span>
  <span class="month">{tile.month}</span>
</div>

<style>
  /* Stepped at the shoulders like a setback tower (tokens.css's --shoulders), with a double line at its foot as a
     base course; its two words in the display capitals, the day in the text face's figures (#293). */
  .tile {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: calc(var(--space-2) + 8px) 0 var(--space-2); clip-path: var(--shoulders);
    background: var(--hue-tint); color: var(--hue);
    font-variant-numeric: tabular-nums; line-height: 1.1;
  }
  .top, .month { font-family: var(--font-display); font-weight: 700; font-size: var(--text-2xs); letter-spacing: var(--tracking-label); text-transform: uppercase; }
  /* The face sits high in its line box; the word above the day comes down to sit evenly between the shoulders and it. */
  .top { transform: translateY(0.1em); }
  .day { font-size: var(--text-2xl); font-weight: var(--weight-strong); letter-spacing: var(--tracking-heading); }
  .tile::after { content: ""; width: calc(100% - 20px); height: 4px; margin-top: 5px; border-top: 1px solid currentColor; border-bottom: 1px solid currentColor; }
  /* Today: a thin ring in the kind's strong shade, so the day stands out without a new colour. The ring follows the
     steps: the tile fills with the shade and a second stepped shape, set in by the ring's width, lays the tint over it. */
  .today { position: relative; isolation: isolate; background: var(--hue); }
  .today::before { content: ""; position: absolute; inset: 1.5px; z-index: -1; background: var(--hue-tint); clip-path: var(--shoulders); }
  .large { width: 5rem; padding-block: calc(var(--space-3) + 8px) var(--space-3); }
  .large .top, .large .month { font-size: var(--text-sm); }
  .large .day { font-size: var(--text-3xl); }
</style>
