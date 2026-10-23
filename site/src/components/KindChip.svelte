<script lang="ts">
  import { slugify } from "../lib/slugs";
  import KindIcon from "./KindIcon.svelte";

  // The kind as a filled pill: its icon and name in the kind's strong shade, on its tint. `onclick` makes it a toggle
  // button, pressed or not; otherwise it is a link to `href`, never an inert pill that looks like one you can press
  // (#181). `tabindex` -1 keeps a row's chip out of the Tab order.
  let { kind, label = kind, href, pressed = false, onclick, tabindex }: { kind: string; label?: string; href?: string; pressed?: boolean; onclick?: () => void; tabindex?: number } =
    $props();
</script>

{#if onclick}
  <button type="button" class={`chip kind-${slugify(kind)}`} aria-pressed={pressed} {onclick}><KindIcon {kind} />{label}</button>
{:else}
  <a class={`chip kind-${slugify(kind)}`} {href} {tabindex}><KindIcon {kind} />{label}</a>
{/if}
