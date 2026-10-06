<script lang="ts">
  import { slugify } from "../lib/slugs";
  import KindIcon from "./KindIcon.svelte";

  // The kind as a filled pill: its icon and name in the kind's strong shade, on its tint. `href` makes it a link.
  let { kind, label = kind, href }: { kind: string; label?: string; href?: string } = $props();
</script>

{#if href}
  <a class={`chip kind-${slugify(kind)}`} {href}><KindIcon {kind} />{label}</a>
{:else}
  <span class={`chip kind-${slugify(kind)}`}><KindIcon {kind} />{label}</span>
{/if}
