<script lang="ts">
  import { reasonWord } from "../lib/events";
  import type { PickReason } from "../lib/types";

  // The pick tag: a small Flag Carmine diamond, then the pick's reason in the display capitals, in ink (base.css's
  // .dont-miss; #273, ADR 0014). One mark for all six words, so the diamond says pick and the word says why
  // (DESIGN.md, A-Pick-Is-A-Point); the word is written in sentence case and set in capitals by the stylesheet, and a
  // screen reader hears "Pick:" first, since the word alone does not say what the tag is. A pick with no reason, which
  // the schema no longer allows, reads "Pick". `class` adds a row's on-date or on-title.
  let { reason, class: cls = "" }: { reason?: PickReason; class?: string } = $props();
</script>

<span class={`dont-miss ${cls}`.trim()}>{#if reason}<span class="visually-hidden">{"Pick: "}</span>{reasonWord(reason)}{:else}Pick{/if}</span>
