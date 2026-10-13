<script lang="ts">
  import { onMount } from "svelte";
  import { shareLink, type ShareData } from "../lib/share";
  import UiIcon from "./UiIcon.svelte";

  // `data` is read at the click, so a list that changes after mount (the saved set) shares as it is then. `large` is
  // the event page's look, a 44 px button beside Add to calendar; without it, the explorer bar's small one.
  let { label, data, disabled = false, large = false }: { label: string; data: () => ShareData; disabled?: boolean; large?: boolean } = $props();
  // Sharing needs the browser, so the button renders only once mounted: without JavaScript there is no button that
  // does nothing.
  let mounted = $state(false);
  onMount(() => { mounted = true; });

  // What came of the last click, said beside the button: "Link copied", or the link itself when it could not be copied.
  let note = $state<{ copied: true } | { failed: string } | undefined>();
  let clear: ReturnType<typeof setTimeout> | undefined;

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
  <span class="share-wrap">
    <button type="button" class="share" class:large {disabled} onclick={share}>{#if large}<UiIcon name="share" />{/if}{label}</button>
    <!-- A live region that is there before anything is said in it, so the confirmation is announced. -->
    <span class="note" aria-live="polite">{#if note !== undefined}{#if "copied" in note}Link copied{:else}Copy this link: <span class="url">{note.failed}</span>{/if}{/if}</span>
  </span>
{/if}

<style>
  .share-wrap { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
  .share {
    display: inline-flex; align-items: center; gap: var(--space-2);
    font: inherit; font-size: var(--text-xs); color: var(--accent); background: none;
    border: 1px solid var(--rule); border-radius: var(--radius); padding: var(--space-1) var(--space-2); cursor: pointer;
  }
  .share[disabled] { opacity: 0.5; cursor: default; }
  /* The event page's pair: the same button as Add to calendar beside it. */
  .large {
    min-height: var(--tap); padding-inline: var(--space-3); border-color: var(--control-border); background: var(--bg-raised);
    color: var(--fg); font-size: var(--text-sm); font-weight: var(--weight-medium);
  }
  .large:hover { border-color: var(--fg-faint); }
  .note { font-size: var(--text-xs); color: var(--fg-muted); }
  .url { user-select: all; overflow-wrap: anywhere; color: var(--fg); }
</style>
