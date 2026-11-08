<script lang="ts">
  import { reasonWord } from "../lib/events";
  import type { PickReason } from "../lib/types";

  // The pick tag: a solid Flag Carmine pill (base.css's .dont-miss) with the pick's reason in white (#273, ADR 0014).
  // One fill for all six words, so the colour says pick and the word says why (DESIGN.md, Solid-Means-State); a
  // screen reader hears "Pick:" first, since the word alone does not say what the tag is. A pick with no reason, which
  // the schema no longer allows, reads "Pick". `class` adds a row's on-date or on-title.
  let { reason, class: cls = "" }: { reason?: PickReason; class?: string } = $props();
</script>

<span class={`dont-miss ${cls}`.trim()}>{#if reason}<span class="visually-hidden">{"Pick: "}</span>{reasonWord(reason)}{:else}Pick{/if}</span>
