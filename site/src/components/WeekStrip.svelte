<script lang="ts">
  import type { PublishedEvent } from "../lib/types";
  import { weekDays } from "../lib/week";
  import { slugify } from "../lib/slugs";
  import KindIcon from "./KindIcon.svelte";

  // The rest of this week at a glance: a column per day with an icon per pick, each day a jump to its first card.
  let { picks, today, sunday }: { picks: PublishedEvent[]; today: string; sunday: string } = $props();
  let days = $derived(weekDays(picks, today, sunday));
  const SHOWN = 3; // icons per day before "+n"
</script>

<nav class="week" aria-label="This week by day" style={`--days: ${days.length}`}>
  {#each days as d (d.date)}
    {@const label = `${d.weekday} ${d.day}: ${d.picks.length === 0 ? "no picks" : d.picks.length === 1 ? "1 pick" : `${d.picks.length} picks`}`}
    {#if d.picks.length > 0}
      <a class="day" class:today={d.date === today} href={`#pick-${d.picks[0]!.id}`} aria-label={label}>
        <span class="name">{d.date === today ? "Today" : d.weekday}</span>
        <span class="num">{d.day}</span>
        <span class="icons" aria-hidden="true">
          {#each d.picks.slice(0, SHOWN) as e (e.id)}<span class={`kind-${slugify(e.kind)}`}><KindIcon kind={e.kind} /></span>{/each}
          {#if d.picks.length > SHOWN}<span class="more">+{d.picks.length - SHOWN}</span>{/if}
        </span>
      </a>
    {:else}
      <span class="day empty" class:today={d.date === today} aria-label={label} role="img">
        <span class="name">{d.date === today ? "Today" : d.weekday}</span>
        <span class="num">{d.day}</span>
        <span class="icons"></span>
      </span>
    {/if}
  {/each}
</nav>

<style>
  .week { display: grid; grid-template-columns: repeat(var(--days), minmax(0, 1fr)); gap: var(--space-1); margin: var(--space-3) 0 var(--space-2); }
  .day {
    display: flex; flex-direction: column; align-items: center; gap: 0.15rem;
    padding: var(--space-2) var(--space-1); border-radius: var(--radius);
    background: var(--bg-raised); border: 1px solid var(--rule); color: var(--fg);
    font-variant-numeric: tabular-nums; line-height: 1.15; text-decoration: none;
    transition: border-color 150ms var(--ease-out), transform 150ms var(--ease-out);
  }
  a.day:hover { border-color: var(--control-border); text-decoration: none; }
  a.day:active { transform: translateY(1px); }
  .name { font-size: var(--text-xs); color: var(--fg-muted); }
  .num { font-size: var(--text-lg); font-weight: var(--weight-strong); }
  .icons { display: flex; align-items: center; justify-content: center; gap: 0.15rem; min-height: 1.15rem; font-size: var(--text-sm); }
  .icons > span:not(.more) { color: var(--hue); display: inline-flex; }
  .more { font-size: var(--text-xs); color: var(--fg-muted); }
  .empty { background: none; border-style: dashed; }
  .empty .num { color: var(--fg-faint); font-weight: var(--weight-regular); }
  /* Today: drawn in ink, so the eye starts there. */
  .today { border: 1px solid var(--fg); }
  .today .name, .today .num { color: var(--fg); font-weight: var(--weight-strong); }
  @media (prefers-reduced-motion: reduce) { .day { transition: none; } a.day:active { transform: none; } }
  /* Narrow phones: a week of columns at 320 px leaves ~40 px each; the icons drop to one and "+n". */
  @media (max-width: 24rem) {
    .icons > span:not(.more):nth-child(n + 2) { display: none; }
  }
</style>
