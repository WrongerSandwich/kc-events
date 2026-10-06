<script lang="ts">
  import type { UiIconName } from "../lib/ui-icons";

  // Decorative: always beside words, or inside a control that carries its own accessible name.
  let { name }: { name: UiIconName } = $props();
</script>

<svg class="ui-icon" aria-hidden="true" focusable="false"><use href={`#ui-icon-${name}`} /></svg>

<style>
  .ui-icon { display: inline-block; width: 1.1em; height: 1.1em; flex: none; vertical-align: -0.18em; }
</style>
