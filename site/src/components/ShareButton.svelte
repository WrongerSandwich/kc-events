<script lang="ts">
  import { onMount } from "svelte";
  import { shareLink, type ShareData } from "../lib/share";
  import UiIcon from "./UiIcon.svelte";

  // `data` is read at the click, so a list that changes after mount (the saved set) shares as it is then. `large` is
  // the event page's base.css .control beside Save and Add to calendar; without it, the explorer bar's .control.small.
  let { label, data, disabled = false, large = false }: { label: string; data: () => ShareData; disabled?: boolean; large?: boolean } = $props();
  // Sharing needs the browser, so the button renders only once mounted: without JavaScript there is no button that
  // does nothing.
  let mounted = $state(false);
  // What came of the last click, said beside the button: "Link copied", or the link itself when it could not be copied.
  let note = $state<{ copied: true } | { failed: string } | undefined>();
  let clear: ReturnType<typeof setTimeout> | undefined;
  onMount(() => {
    mounted = true;
    return () => clearTimeout(clear);
  });

  async function share() {
    clearTimeout(clear);
    note = undefined;
    const d = data();
    const outcome = await shareLink(d);
    if (outcome === "copied") {
      note = { copied: true };
      clear = setTimeout(() => { note = undefined; }, 3000);
    } else if (outcome === "failed") {
      note = { failed: d.url };
    }
  }
</script>

{#if mounted}
  <!-- The button and its note are the row's own items (the wrapper is display: contents): the note, once it says
       something, takes a line of its own under the row, so the buttons keep their gaps and their line (#181). -->
  <span class="share-wrap">
    <button type="button" class="control share" class:small={!large} {disabled} onclick={share}><UiIcon name="share" />{label}</button>
    <!-- A live region that is there before anything is said in it, so the confirmation is announced. -->
    <span class="note" aria-live="polite">{#if note !== undefined}{#if "copied" in note}Link copied{:else}Copy this link: <span class="url">{note.failed}</span>{/if}{/if}</span>
  </span>
{/if}

<style>
  .share-wrap { display: contents; }
  /* Empty, the live region is out of the flow, so it adds no gap; once it speaks, it is the row's last line. */
  .note { order: 1; flex: 1 0 100%; font-size: var(--text-xs); color: var(--fg-muted); }
  .note:empty { position: absolute; }
  .url { user-select: all; overflow-wrap: anywhere; color: var(--fg); }
</style>
