<script lang="ts">
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
</script>

<article class="card" style={`--hue: var(--kind-${slugify(event.kind)})`}>
  <p class="date">{dateLine}</p>
  <h3><a href={`/e/${event.id}`}>{event.title}</a></h3>
  <p class="why">{event.whyLine}</p>
  <p class="meta">
    <span>{event.venue} · {event.neighborhood}</span>
    <span class="chip">{event.kind}</span>
    <a class="primary" href={event.primaryUrl} rel="noopener">{hostOf(event.primaryUrl)}</a>
    <SaveButton id={event.id} title={event.title} />
    <span class="verified">Verified {formatShort(localDate(event.lastVerified))}</span>
  </p>
</article>

<style>
  .card { border-left: 3px solid var(--hue); padding: var(--space-2) 0 var(--space-2) var(--space-4); margin-block: var(--space-4); }
  .date { margin: 0; font-size: var(--text-sm); color: var(--fg-muted); }
  h3 { margin: 0; font-size: var(--text-xl); line-height: var(--leading-tight); }
  h3 a { color: inherit; text-decoration: none; }
  h3 a:hover { text-decoration: underline; }
  .why { margin: var(--space-1) 0 var(--space-2); font-size: var(--text-lg); }
  .meta { margin: 0; display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-3); align-items: center; font-size: var(--text-xs); color: var(--fg-faint); }
</style>
