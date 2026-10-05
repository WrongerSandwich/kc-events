<script lang="ts">
  import { onMount } from "svelte";
  // dont-miss, not events: the front page ships only the flagged events (its budget is 50 KB; the full list is about 26).
  import { dontMiss } from "../generated/dont-miss";
  import { meta } from "../generated/meta";
  import { formatDay, formatShort, todayIn } from "../lib/dates";
  import { firstDay, isMultiDay, lastDay } from "../lib/events";
  import { bucketDontMiss, horizonHeading, HORIZONS } from "../lib/horizon";
  import type { PublishedEvent } from "../lib/types";
  import DontMissCard from "./DontMissCard.svelte";

  const emptyLines = {
    "through-sunday": "Nothing picked between now and Sunday.",
    "next-two-weeks": "Nothing picked for the next two weeks yet.",
    "further-out": "Nothing picked further out yet.",
  } as const;
  // Server-rendered with the build's date; the visitor's date takes over on mount (the hydration rule).
  let today = $state(meta.buildToday);
  onMount(() => { today = todayIn(meta.timeZone, new Date()); });
  let buckets = $derived(bucketDontMiss(dontMiss, today));
  let total = $derived(HORIZONS.reduce((n, h) => n + buckets[h].length, 0));

  /** The later list's one-line date: everything there starts after the next two weeks, so nothing is on now. */
  function shortWhen(e: PublishedEvent): string {
    const first = firstDay(e)!;
    if (!isMultiDay(e)) return formatDay(first);
    return e.recurrence === "limited-run" ? `From ${formatDay(first)}` : `${formatDay(first)}–${formatShort(lastDay(e)!)}`;
  }
</script>

{#if total === 0}
  <p class="empty">Nothing is picked right now. <a href="/explore">Browse everything</a> instead.</p>
{:else}
  {#each HORIZONS as h (h)}
    {@const heading = horizonHeading(h, today)}
    <section aria-label={heading}>
      <h2 class="section-heading">{heading}</h2>
      {#if buckets[h].length === 0}
        <p class="empty">{emptyLines[h]}</p>
      {:else if h === "further-out"}
        <ul class="later">
          {#each buckets[h] as event (event.id)}
            <li>
              <span class="when">{shortWhen(event)}</span>
              <a href={`/e/${event.id}`}>{event.title}</a>
              <span class="where">{event.venue}</span>
            </li>
          {/each}
        </ul>
        <p class="more"><a href="/explore?dontmiss=1">Every upcoming pick, with why, in the explorer</a></p>
      {:else}
        {#each buckets[h] as event (event.id)}
          <DontMissCard {event} {today} />
        {/each}
      {/if}
    </section>
  {/each}
{/if}

<style>
  /* Cards in a run are parted by a hairline, the same one the one-line lists use. Set here, not in the card: a
     component's scoped styles cannot see its own siblings. */
  section :global(.card + .card) { border-top: 1px solid var(--rule); margin-top: var(--space-6); padding-top: var(--space-6); }
  .empty { color: var(--fg-muted); margin-top: var(--space-3); }
  /* The later picks: one line each, date in a fixed column so titles align; the venue drops under on a phone. */
  .later { list-style: none; padding: 0; margin: var(--space-2) 0 0; }
  /* The venue column takes only what it needs up to 12rem, then wraps, so a long hall name never squeezes the title. */
  .later li {
    display: grid; grid-template-columns: 6.5rem minmax(0, 1fr) minmax(0, max-content); gap: 0 var(--space-4); align-items: baseline;
    padding-block: var(--space-2); border-bottom: 1px solid var(--rule);
  }
  .later li:last-child { border-bottom: 0; }
  .later .when { font-size: var(--text-sm); color: var(--fg-muted); }
  .later a { color: var(--fg); font-weight: var(--weight-strong); }
  .later .where { font-size: var(--text-sm); color: var(--fg-muted); text-align: right; max-width: 12rem; text-wrap: balance; }
  @media (max-width: 34rem) {
    .later li { grid-template-columns: 5.5rem minmax(0, 1fr); }
    .later .where { grid-column: 2; text-align: left; max-width: none; }
  }
  /* The narrowest phones: date over title, so the title gets the whole line. */
  @media (max-width: 24rem) {
    .later li { grid-template-columns: minmax(0, 1fr); }
    .later .where { grid-column: 1; }
  }
  .more { margin-top: var(--space-3); }
</style>
