<script lang="ts">
  import { onMount } from "svelte";
  import { saves } from "../lib/saves";
  import UiIcon from "./UiIcon.svelte";

  // One Save everywhere (#181): base.css's .control, a bookmark and a word, on a card, a row and the event page; a
  // desktop row slims the box itself. `last` is the event's last day, stored with the save so the header's count can
  // leave it out once it has passed. `when` is the event's day, said in the name so the same title on two dates reads
  // as two saves.
  let { id, title, last, when }: { id: string; title: string; last?: string; when?: string } = $props();
  // Saving needs the browser's storage, so the button renders only once mounted: without JavaScript there is no
  // button that does nothing. The store is read on mount so the server never touches storage.
  let mounted = $state(false);
  let saved = $state(false);
  onMount(() => {
    mounted = true;
    // A save made before last days were stored (v1), or one whose date has moved, takes this page's last day.
    saves().refresh(new Map([[id, last]]));
    return saves().subscribe((ids) => { saved = ids.has(id); });
  });
</script>

{#if mounted}
  <!-- The name is the visible word, then the title and day out of sight: "Save A show, Fri Oct 9", and "Saved …" once
       pressed, so what is said is what is shown (WCAG 2.5.3). -->
  <button type="button" class="control save" aria-pressed={saved} onclick={() => saves().toggle(id, last)}>
    <UiIcon name={saved ? "bookmark-check" : "bookmark"} />{saved ? "Saved " : "Save "}<span class="visually-hidden">{title}{when ? `, ${when}` : ""}</span>
  </button>
{/if}

<style>
  /* Wide enough for "Saved", so pressing it does not move what follows. */
  .save { min-width: 5.5rem; }
</style>
