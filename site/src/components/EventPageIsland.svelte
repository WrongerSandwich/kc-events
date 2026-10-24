<script lang="ts">
  import CalendarChoice from "./CalendarChoice.svelte";
  import SaveButton from "./SaveButton.svelte";
  import ShareButton from "./ShareButton.svelte";
  import { islandClock } from "./clock.svelte";

  // `shareText` is the event's date line and venue, what a shared link says under its title. `ics` is the event's
  // calendar file, absent for a recurring event, which has no dates to put in one; `google` its Google Calendar link.
  let { id, title, lastDay, shareText, ics, google }: { id: string; title: string; lastDay?: string; shareText: string; ics?: string; google?: string } = $props();
  // The build's date as rendered; the visitor's, kept current, once mounted.
  const clock = islandClock();
  let passed = $derived(lastDay !== undefined && lastDay < clock.today);

  // A shared link outlives its event, so the page says so above its title, before anything else: the page's .passed
  // block, which this fills and shows (its status is written, not just revealed, so a screen reader hears it). The page's
  // CSS then greys the tile and drops the ways to go and to add it to a calendar. One island rather than a second one
  // above the title: two islands sharing the clock split it into chunks of its own on every page that loads it.
  $effect(() => {
    const block = document.querySelector<HTMLElement>(".event .passed");
    if (!block) return;
    block.hidden = !passed;
    block.querySelector("[role=status]")!.textContent = passed ? "This has already happened. The page stays up until the next weekly run." : "";
  });
</script>

<SaveButton {id} {title} last={lastDay} />
<!-- The page's own origin, so a preview deployment shares its own link. -->
<ShareButton label="Share" large data={() => ({ title, text: shareText, url: `${location.origin}/e/${id}` })} />
{#if ics !== undefined}<CalendarChoice {ics} {google} {title} />{/if}
