<script lang="ts">
  import { slugify } from "../lib/slugs";

  // Decorative: the kind's name is always written beside it. Draws from the sprite in KindIconSprite (in every
  // page's layout), so the explorer's 500 rows carry a short reference each rather than a full SVG.
  let { kind }: { kind: string } = $props();
  // Kinds come from the config, and the sprite has one symbol for each (a test holds them in step).
  let id = $derived(`kind-icon-${slugify(kind)}`);
</script>

<svg class="kind-icon" aria-hidden="true" focusable="false"><use href={`#${id}`} /></svg>

<style>
  /* Sized by the text around it, sitting on the text's centre line. */
  .kind-icon { display: inline-block; width: 1.15em; height: 1.15em; flex: none; vertical-align: -0.2em; }
</style>
