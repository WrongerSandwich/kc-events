<script lang="ts">
  import UiIcon from "./UiIcon.svelte";

  // One Add to calendar on the event page, opening its two ways: the .ics file (Apple Calendar, Outlook, most others)
  // and Google Calendar's template link, which Android needs since it opens no .ics (#188). A <details>, so it opens
  // before hydration and without JavaScript; once mounted it also closes on a choice, a click elsewhere, or Esc. Nothing
  // goes to Google until its link is tapped.
  let { ics, google, title }: { ics: string; google?: string; title: string } = $props();
  let menu: HTMLDetailsElement;

  function outside(click: MouseEvent): void {
    if (menu.open && !menu.contains(click.target as Node)) menu.open = false;
  }

  function escape(key: KeyboardEvent): void {
    if (key.key !== "Escape" || !menu.open) return;
    menu.open = false;
    menu.querySelector("summary")!.focus();
  }
</script>

<svelte:document onclick={outside} onkeydown={escape} />

<details class="calendar" bind:this={menu}>
  <summary class="control"><UiIcon name="calendar-plus" />Add to calendar<span class="visually-hidden">: {title}</span></summary>
  <ul>
    <li><a href={ics} download onclick={() => (menu.open = false)}>Apple, Outlook and others (.ics)</a></li>
    {#if google !== undefined}<li><a href={google} rel="nofollow" onclick={() => (menu.open = false)}>Google Calendar</a></li>{/if}
  </ul>
</details>

<style>
  /* The menu hangs from the nearest positioned ancestor (the event page's action row), not from the button: the button
     ends the row, so a menu under it would run off a phone's right edge. */
  .calendar { position: static; }
  summary { list-style: none; }
  summary::-webkit-details-marker { display: none; }
  ul {
    position: absolute; z-index: 2; top: calc(100% + var(--space-1)); left: var(--space-3);
    margin: 0; padding: var(--space-1); list-style: none;
    background: var(--bg-raised); border: 1px solid var(--control-border); border-radius: var(--radius);
    box-shadow: 0 4px 16px oklch(0 0 0 / 0.12);
  }
  a {
    display: flex; align-items: center; min-height: var(--tap); padding: 0 var(--space-3);
    color: var(--fg); font-size: var(--text-sm); white-space: nowrap; border-radius: calc(var(--radius) - 2px);
  }
  a:hover { background: var(--hue-tint); text-decoration: none; }
</style>
