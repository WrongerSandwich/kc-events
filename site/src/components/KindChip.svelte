<script lang="ts">
  import { kindLabel, slugify } from "../lib/slugs";
  import KindIcon from "./KindIcon.svelte";

  // The kind in its strong shade, icon and name. `onclick` makes it a toggle button, a pill on the kind's tint, pressed
  // or not, as every filter is; otherwise it is a link to `href`, the icon and words alone, so it is never taken for a
  // filter that would narrow the list it sits in (#181, the 2026-10-24 explorer critique). `filter` keeps a link's pill
  // where the link stands in for a toggle (the front page's kinds before they hydrate). `tabindex` -1 keeps a row's
  // chip out of the Tab order.
  let { kind, label = kindLabel(kind), href, pressed = false, onclick, filter = false, tabindex }: {
    kind: string; label?: string; href?: string; pressed?: boolean; onclick?: () => void; filter?: boolean; tabindex?: number;
  } = $props();
</script>

{#if onclick}
  <button type="button" class={`chip kind-${slugify(kind)}`} aria-pressed={pressed} {onclick}><KindIcon {kind} />{label}</button>
{:else}
  <a class={`chip kind-${slugify(kind)}`} class:plain={!filter} {href} {tabindex}><KindIcon {kind} />{label}</a>
{/if}
