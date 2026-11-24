<script lang="ts">
  import { flushSync, onMount, tick } from "svelte";
  // dont-miss, not events: the front page ships only the flagged events (the full list would be about 26 KB more).
  import { dontMiss } from "../generated/dont-miss";
  import { addDays, formatShort, formatTime } from "../lib/dates";
  import { firstDay, isMultiDay, lastDay, nextRunDay, venueLine } from "../lib/events";
  import { isOnNowPick, onNowPicks, rowWhen } from "../lib/front-rows";
  import { anchorDate, bucketDontMiss, horizonBounds, horizonHeading, HORIZONS } from "../lib/horizon";
  import { kindName, kindWords } from "../lib/landing";
  import { hashId, kindLabel, slugify } from "../lib/slugs";
  import { dateTile } from "../lib/tile";
  import type { PublishedEvent } from "../lib/types";
  import DontMissCard from "./DontMissCard.svelte";
  import KindChip from "./KindChip.svelte";
  import KindIcon from "./KindIcon.svelte";
  import PickTag from "./PickTag.svelte";
  import UiIcon from "./UiIcon.svelte";
  import WeekStrip from "./WeekStrip.svelte";
  import { islandClock } from "./clock.svelte";

  const emptyLines = {
    "through-sunday": "Nothing picked between now and Sunday.",
    "next-two-weeks": "Nothing picked for the next two weeks yet.",
    "further-out": "Nothing picked further out yet.",
  } as const;
  /** The hour, on the visitor's wall clock, from which a day with its picks all begun counts as done (doneToday). */
  const LATE_HOUR = "21";
  // The visitor's clock, shared with every island (clock.svelte.ts): the build's date and no clock as rendered.
  const clock = islandClock();
  let now = $derived(clock.now);
  let today = $derived(clock.today);
  // The kind counts are links to the explorer as rendered (and without JavaScript); hydrated, they filter in place.
  let hydrated = $state(false);
  onMount(() => {
    // A jump to a pick that has started (the week strip's Today, a shared link) opens the fold it sits in.
    const unfold = () => {
      const target = location.hash.length > 1 ? document.getElementById(hashId(location.hash)) : null;
      const fold = target?.closest("details");
      if (fold && !fold.open) {
        fold.open = true;
        target!.scrollIntoView();
      }
    };
    hydrated = true;
    window.addEventListener("hashchange", unfold);
    tick().then(unfold); // arriving with the hash: the fold exists once the visitor's clock has rendered
    return () => window.removeEventListener("hashchange", unfold);
  });
  // A new day, or a start passing, can take every pick of the chosen kind out of what can still be gone to. The filter
  // goes with them (its chip has gone), so it cannot come back on unpressed when a later pick of that kind moves in.
  $effect(() => {
    if (chosen !== undefined && upcomingOf(chosen).length === 0) {
      chosen = undefined;
      announced = undefined;
    }
  });
  let buckets = $derived(bucketDontMiss(dontMiss, today));
  let total = $derived(HORIZONS.reduce((n, h) => n + buckets[h].length, 0));
  // This week's runs on all week and past Sunday leave its cards for On now's rows, after it (isOnNowPick): the cards,
  // the kind chips and the week strip are what opens, closes or happens by Sunday.
  let onNow = $derived(onNowPicks(buckets["through-sunday"], today));
  let week = $derived(buckets["through-sunday"].filter((e) => !isOnNowPick(e, today)));

  // This week's kind filter, one kind at a time, and what its live region last announced. Per visit: not in the URL,
  // not stored. Only this week has one: the sections after it are one-line rows (#184), but for the weekend's cards (soon).
  let chosen = $state<string | undefined>();
  let announced = $state<string | undefined>();

  /** This week's picks (On now's aside), or just one kind of them. */
  function picksOf(kind: string | undefined): PublishedEvent[] {
    return kind === undefined ? week : week.filter((e) => e.kind === kind);
  }

  /** The same, less the picks that have started: what the cards show, and so what the chips count. */
  function upcomingOf(kind: string | undefined): PublishedEvent[] {
    return picksOf(kind).filter((e) => !hasStarted(e));
  }

  /** The explorer showing this week's picks, or just one kind of them: the page's one link to the explorer's picks (#184). */
  function explorerHref(kind?: string): string {
    return `/explore?when=weekend${kind === undefined ? "" : `&kind=${slugify(kind)}`}&picks=1`;
  }

  /** This week's picks counted by kind, most first, each with the explorer link the chip is before hydration. */
  function kindCounts(events: PublishedEvent[]): { kind: string; n: number; href: string }[] {
    const counts = new Map<string, number>();
    for (const e of events) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
    return [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([kind, n]) => ({ kind, n, href: explorerHref(kind) }));
  }

  /** A kind filter's view transition is running: the cards carry their names. */
  let moving = $state(false);

  /** A kind's chip: pressed again, it lets go, as All does. */
  function toggle(kind: string) {
    choose(chosen === kind ? undefined : kind);
  }

  function choose(next: string | undefined) {
    if (next === chosen) return;
    const update = () => {
      chosen = next;
      const n = upcomingOf(next).length;
      const picks = n === 1 ? "pick" : "picks";
      // The kind in words before "picks": "2 theater and dance picks", "2 other picks" (kindName's "other events" would
      // read "other events picks").
      announced = next === undefined ? `Showing all ${n} ${picks}` : `Showing ${n} ${kindWords(next)} ${picks}`;
      return tick();
    };
    // The kept cards slide into place and the others fade: the browser's view transition, by each card's name (its
    // timing and the reduced-motion rule are in base.css). The cards are named only for it, so opening an event page
    // still carries just the tile and title across. Where there is none, the list just changes.
    if (typeof document.startViewTransition !== "function") {
      update();
      return;
    }
    moving = true;
    flushSync(); // the names are on the cards before the browser captures them
    document.startViewTransition(update).finished.finally(() => { moving = false; });
  }

  /**
   * A timed pick today whose start has passed. Known only once the visitor's clock is read, so the built page never
   * folds one away. The section leads with what can still be gone to; these fold into one line at its end.
   */
  const hasStarted = (e: PublishedEvent) => now !== undefined && dateTile(e, today, now).started === true;

  /**
   * A pick this week that can be gone to after today: a later one-off, or a run with a day to go on (nextRunDay) after
   * today and by Sunday.
   */
  function afterToday(e: PublishedEvent): boolean {
    if (e.recurrence !== "limited-run") return firstDay(e)! > today;
    const next = nextRunDay(e, addDays(today, 1));
    return next !== undefined && next <= horizonBounds(today).sunday;
  }

  /**
   * Late in the evening, today's picks have all begun, and what is left this week is after today: the heading's dates
   * start tomorrow (horizonHeading), so on a Saturday night the section reads "Tomorrow, Sun Oct 25". From 9 pm only: a
   * run open today is open tomorrow too, and by day its doors may well be open now. Never as built, with no clock, and
   * not with nothing left to show under it.
   */
  let doneToday = $derived.by(() => {
    if (now === undefined || now.slice(11, 13) < LATE_HOUR) return false;
    const ahead = upcomingOf(undefined);
    return week.some(hasStarted) && ahead.length > 0 && ahead.every(afterToday);
  });

  /** Three days or more left in the week: enough for the week strip to say something. */
  let stripShown = $derived(horizonBounds(today).sunday >= addDays(today, 2));

  /**
   * Saturday and Sunday, with the strip gone and little of the week left, the next two weeks' picks through Wednesday
   * are cards too, so tomorrow's show is not a muted row under a run open until December. The heading stays the
   * bucket's; the cards lead it, the rows follow.
   */
  let soon = $derived.by(() => {
    if (stripShown) return new Set<string>();
    const until = addDays(horizonBounds(today).sunday, 3);
    return new Set(buckets["next-two-weeks"].filter((e) => anchorDate(e, today)! <= until).map((e) => e.id));
  });
</script>

{#snippet row(event: PublishedEvent, when: string[])}
  <!-- Date, title, venue; the pick tag under the date, at every width, so the titles start in one column and keep
       their line (the front page critique of 2026-11-24). -->
  <!-- A day's number keeps to its month ("Dec 27"), so a wrapped date never strands it. -->
  <li class={`kind-${slugify(event.kind)}`}>
    <span class="lead">
      <span class="when">{#each when as line, i (line)}{i > 0 ? " " : ""}<span>{line.replace(/ (\d)/g, " $1")}</span>{/each}</span>
      <PickTag reason={event.pickReason} />
    </span>
    <a href={`/e/${event.id}`}><span class="icon"><KindIcon kind={event.kind} /></span>{event.title}<span class="visually-hidden">, {kindName(event.kind).toLowerCase()}</span></a>
    <span class="where">{venueLine(event)}</span>
  </li>
{/snippet}

{#if total === 0}
  <p class="empty">Nothing picked right now. <a href="/explore?when=all">Browse everything</a> instead.</p>
{:else}
  {#each HORIZONS as h (h)}
    {@const heading = horizonHeading(h, today, doneToday)}
    {@const headingId = `heading-${h}`}
    {@const picks = h === "through-sunday" ? week : buckets[h]}
    <section aria-labelledby={headingId}>
      <h2 id={headingId} class="section-heading">{heading}</h2>
      {#if picks.length === 0}
        <p class="empty">{h === "through-sunday" && onNow.length > 0 ? "Nothing else picked between now and Sunday." : emptyLines[h]}</p>
      {:else if h !== "through-sunday"}
        <!-- After this week, one line a pick (#184): the cards are for what is close enough to plan tonight, which at
             the weekend reaches into the days after it (soon). Each row keeps its pick tag, the one part of the why
             that fits a line: without it a row says when and where and never why it is here. -->
        {#each buckets[h].filter((e) => soon.has(e.id)) as event (event.id)}
          <div class="pick"><DontMissCard {event} {today} {now} /></div>
        {/each}
        {@const rows = buckets[h].filter((e) => !soon.has(e.id))}
        {#if rows.length > 0}
        <ul class="later">
          {#each rows as event (event.id)}{@render row(event, [rowWhen(event, today)])}{/each}
        </ul>
        {/if}
      {:else}
        {@const kind = chosen}
        {@const ahead = upcomingOf(undefined)}
        <!-- The chips count only what is still to come, as the cards show it: a kind whose picks have all started has
             no chip, so none can filter the cards down to nothing (they wait in the fold below, under All). -->
        {@const counts = kindCounts(ahead)}
        <!-- All first, pressed until a kind is: the row reads as a filter with a way back, not as a row of tags. The
             kinds keep the short form every chip uses (a card's, the explorer's), so the row stays a row on a phone. -->
        <!-- None at all once every pick this week has started: no row, rather than an empty labelled list. -->
        {#if counts.length > 0}
        <ul class="kinds" aria-label="Picks by kind">
          {#if counts.length > 1}
            <li class="all">
              {#if hydrated}
                <button type="button" class="chip" aria-pressed={kind === undefined} onclick={() => choose(undefined)}>All {ahead.length}</button>
              {:else}
                <a class="chip" href={explorerHref()}>All {ahead.length}</a>
              {/if}
            </li>
          {/if}
          {#each counts as k (k.kind)}
            <li>
              {#if hydrated}
                <KindChip kind={k.kind} label={`${k.n} ${kindLabel(k.kind)}`} pressed={k.kind === kind} onclick={() => toggle(k.kind)} />
              {:else}
                <KindChip kind={k.kind} label={`${k.n} ${kindLabel(k.kind)}`} href={k.href} filter />
              {/if}
            </li>
          {/each}
        </ul>
        {/if}
        <p role="status" class="visually-hidden">{announced ?? ""}</p>
        {@const shown = picksOf(kind)}
        {@const upcoming = shown.filter((e) => !hasStarted(e))}
        {@const started = shown.filter(hasStarted)}
        {#if stripShown}
          <!-- The strip follows the kind filter, and lists started picks last, so a day jumps to one that can still be
               gone to. -->
          <WeekStrip picks={[...upcoming, ...started]} {today} sunday={horizonBounds(today).sunday} />
        {/if}
        <!-- Named while a filter moves them (toggle), so its view transition slides the kept cards into place. -->
        {#each upcoming as event (event.id)}
          <div class="pick" style={moving ? `view-transition-name: pick-${event.id}` : undefined}>
            <DontMissCard {event} {today} {now} />
          </div>
        {/each}
        {#if started.length > 0}
          <details class="started" class:alone={upcoming.length === 0}>
            <summary><UiIcon name="chevron-right" />{started.length} earlier today</summary>
            <ul class="later">
              {#each started as event (event.id)}
                <li class={`kind-${slugify(event.kind)}`} id={`pick-${event.id}`}>
                  <!-- A span's start is its first day's hour, not today's (a last day can close before it). -->
                  <span class="when">{isMultiDay(event) ? "Last day" : formatTime(event.start!)}</span>
                  <a href={`/e/${event.id}`}><span class="icon"><KindIcon kind={event.kind} /></span>{event.title}<span class="visually-hidden">, {kindName(event.kind).toLowerCase()}</span></a>
                  <span class="where">{venueLine(event)}</span>
                </li>
              {/each}
            </ul>
          </details>
        {/if}
        <p class="more"><a href={explorerHref(kind)}>This week's picks in the explorer</a></p>
      {/if}
    </section>
    {#if h === "through-sunday" && onNow.length > 0}
      <!-- Runs on all week and past Sunday, after the week they would crowd: a row each, its weekdays over its close. -->
      <section aria-labelledby="heading-on-now">
        <h2 id="heading-on-now" class="section-heading">On now</h2>
        <ul class="later">
          {#each onNow as event (event.id)}{@render row(event, [...(event.daysLine ? [event.daysLine] : []), `Closes ${formatShort(lastDay(event)!)}`])}{/each}
        </ul>
      </section>
    {/if}
  {/each}
{/if}

<style>
  /* Cards in a run are parted by a hairline, the same one the one-line lists use. Set here, not in the card: a
     component's scoped styles cannot see its own siblings. */
  .pick + .pick { border-top: 1px solid var(--rule); margin-top: var(--space-6); padding-top: var(--space-6); }
  .empty { color: var(--fg-muted); margin-top: var(--space-3); }
  /* The rows after a run of cards (the next days' picks at the weekend) stand off them as one card does the next. */
  .pick + .later { margin-top: var(--space-6); border-top: 1px solid var(--rule); }
  /* The one-line rows, after this week and in the started fold (the class is the Later list's, which had them first):
     date in a fixed column so titles align; the venue drops under on a phone. */
  /* One grid for the list, each row a subgrid of it, so the titles and the venues each start in one column down the
     list rather than wherever a row's own widths put them. The venue column takes only what the longest needs up to
     18rem, then wraps, ranged left, so a long hall name never squeezes the title (#184). */
  .later {
    list-style: none; padding: 0; margin: var(--space-2) 0 0;
    display: grid; grid-template-columns: 7.5rem minmax(0, 1fr) minmax(0, max-content); column-gap: var(--space-4);
  }
  .later li {
    grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; align-items: baseline;
    padding-block: var(--space-2); border-bottom: 1px solid var(--rule);
  }
  .later li:last-child { border-bottom: 0; }
  /* A row's date, a label: in the display capitals, as a tile's weekday and month are (#293). On now's two lines, a
     run's weekdays over its close, each its own line. */
  .later .when, .later .lead { grid-row: 1; }
  .later .when { font-family: var(--font-display); font-weight: 700; font-size: var(--text-2xs); letter-spacing: var(--tracking-label); text-transform: uppercase; color: var(--fg-muted); }
  .later .when > span { display: block; }
  /* Icon, then title, with a hanging indent: a wrapped title lines up under itself, not under the icon. */
  .later a { grid-row: 1; display: flex; align-items: baseline; color: var(--fg); font-weight: var(--weight-medium); }
  .later .where { grid-row: 1; font-size: var(--text-sm); color: var(--fg-muted); max-width: 18rem; text-wrap: pretty; }
  /* The pick tag (base.css's, in PickTag's markup, so global here) straight under the date, in the room a wrapped
     title or venue leaves; the started fold's rows have none, since nothing there is left to choose between. */
  .later .lead { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-1); }
  @media (max-width: 34rem) {
    /* The date column holds the widest pick tag ("Major run" and its diamond, 94 px); the venue drops under the title. */
    .later { grid-template-columns: 6rem minmax(0, 1fr); }
    .later .where { grid-column: 2; grid-row: 2; max-width: none; }
    /* The date and tag span both lines, so a tall date never pushes the venue off its title. */
    .later .lead { grid-row: 1 / span 2; }
  }
  /* The narrowest phones: date over title, so the title gets the whole line; the tag rides the date line. */
  @media (max-width: 24rem) {
    .later .lead { grid-column: 1 / -1; grid-row: 1; flex-flow: row wrap; align-items: baseline; gap: 0 var(--space-3); }
    .later a { grid-column: 1 / -1; grid-row: 2; }
    .later .where { grid-column: 1 / -1; grid-row: 3; }
  }
  .more { margin-top: var(--space-3); }
  /* Under a run of cards, the link stands off them as far as one card stands off the next. */
  .pick + .more, .started + .more { margin-top: var(--space-6); }
  /* Started picks: one line under the cards, open on request. No tile and no actions: there is nothing left to plan.
     The rows are the later list's; the titles step down to the muted ink, the kind icons keep their colour. */
  .started { margin-top: var(--space-6); border-top: 1px solid var(--rule); padding-top: var(--space-2); }
  .started.alone { border-top: 0; margin-top: var(--space-2); }
  .started summary {
    display: flex; align-items: center; gap: var(--space-2); min-height: var(--tap); width: fit-content;
    color: var(--fg-muted); font-size: var(--text-sm); font-weight: var(--weight-medium); cursor: pointer; list-style: none;
  }
  .started summary::-webkit-details-marker { display: none; }
  .started summary:hover { color: var(--fg); }
  .started summary :global(.ui-icon) { transition: transform 150ms var(--ease-out); }
  .started[open] summary :global(.ui-icon) { transform: rotate(90deg); }
  .started .later { margin-top: 0; }
  .started .later a { color: var(--fg-muted); }
  /* Its rows give a time, not a date, and a time stays in the text face's figures. */
  .started .later .when { font-family: var(--font); font-weight: var(--weight-regular); font-size: var(--text-sm); letter-spacing: 0; text-transform: none; }
  /* What kind of week it is, at a glance; each chip narrows the section to those picks (links to the explorer
     without JavaScript). */
  .kinds { list-style: none; padding: 0; margin: var(--space-3) 0 var(--space-2); display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .kinds :global(.chip) {
    font: inherit; font-size: var(--text-sm); font-weight: var(--weight-medium); line-height: 1.6;
    padding: var(--space-1) var(--space-3); border: 0; cursor: pointer; text-decoration: none; transition: filter 150ms var(--ease-out);
  }
  .kinds :global(.chip:hover) { filter: brightness(0.96) saturate(1.2); }
  /* Pressed, the chip fills with the kind's strong shade, the words in the page's colour: the same pair, reversed, so
     it clears AA wherever the chip does. */
  .kinds :global(.chip[aria-pressed="true"]) { background: var(--hue); color: var(--bg-raised); }
  /* Phones: 32 px, over WCAG 2.5.8's 24 px with room to spare for a finger (audit 2026-10-21, A5). */
  @media (max-width: 800px) { .kinds :global(.chip) { min-height: 2rem; } }
  /* Phones: one row that swipes sideways, as the explorer's kinds do, rather than three wrapped rows between the
     heading and the first card (the front page critique of 2026-11-24). It fades at its end until swiped there. */
  @media (max-width: 30rem) {
    .kinds { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: calc(var(--space-3) - 4px) -4px calc(var(--space-2) - 4px); padding: 4px; }
    .kinds li { flex: none; }
    @supports (animation-timeline: scroll()) {
      .kinds { mask-image: linear-gradient(to right, black calc(100% - var(--chips-fade)), transparent); animation: chips-end linear both; }
      .kinds.kinds { animation-timeline: scroll(self inline); } /* apart, or the minifier folds it into the shorthand */
    }
  }
  @property --chips-fade { syntax: "<length>"; inherits: false; initial-value: 0px; }
  @keyframes chips-end { from, 95% { --chips-fade: 1.5rem; } to { --chips-fade: 0px; } }
  /* Forced colours (Windows High Contrast) drop the tint, the chip's only edge, and the pressed fill (audit A4): an
     edge in the button colour, and pressed in the system's selection colours, the icon with its words. */
  @media (forced-colors: active) {
    .kinds :global(.chip) { border: 1px solid ButtonText; }
    .kinds :global(.chip[aria-pressed="true"]) { forced-color-adjust: none; color: HighlightText; background: Highlight; border-color: Highlight; }
  }
  /* All is no kind, so it takes the ink as its strong shade and the hairline as its tint. */
  .kinds .all { --hue: var(--fg); --hue-tint: var(--rule); }
  /* A kind's icon before a title in the one-line list, in the kind's colour. */
  .icon { flex: none; color: var(--hue); margin-right: var(--space-2); }
  @media (prefers-reduced-motion: reduce) { .kinds :global(.chip) { transition: none; } }
</style>
