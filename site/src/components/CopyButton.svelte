<script lang="ts">
  import { onMount } from "svelte";

  // One tap to copy an address (#188): ShareButton's copy path without its share sheet, written out here so the front
  // page does not split the share module into a chunk of its own. Copying needs the browser, so the button renders
  // only once mounted; the page shows the address itself either way. It is base.css's .control, the size of every
  // other button a tap can reach.
  // failed: what to say when the clipboard refuses, pointing at where the page shows the address.
  let { label, url, failed = "Could not copy; select the address instead" }: { label: string; url: string; failed?: string } = $props();
  let mounted = $state(false);
  let note = $state<"copied" | "failed" | undefined>();
  let clear: ReturnType<typeof setTimeout> | undefined;
  onMount(() => {
    mounted = true;
    return () => clearTimeout(clear);
  });

  async function copy() {
    clearTimeout(clear);
    try {
      await navigator.clipboard.writeText(url);
      note = "copied";
    } catch {
      // No clipboard (an insecure origin, an old browser) or a refusal: the reader selects the address instead.
      note = "failed";
    }
    if (note === "copied") clear = setTimeout(() => { note = undefined; }, 3000);
  }
</script>

{#if mounted}
  <span class="copy-wrap">
    <button type="button" class="control" onclick={copy}>{label}</button>
    <span class="note" aria-live="polite">{#if note === "copied"}Address copied{:else if note === "failed"}{failed}{/if}</span>
  </span>
{/if}

<style>
  .copy-wrap { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
  .note { font-size: var(--text-xs); color: var(--fg-muted); }
</style>
