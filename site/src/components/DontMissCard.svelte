<script lang="ts">
  import { meta } from "../generated/meta";
  import { formatDay, formatShort, formatTime, isDateOnly, localDate } from "../lib/dates";
  import { firstDay, hostOf, isMultiDay } from "../lib/events";
  import { closingLine } from "../lib/horizon";
  import { slugify } from "../lib/slugs";
  import type { PublishedEvent } from "../lib/types";
  import SaveButton from "./SaveButton.svelte";

  let { event, today }: { event: PublishedEvent; today: string } = $props();
  let dateLine = $derived(
    isMultiDay(event) ? closingLine(event, today) : `${formatDay(firstDay(event)!)}${isDateOnly(event.start!) ? "" : `, ${formatTime(event.start!)}`}`,
  );
  // Every event the last run reached was verified that day, which the header already says; a card speaks up only
  // when its own check is older than that.
  const runDay = localDate(meta.lastSuccessfulRun);
  let checked = $derived(localDate(event.lastVerified));
</script>

<article class="card">
  <p class="date">{dateLine}</p>
  <h3><a href={`/e/${event.id}`}>{event.title}</a></h3>
  <div class="save"><SaveButton id={event.id} title={event.title} large /></div>
  <p class="why">{event.whyLine}</p>
  <p class="meta">
    <span>{event.venue}, {event.neighborhood}</span>
    <span class="chip" style={`--hue: var(--kind-${slugify(event.kind)})`}>{event.kind}</span>
    <a class="primary" href={event.primaryUrl} rel="noopener">{hostOf(event.primaryUrl)}</a>
    {#if checked < runDay}<span class="verified">Verified {formatShort(checked)}</span>{/if}
  </p>
</article>

<style>
  /* Date and title on the left, Save beside them on the right; the why-line and the details run full width beneath. */
  .card {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "date save" "title save" "why why" "meta meta";
    column-gap: var(--space-4); margin-block: var(--space-8);
  }
  .date { grid-area: date; font-size: var(--text-sm); color: var(--fg-muted); }
  h3 { grid-area: title; font-family: var(--font-voice); font-size: var(--text-xl); letter-spacing: var(--tracking-heading); line-height: var(--leading-tight); text-wrap: pretty; }
  h3 a { color: inherit; }
  /* The save slot keeps its width before the button mounts, so the title never re-wraps when it appears. */
  .save { grid-area: save; align-self: start; min-width: 4.5rem; display: flex; justify-content: flex-end; }
  /* The why-line is the site's voice: the serif's text cut, a size under the title, the fullest colour on the card. */
  .why { grid-area: why; margin-top: var(--space-2); font-family: var(--font-voice); font-size: var(--text-lg); line-height: 1.55; max-width: 38rem; }
  .meta {
    grid-area: meta; margin-top: var(--space-2);
    display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-3);
    font-size: var(--text-sm); color: var(--fg-muted);
  }
  .primary { color: var(--fg-muted); text-decoration: underline; text-decoration-color: var(--rule-strong); }
  .primary:hover { color: var(--accent); text-decoration-color: currentColor; }
  .verified { color: var(--fg-faint); }
</style>
