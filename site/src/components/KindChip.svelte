<script lang="ts">
  import { slugify } from "../lib/slugs";
  import KindIcon from "./KindIcon.svelte";

  // The kind as a filled pill: its icon and name in the kind's strong shade, on its tint. `href` makes it a link;
  // `onclick` makes it a toggle button, pressed or not. `tabindex` takes a link out of the Tab order (a result row's).
  let { kind, label = kind, href, tabindex, pressed = false, onclick }: { kind: string; label?: string; href?: string; tabindex?: number; pressed?: boolean; onclick?: () => void } =
    $props();
</script>

{#if onclick}
  <button type="button" class={`chip kind-${slugify(kind)}`} aria-pressed={pressed} {onclick}><KindIcon {kind} />{label}</button>
{:else if href}
  <a class={`chip kind-${slugify(kind)}`} {href} {tabindex}><KindIcon {kind} />{label}</a>
{:else}
  <span class={`chip kind-${slugify(kind)}`}><KindIcon {kind} />{label}</span>
{/if}
