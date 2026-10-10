<script lang="ts">
  import type { PublishedEvent } from "../lib/types";
  import { weekDays, type WeekDay } from "../lib/week";
  import { slugify } from "../lib/slugs";
  import KindIcon from "./KindIcon.svelte";

  // The rest of this week at a glance: a column per day with an icon per pick, each day a jump to its first card.
  // Runs open that day are bands under the icons, one lane per run in the kind's colour, as a calendar draws a
  // multi-day event; a run's icon still marks its opening and closing day.
  let { picks, today, sunday }: { picks: PublishedEvent[]; today: string; sunday: string } = $props();
  let days = $derived(weekDays(picks, today, sunday));
  const SHOWN = 3; // icons per day before "+n"
  const LANES = 3; // bands per day; the label counts the rest
  // A lane per run, the same on every day, so a run's band lines up across the week.
  let lanes = $derived([...new Set(days.flatMap((d) => d.running))].slice(0, LANES));

  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  function label(d: WeekDay): string {
    const parts = [d.picks.length === 0 ? (d.running.length === 0 ? "no picks" : "nothing new") : count(d.picks.length, "pick", "picks")];
    if (d.running.length > 0) parts.push(`${d.running.length} running`);
    return `${d.weekday} ${d.day}: ${parts.join(", ")}`;
  }
</script>

<nav class="week" aria-label="This week by day" style={`--days: ${days.length}`}>
  {#each days as d (d.date)}
    {@const first = d.picks[0] ?? d.running[0]}
    {#snippet inside()}
      <span class="name">{d.date === today ? "Today" : d.weekday}</span>
      <span class="num">{d.day}</span>
      <span class="icons" aria-hidden="true">
        {#each d.picks.slice(0, SHOWN) as e (e.id)}<span class={`kind-${slugify(e.kind)}`}><KindIcon kind={e.kind} /></span>{/each}
        {#if d.picks.length > SHOWN}<span class="more wide">+{d.picks.length - SHOWN}</span>{/if}
        {#if d.picks.length > 1}<span class="more narrow">+{d.picks.length - 1}</span>{/if}
      </span>
      {#if lanes.length > 0}
        <span class="lanes" aria-hidden="true">
          {#each lanes as run (run.id)}<span class={`lane kind-${slugify(run.kind)}`} class:open={d.running.includes(run)}></span>{/each}
        </span>
      {/if}
    {/snippet}
    {#if first}
      <a class="day" class:today={d.date === today} href={`#pick-${first.id}`} aria-label={label(d)}>{@render inside()}</a>
    {:else}
      <span class="day empty" class:today={d.date === today} aria-label={label(d)} role="img">{@render inside()}</span>
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
  .more.narrow { display: none; }
  /* The runs' bands: full width of the day, thin, in the kind's strong shade; a lane the run is closed on stays empty
     so the bands below it keep their row. */
  .lanes { display: flex; flex-direction: column; gap: 2px; align-self: stretch; margin-top: var(--space-1); }
  .lane { height: 3px; border-radius: 2px; }
  .lane.open { background: var(--hue); }
  .empty { background: none; border-style: dashed; }
  .empty .num { color: var(--fg-faint); font-weight: var(--weight-regular); }
  /* Today: drawn in ink, so the eye starts there. */
  .today { border: 1px solid var(--fg); }
  .today .name, .today .num { color: var(--fg); font-weight: var(--weight-strong); }
  @media (prefers-reduced-motion: reduce) { .day { transition: none; } a.day:active { transform: none; } }
  /* Narrow phones: a week of columns at 320 px leaves ~40 px each; the icons drop to one and "+n" counts the rest. */
  @media (max-width: 24rem) {
    .icons > span:not(.more):nth-child(n + 2), .more.wide { display: none; }
    .more.narrow { display: inline; }
  }
</style>
