<script lang="ts">
  import { onMount } from "svelte";
  import { flip } from "svelte/animate";
  import { quartOut } from "svelte/easing";
  import { fade } from "svelte/transition";
  // dont-miss, not events: the front page ships only the flagged events (its budget is 50 KB; the full list is about 26).
  import { dontMiss } from "../generated/dont-miss";
  import { meta } from "../generated/meta";
  import { addDays, formatDay, formatShort, localDate, nowIn } from "../lib/dates";
  import { firstDay, isMultiDay, lastDay } from "../lib/events";
  import { bucketDontMiss, horizonBounds, horizonHeading, HORIZONS, type Horizon } from "../lib/horizon";
  import { slugify } from "../lib/slugs";
  import type { PublishedEvent } from "../lib/types";
  import DontMissCard from "./DontMissCard.svelte";
  import KindChip from "./KindChip.svelte";
  import KindIcon from "./KindIcon.svelte";
  import WeekStrip from "./WeekStrip.svelte";

  const emptyLines = {
    "through-sunday": "Nothing picked between now and Sunday.",
    "next-two-weeks": "Nothing picked for the next two weeks yet.",
    "further-out": "Nothing picked further out yet.",
  } as const;
  // Server-rendered with the build's date and no clock; the visitor's clock takes over on mount (the hydration rule)
  // and is read again whenever the tab comes back into view, so a page left open overnight catches up. No timer.
  let now = $state<string | undefined>(undefined);
  let today = $derived(now === undefined ? meta.buildToday : localDate(now));
  // The kind counts are links to the explorer as rendered (and without JavaScript); hydrated, they filter in place.
  let hydrated = $state(false);
  onMount(() => {
    const read = () => {
      now = nowIn(meta.timeZone, new Date());
      // A new day can take every pick of a section's chosen kind away. The filter goes with them, so it cannot come
      // back on unpressed when a later pick of that kind moves into the section.
      for (const h of HORIZONS) {
        if (chosen[h] !== undefined && picksOf(h, chosen[h]).length === 0) {
          chosen[h] = undefined;
          announced[h] = undefined;
        }
      }
    };
    read();
    hydrated = true;
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  });
  let buckets = $derived(bucketDontMiss(dontMiss, today));
  let total = $derived(HORIZONS.reduce((n, h) => n + buckets[h].length, 0));

  // Each section's kind filter, one kind at a time, and what its live region last announced. Per visit: not in the
  // URL, not stored.
  let chosen = $state<Partial<Record<Horizon, string>>>({});
  let announced = $state<Partial<Record<Horizon, string>>>({});

  /** A section's picks, or just one kind of them. */
  function picksOf(h: Horizon, kind: string | undefined): PublishedEvent[] {
    return kind === undefined ? buckets[h] : buckets[h].filter((e) => e.kind === kind);
  }

  /** The explorer showing a section's picks, or just one kind of them. */
  function explorerHref(h: Horizon, kind?: string): string {
    const { sunday, twoWeeks } = horizonBounds(today);
    const when = h === "through-sunday" ? "weekend" : `${addDays(sunday, 1)}..${twoWeeks}`;
    return `/explore?when=${when}${kind === undefined ? "" : `&kind=${slugify(kind)}`}&dontmiss=1`;
  }

  /** A section's picks counted by kind, most first, each with the explorer link the chip is before hydration. */
  function kindCounts(h: Horizon, events: PublishedEvent[]): { kind: string; n: number; href: string }[] {
    const counts = new Map<string, number>();
    for (const e of events) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
    return [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([kind, n]) => ({ kind, n, href: explorerHref(h, kind) }));
  }

  function toggle(h: Horizon, kind: string) {
    const next = chosen[h] === kind ? undefined : kind;
    chosen[h] = next;
    const n = picksOf(h, next).length;
    const picks = n === 1 ? "pick" : "picks";
    announced[h] = next === undefined ? `Showing all ${n} ${picks}` : `Showing ${n} ${next} ${picks}`;
  }

  /** A motion's length in ms, or none where the visitor asks for none (or there is no media query to ask, as in tests). */
  const motionMs = (ms: number) => (typeof matchMedia === "function" && !matchMedia("(prefers-reduced-motion: reduce)").matches ? ms : 0);

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
    {@const headingId = `heading-${h}`}
    <section aria-labelledby={headingId}>
      <h2 id={headingId} class="section-heading">{heading}</h2>
      {#if buckets[h].length === 0}
        <p class="empty">{emptyLines[h]}</p>
      {:else if h === "further-out"}
        <ul class="later">
          {#each buckets[h] as event (event.id)}
            <li class={`kind-${slugify(event.kind)}`}>
              <span class="when">{shortWhen(event)}</span>
              <a href={`/e/${event.id}`}><span class="icon"><KindIcon kind={event.kind} /></span>{event.title}<span class="visually-hidden">, {event.kind}</span></a>
              <span class="where">{event.venue}</span>
            </li>
          {/each}
        </ul>
        <p class="more"><a href="/explore?dontmiss=1">All the picks, with why, in the explorer</a></p>
      {:else}
        {@const kind = chosen[h]}
        <ul class="kinds" aria-label="Picks by kind">
          {#each kindCounts(h, buckets[h]) as k (k.kind)}
            <li>
              {#if hydrated}
                <KindChip kind={k.kind} label={`${k.n} ${k.kind}`} pressed={k.kind === kind} onclick={() => toggle(h, k.kind)} />
              {:else}
                <KindChip kind={k.kind} label={`${k.n} ${k.kind}`} href={k.href} />
              {/if}
            </li>
          {/each}
        </ul>
        <p role="status" class="visually-hidden">{announced[h] ?? ""}</p>
        {#if h === "through-sunday" && horizonBounds(today).sunday >= addDays(today, 2)}
          <!-- Three days or more left in the week: enough for a strip to say something. -->
          <WeekStrip picks={buckets[h]} {today} sunday={horizonBounds(today).sunday} />
        {/if}
        <!-- Filtered, the kept cards slide into place and the others fade. -->
        {#each picksOf(h, kind) as event (event.id)}
          <div class="pick" animate:flip={{ duration: motionMs(250), easing: quartOut }} transition:fade={{ duration: motionMs(150) }}>
            <DontMissCard {event} {today} {now} />
          </div>
        {/each}
        <p class="more"><a href={explorerHref(h, kind)}>These picks in the explorer</a></p>
      {/if}
    </section>
  {/each}
{/if}

<style>
  /* Cards in a run are parted by a hairline, the same one the one-line lists use. Set here, not in the card: a
     component's scoped styles cannot see its own siblings. */
  .pick + .pick { border-top: 1px solid var(--rule); margin-top: var(--space-6); padding-top: var(--space-6); }
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
  /* Icon, then title, with a hanging indent: a wrapped title lines up under itself, not under the icon. */
  .later a { display: flex; align-items: baseline; color: var(--fg); font-weight: var(--weight-medium); }
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
  /* Under a run of cards, the link stands off them as far as one card stands off the next. */
  .pick + .more { margin-top: var(--space-6); }
  /* What kind of week it is, at a glance; each chip narrows the section to those picks (links to the explorer
     without JavaScript). Pressed, it takes the kind's ring, the one a Today tile wears. */
  .kinds { list-style: none; padding: 0; margin: var(--space-3) 0 var(--space-2); display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .kinds :global(.chip) {
    font: inherit; font-size: var(--text-sm); font-weight: var(--weight-medium); line-height: 1.6;
    padding: var(--space-1) var(--space-3); border: 0; cursor: pointer; text-decoration: none; transition: filter 150ms var(--ease-out);
  }
  .kinds :global(.chip:hover) { filter: brightness(0.96) saturate(1.2); }
  .kinds :global(.chip[aria-pressed="true"]) { box-shadow: inset 0 0 0 1.5px var(--hue); }
  /* A kind's icon before a title in the one-line list, in the kind's colour. */
  .icon { flex: none; color: var(--hue); margin-right: var(--space-2); }
  @media (prefers-reduced-motion: reduce) { .kinds :global(.chip) { transition: none; } }
</style>
