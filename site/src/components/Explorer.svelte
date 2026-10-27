<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { events } from "../generated/events";
  import { meta } from "../generated/meta";
  import { downloadText } from "../lib/download";
  import { exportName } from "../lib/export-name";
  import { isDated, isPast, lastDay } from "../lib/events";
  import { facetCounts, keepGoing, matches, shownPreset } from "../lib/filter";
  import { formatDay } from "../lib/dates";
  import { groupResults, isTrailingGroup, PASSED_GROUP, resultEvents, SHORTLIST_GROUP } from "../lib/group";
  import { toIcs } from "../lib/ics";
  import { DEFAULT_FILTERS, EVERY_DATE, filterPills, isDefault, isImpliedWhen, parseQuery, shortlistQuery, toQuery, WHEN_LABELS, type Filters } from "../lib/query";
  import { saves } from "../lib/saves";
  import { shortcutsOn } from "../lib/shortcuts";
  import { kindLabel, slugify } from "../lib/slugs";
  import { siteConfig } from "../site.config";
  import FilterRail from "./FilterRail.svelte";
  import KindIcon from "./KindIcon.svelte";
  import ResultRow from "./ResultRow.svelte";
  import ShareButton from "./ShareButton.svelte";
  import UiIcon from "./UiIcon.svelte";
  import { islandClock } from "./clock.svelte";

  const kindsAndRegions = { kinds: meta.kinds, regions: meta.regions };
  // Server-rendered with the build's date and default filters; the visitor's take over on mount (the hydration rule),
  // and the date stays current through the shared clock (clock.svelte.ts).
  const clock = islandClock();
  let today = $derived(clock.today);
  let filters = $state<Filters>(DEFAULT_FILTERS);
  let saved = $state<ReadonlySet<string>>(new Set());
  // The phone layout's filter sheet. Closed in the server HTML too, so the results are on screen from first paint; wide
  // layouts show the rail whatever this says.
  let sheetOpen = $state(false);
  // Export needs the browser; the server-rendered button stays disabled until mount.
  let mounted = $state(false);
  // The `/` shortcut, unless the reader turned it off on the About page; read on mount, so the server HTML has it on.
  let shortcut = $state(true);
  // The bar's height, so the sticky group headings sit just under it however it wraps (search takes a line on phones).
  let barHeight = $state(0);
  // On phones the bar's search line scrolls away once it is stuck (a negative top, --bar-top on the root, set in CSS
  // so it follows a rotation or a focused search on its own), so only the lines under it stick. Read when it is
  // needed; registered as a length, so it reads in px.
  const barTop = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar-top")) || 0;
  // The bar is sticky, and a sticky day heading (about 2.5rem) sits under it, so a row the browser scrolls to the
  // viewport's top edge on focus or by anchor would land under both. The document's scroll padding keeps it clear
  // (audit 2026-10-21, A1); base.css carries a one-line estimate for before this measures, and without JavaScript.
  $effect(() => {
    document.documentElement.style.scrollPaddingTop = barHeight > 0 ? `calc(${barHeight}px + var(--bar-top, 0px) + 2.5rem)` : "";
    return () => { document.documentElement.style.scrollPaddingTop = ""; };
  });
  // A shortlist link none of whose events is still to come parses to no shortlist; say so until the next change, so
  // the full list it opens on is not taken for the shortlist.
  let shortlistGone = $state(false);
  let bar: HTMLElement;
  let search: HTMLInputElement;
  let pillList: HTMLElement | undefined = $state();
  let results: HTMLElement;
  let keepBlock: HTMLElement | undefined = $state();

  onMount(() => {
    // A shortlist keeps only the ids of events still to come, so its pill counts what it can show.
    const ids = events.filter((e) => !isPast(e, today)).map((e) => e.id);
    const params = new URLSearchParams(location.search);
    filters = parseQuery(params, { ...kindsAndRegions, ids });
    shortlistGone = (params.get("ids") ?? "") !== "" && filters.ids.length === 0;
    // The explorer has every event, so it brings each save's last day up to this build's (a migrated save has none).
    saves().refresh(new Map(events.map((e) => [e.id, lastDay(e)])));
    const unsubscribe = saves().subscribe((s) => { saved = new Set(s.keys()); });
    shortcut = shortcutsOn();
    mounted = true;
    // The explore page hides a filtered link's explorer until its own slice is on screen; show it once this render lands.
    void tick().then(() => { delete document.documentElement.dataset.slice; showLinkedKind(); });
    return unsubscribe;
  });

  function setFilters(next: Filters) {
    filters = next;
    shortlistGone = false;
    const q = toQuery(next);
    history.replaceState(null, "", q === "" ? location.pathname : `${location.pathname}?${q}`);
  }

  // A link's plain left click, which the explorer takes in place; one that asks for a new tab or window is left to it.
  const inPlace = (then: () => unknown) => (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void then();
  };

  // Keep going (#183) adds days below where the reader is: the first new day takes the button's place on screen, and
  // focus, so the next Tab goes on through it.
  async function goOn(next: Filters) {
    const was = keepBlock?.getBoundingClientRect().top;
    const shown = new Set(groups.map((g) => g.key));
    setFilters(next);
    await tick();
    const first = groups.find((g) => !shown.has(g.key) && !isTrailingGroup(g));
    const heading = first === undefined ? null : results.querySelector<HTMLElement>(`[data-group="${first.key}"]`);
    if (heading === null) return;
    if (was !== undefined) window.scrollBy({ top: heading.getBoundingClientRect().top - was, behavior: "instant" });
    // A day's heading takes focus only from here; a collapsed group's summary is in the Tab order already.
    if (heading.tagName !== "SUMMARY") heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }

  async function change(next: Filters) {
    setFilters(next);
    // Scrolled past the results' top, a new slice would open mid-list; bring its first result up under the bar. The
    // bar is measured now, not through barHeight, which lags a pill that has just wrapped it onto another line.
    await tick();
    const below = results.getBoundingClientRect().top - bar.offsetHeight - barTop();
    if (below < 0) window.scrollBy({ top: below, behavior: "instant" });
  }

  // A removed pill takes its button, and keyboard focus with it; hand focus to the pill that took its place, the one
  // before it, or search when none is left.
  async function removePill(index: number, without: Filters) {
    await change(without);
    const left = pillList?.querySelectorAll("button") ?? [];
    (left[Math.min(index, left.length - 1)] ?? search).focus();
  }

  // Filters is in the bar, the sheet after the pills: opened, focus goes to its first control, so the next Tab or
  // swipe is in the sheet rather than on the pills between them.
  async function toggleSheet() {
    sheetOpen = !sheetOpen;
    if (!sheetOpen) return;
    await tick();
    // The first shown (the sheet's controls vary with the day and the width).
    [...document.querySelectorAll<HTMLElement>("#filter-sheet button")].find((b) => b.offsetParent !== null)?.focus();
  }

  // The phone sheet's Show button: close the sheet, bring the results' top up under the bar, and focus them, so the
  // next swipe or Tab starts at the first row rather than where the button was.
  async function showResults() {
    sheetOpen = false;
    await tick();
    window.scrollBy({ top: results.getBoundingClientRect().top - bar.offsetHeight - barTop(), behavior: "instant" });
    results.focus({ preventScroll: true });
  }

  // Where a / is typed rather than taken as the shortcut: a field that takes text. A checkbox or a select does not.
  const TEXT_ENTRY = "textarea, input:not([type=checkbox], [type=radio], [type=button], [type=submit], [type=reset], [type=range], [type=color], [type=file])";
  const isTextEntry = (target: EventTarget | null) => target instanceof HTMLElement && (target.matches(TEXT_ENTRY) || target.isContentEditable);

  // `/` jumps to search from anywhere but a text field; with Ctrl, Cmd or Alt it is someone else's.
  function focusSearch(e: KeyboardEvent) {
    if (!shortcut || e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.defaultPrevented || isTextEntry(e.target)) return;
    e.preventDefault();
    search.focus();
  }

  // A chip or box tabbed to at the screen's foot sits under the sheet's sticky Show button, and the browser, which
  // counts it as on screen, does not scroll (WCAG 2.4.11; the 2026-10-24 audit): scroll it clear, a space above. A
  // click on a chip half under the button nudges the page the same few px.
  function clearShowResults(e: FocusEvent) {
    const button = (e.currentTarget as HTMLElement).querySelector<HTMLElement>(".show-results");
    if (!(e.target instanceof HTMLElement) || button === null || e.target === button || getComputedStyle(button).position !== "sticky") return;
    const under = e.target.getBoundingClientRect().bottom - button.getBoundingClientRect().top;
    if (under > 0) window.scrollBy({ top: under + 8, behavior: "instant" });
  }

  // Esc clears a search, then leaves it. Prevented, so the field's own Esc clear does not run alongside; an Esc that
  // cancels an input method's composition is left to it.
  function escapeSearch(e: KeyboardEvent) {
    if (e.key !== "Escape" || e.isComposing) return;
    e.preventDefault();
    if (filters.q === "") search.blur();
    else void change({ ...filters, q: "" });
  }

  let groups = $derived(groupResults(events, filters, today, saved));
  // Under the date sort only, after the last dated day, above Always there and Already happened; the venue sort has no
  // days to follow.
  let more = $derived(filters.sort === "date" ? keepGoing(events, filters, today, saved) : undefined);
  let moreAt = $derived.by(() => {
    const i = groups.findIndex(isTrailingGroup);
    return i === -1 ? groups.length : i;
  });
  let listed = $derived(resultEvents(groups));
  let count = $derived(listed.length);
  let countText = $derived(`${count} ${count === 1 ? "event" : "events"}`);
  // Every filter in words, the date's named as the rail names it today (the week is "This weekend" on a Friday).
  let allPills = $derived(filterPills(filters).map((p) => {
    const shown = p.when === true ? shownPreset(filters.when, today) : undefined;
    return shown === undefined ? p : { ...p, label: WHEN_LABELS[shown] };
  }));
  // The date the URL leaves out (the week) is what the page opens on, not a filter the reader set: the count says it
  // ("97 events this week") rather than a pill whose removal would widen to every date, and Filters (n) leaves it out.
  let impliedWhen = $derived(isImpliedWhen(filters) ? allPills.find((p) => p.when === true) : undefined);
  let pills = $derived(allPills.filter((p) => p !== impliedWhen));
  // A shared link's kind, off the end of the phone bar's swiping row, is scrolled into view on mount, without moving the
  // page; only then, so a chip tapped further along never sends the row back to an earlier one.
  let barKinds: HTMLElement;
  function showLinkedKind() {
    if (!barKinds) return; // unmounted before the tick
    const on = barKinds.children[meta.kinds.findIndex((k) => filters.kinds.includes(k))];
    if (on === undefined) return;
    const row = barKinds.getBoundingClientRect(), chip = on.getBoundingClientRect();
    if (chip.right > row.right || chip.left < row.left) barKinds.scrollLeft += chip.left - row.left - 4;
  }
  let sliceText = $derived(impliedWhen === undefined ? countText : `${countText} ${impliedWhen.label.toLowerCase()}`);
  // The filters set in the sheet; search is in the bar, above it, and so are the kinds on phones (wide windows have no
  // Filters button).
  let sheetCount = $derived(pills.filter((p) => p.without.q === filters.q && p.kind === undefined).length);
  // Each kind's and region's chip, counted for the rest of the filters (facetCounts).
  let counts = $derived(facetCounts(events, filters, today, saved));
  // Nothing matches: each filter whose removal alone lists something, the most first, at most three (the empty state).
  let ways = $derived(count > 0 ? [] : allPills
    .map((p) => ({ p, n: events.filter((e) => matches(e, p.without, today, saved)).length }))
    .filter((w) => w.n > 0).sort((a, b) => b.n - a.n).slice(0, 3));
  // The count on screen follows every keystroke; the live region waits until input settles, so a screen reader hears
  // one count per search, not one per letter. Every change restarts the wait, even one that leaves the count alone.
  const SETTLE_MS = 500;
  // Seeded with the first count on purpose (untracked): the region starts out saying what is on screen, and the effect
  // below, not this seed, follows every later change.
  // A filter that lists nothing says why, as the empty state does.
  let matchText = $derived(allPills.map((p) => p.label).join(" · "));
  let statusText = $derived(count === 0 && allPills.length > 0 ? `No events match ${matchText}` : sliceText);
  let announced = $state(untrack(() => statusText));
  $effect(() => {
    void filters;
    const text = statusText;
    const settle = setTimeout(() => { announced = text; }, SETTLE_MS);
    return () => clearTimeout(settle);
  });
  // A passed save (the saved view lists them) has nothing left to put in a calendar.
  let exportable = $derived(listed.filter((e) => isDated(e) && !isPast(e, today)));
  // Named after the slice (#190): "KC This Week · Comedy" in kc-this-week-comedy.ics.
  let exportAs = $derived(exportName(filters, siteConfig.name));

  // Above this many, the export asks first (#186): iOS adds a whole file's events in one tap, and the default view is
  // hundreds.
  const ASK_ABOVE = 50;

  function exportIcs(filename: string, list: typeof events, calendarName: string) {
    if (list.length > ASK_ABOVE && !confirm(`Add ${list.length} events to your calendar? They come as one file, and most calendars add them all at once.`)) return;
    // new Date() is fine here: this is a component, not lib/ (the no-clock grep covers lib only).
    downloadText(filename, toIcs(list, { siteName: siteConfig.name, stamp: new Date().toISOString(), calendarName }), "text/calendar");
  }

  // The saved view's Share and Export (#132) take every save still to come, in date order, whatever else the view
  // narrows to: what is saved is the list, the view's filters only how it is looked at.
  let upcomingSaves = $derived(resultEvents(groupResults(events, { ...DEFAULT_FILTERS, when: EVERY_DATE, saved: true, recurring: true }, today, saved)).filter((e) => !isPast(e, today)));
  const savedName = `${siteConfig.name} · saved`;

  function shareSaved() {
    return { title: savedName, url: `${location.origin}/explore?${shortlistQuery(upcomingSaves.map((e) => e.id))}` };
  }


</script>

<svelte:window onkeydown={focusSearch} />

<!-- The bar comes first so search is the explorer's first Tab stop, and its skip link the second; the grid puts the
     filter rail beside it on wide windows and under it on phones, outside the filter sheet. -->
<div class="explorer" style={barHeight > 0 ? `--bar-height: calc(${barHeight}px + var(--bar-top, 0px))` : undefined}>
  <div class="bar" bind:this={bar} bind:offsetHeight={barHeight}>
    <label class="search"><span class="visually-hidden">Search</span><input type="search" bind:this={search} value={filters.q} oninput={(e) => change({ ...filters, q: e.currentTarget.value })} onkeydown={escapeSearch} aria-keyshortcuts={shortcut ? "/" : undefined} placeholder="Search events, venues, places" />{#if mounted && shortcut}<kbd class="hint" aria-hidden="true">/</kbd>{/if}</label>
    <a class="skip" href="#results">Skip to results</a>
    <!-- Rows are two Tab stops each, so a week is hundreds of stops from Keep going and the footer (audit 2026-10-21,
         A8): this one lands after the last dated row. -->
    {#if count > 0}<a class="skip" href="#past-results">Skip past results</a>{/if}
    <!-- Phones: the kinds are the lens (the 2026-10-25 critique, as Evan turned it: the list is in date order already,
         and the picks are the front page's), a row of the rail's kind toggles that swipes sideways, Filters at its end;
         the sheet keeps the dates, regions and switches. Wide windows have the rail's Kind group in view instead. -->
    <!-- A chip tabbed to half past the row's edge is brought fully in, clear of the fade (Chromium leaves a partly
         visible one where it is). -->
    <div class="bar-kinds" role="group" aria-label="Kinds" bind:this={barKinds} onfocusin={(e) => (e.target as HTMLElement).scrollIntoView({ block: "nearest", inline: "nearest" })}>
      {#each meta.kinds as k (k)}
        {@const n = counts.kinds.get(k) ?? 0}
        <button type="button" class={`kind kind-${slugify(k)}`} class:none={n === 0} aria-pressed={filters.kinds.includes(k)} onclick={() => change({ ...filters, kinds: filters.kinds.includes(k) ? filters.kinds.filter((x) => x !== k) : [...filters.kinds, k] })}><KindIcon kind={k} />{kindLabel(k)}<span class="n" aria-hidden="true">{n}</span><span class="visually-hidden">, {n} {n === 1 ? "event" : "events"}</span></button>
      {/each}
    </div>
    <button type="button" class="control sheet-toggle" aria-expanded={sheetOpen} aria-controls="filter-sheet" onclick={toggleSheet}>Filters{#if sheetCount > 0}{` (${sheetCount})`}{/if}</button>
    <!-- Phones: the end of the bar's second line, whatever room the kinds leave. -->
    <span class="break" aria-hidden="true"></span>
    <div class="slice">
      <p class="count" aria-hidden="true">{sliceText}</p>
      {#if pills.length > 0}
        <ul class="pills" aria-label="Active filters" bind:this={pillList}>
          <!-- Keyed by what removing the pill leaves, which differs per pill even if a kind and a region share a name. -->
          {#each pills as p, i (toQuery(p.without))}
            <li><button type="button" class={p.kind === undefined ? "pill" : `pill kind kind-${slugify(p.kind)}`} aria-label={`Remove ${p.label}`} onclick={() => removePill(i, p.without)}>{#if p.kind !== undefined}<KindIcon kind={p.kind} />{/if}{p.label}<UiIcon name="x" /></button></li>
          {/each}
        </ul>
      {/if}
    </div>
    <p role="status" class="visually-hidden">{announced}</p>
    <!-- Beside the count it orders, not at the rail's foot, below a laptop's fold. -->
    <label class="sort"><span class="visually-hidden">Sort</span><select value={filters.sort} onchange={(e) => change({ ...filters, sort: e.currentTarget.value === "venue" ? "venue" : "date" })}><option value="date">By date</option><option value="venue">By venue</option></select></label>
    {#if filters.saved}
      <ShareButton label="Share saved" data={shareSaved} disabled={upcomingSaves.length === 0} />
      <button type="button" class="control small export" disabled={!mounted || !upcomingSaves.some(isDated)} onclick={() => exportIcs("kc-this-week-saved.ics", upcomingSaves.filter(isDated), savedName)}><UiIcon name="calendar-plus" />Export saved to calendar</button>
    {/if}
    <!-- The bar's buttons are one kind (#181): base.css's small control, an icon and words, like Share saved. On phones
         the words are sized to nothing beside the pills (font-size 0), the × left and the words its name. -->
    {#if !isDefault(filters)}<button type="button" class="control small clear" onclick={() => change(DEFAULT_FILTERS)}><UiIcon name="x" />Clear filters</button>{/if}
  </div>

  <aside class="rail" aria-label="Filters">
    <div class="sheet" class:open={sheetOpen} id="filter-sheet" onfocusin={clearShowResults}>
      <FilterRail {filters} {today} onchange={change} kinds={meta.kinds} regions={meta.regions} {counts} />
      <!-- Phones: the sheet pushes the results a screen down, so a chip changes nothing in view; this stays at the
           screen's foot while the sheet is open, says what the filters list, and closes it onto the results. -->
      <button type="button" class="control show-results" onclick={showResults}>Show {countText}</button>
    </div>
  </aside>

  <!-- Focusable only through the skip link. -->
  <section class="results" id="results" bind:this={results} tabindex="-1" aria-label="Events">
    {#if shortlistGone}<p class="empty">None of this shortlist's events are still to come. Showing everything instead.</p>{/if}
    {#if count === 0}
      {#if filters.saved && saved.size === 0}
        <!-- The header's Saved link lands here on a first visit: an empty list of one's own, not a filter that failed. -->
        <p class="empty">Nothing saved yet. Save any event and it appears here; saves stay in this browser, with no account. Start with <a href="/">the picks</a>.</p>
      {:else if allPills.length > 0}
        <!-- The ways out that cost one filter, each with what it would list, before the reset that costs them all. -->
        <p class="empty">No events match <strong>{matchText}</strong>.</p>
        <p class="ways">
          {#each ways as w (toQuery(w.p.without))}
            {@const to = w.p.without.when}
            <button type="button" class="control small" onclick={() => change(w.p.without)}>{w.p.when !== true ? `Without ${w.p.label}` : "preset" in to ? WHEN_LABELS[to.preset] : w.p.label}, {w.n} {w.n === 1 ? "event" : "events"}</button>
          {/each}
          <!-- The bar's Clear filters, the same reset: back to the week; not where the week is all that is set. -->
          {#if !isDefault(filters)}<button type="button" class="link" onclick={() => change(DEFAULT_FILTERS)}>Clear filters</button>{/if}
        </p>
      {:else}
        <p class="empty">Nothing listed right now.</p>
      {/if}
    {/if}
    <!-- A row carries its day where no day heading does: the venue sort, and the saved view's passed saves. -->
    {#snippet rows(g: typeof groups[number])}
      {#each g.events as event (event.id)}
        <ResultRow {event} {today} withDay={filters.sort === "venue" || g.key === PASSED_GROUP || g.key === SHORTLIST_GROUP} />
      {/each}
    {/snippet}
    <!-- Keep going (#183): the days after the range, or every date. Links, so they work without JavaScript; hydrated,
         they change the filter in place. -->
    {#snippet keep()}
      <!-- Where Skip past results lands: after the dated rows, before Keep going and the trailing groups. -->
      <span id="past-results" tabindex="-1"></span>
      {#if more !== undefined && (more.added > 0 || more.total > count)}
        {@const next = more.next}
        {@const everyDate = more.everyDate}
        <p class="keep" bind:this={keepBlock}>
          {#if more.added > 0}
            <a class="keep-going" href={`/explore?${toQuery(next)}`} onclick={inPlace(() => goOn(next))}>Keep going: {more.nextWeek ? "next week" : `through ${formatDay(more.through)}`} · {more.added} {more.added === 1 ? "event" : "events"} <span aria-hidden="true">→</span></a>
          {/if}
          <!-- Not where the empty state above offers Every date already. -->
          {#if more.total > count && !ways.some((w) => w.p.when === true)}
            <a class="see-all" href={`/explore?${toQuery(everyDate)}`} onclick={inPlace(() => change(everyDate))}>{more.added > 0 ? "or every date" : "Every date"} · {more.total}</a>
          {/if}
        </p>
      {/if}
    {/snippet}
    {#each groups as g, i (g.key)}
      {#if i === moreAt}{@render keep()}{/if}
      {#if g.collapsed}
        <!-- A native disclosure, so it opens without JS and announces its state; closed, it is one line. The summary is
             plain text, since some screen readers flatten a heading inside it (audit A15); the group's heading is inside
             the group, for heading navigation once it is open. -->
        <details class="collapsed">
          <summary data-group={g.key}><span class="heading">{g.heading}</span> · {g.events.length} {g.events.length === 1 ? "event" : "events"}</summary>
          <h2 class="visually-hidden">{g.heading}</h2>
          {@render rows(g)}
        </details>
      {:else}
        <h2 class={`section-heading group${filters.sort === "venue" ? " venue" : ""}`} data-group={g.key}>{g.heading}</h2>
        {@render rows(g)}
      {/if}
    {/each}
    {#if moreAt === groups.length}{@render keep()}{/if}
    <!-- Export, after the list it takes: the rarest action, out of the bar (the 2026-10-25 critique) and after every
         filter in the Tab order. The saved view's is in the bar, beside Share saved. -->
    {#if !filters.saved && count > 0}
      <p class="foot"><button type="button" class="control export" disabled={!mounted || exportable.length === 0} onclick={() => exportIcs(exportAs.filename, exportable, exportAs.calendarName)}><UiIcon name="calendar-plus" />{exportable.length === 0 ? "Export to calendar" : `Export ${exportable.length} to calendar`}</button></p>
    {/if}
  </section>
</div>

<style>
  /* A narrow rail, so result rows keep room for their titles. The bar sits over the results, the rail beside both.
     The results' row takes any height the rail has over the two, so a short slice does not open a gap under the bar. */
  .explorer {
    display: grid; grid-template-columns: 12rem minmax(0, 1fr); grid-template-rows: auto 1fr; grid-template-areas: "rail bar" "rail results";
    gap: 0 var(--space-6); align-items: start;
  }
  .rail { grid-area: rail; }
  .results { grid-area: results; }
  /* A short viewport (a phone on its side, 400% zoom) would keep a third of itself under the sticky bars: they scroll away. */
  @media (max-height: 500px) { .bar, .collapsed[open] summary { position: static; } }
  /* The results take focus only from the skip link; the next Tab lands on the first row, which shows the ring. */
  .results:focus, #past-results:focus { outline: none; }
  /* Sticky beside the results, scrolling on its own when it is taller than the window (a 768 px laptop). */
  .rail { position: sticky; top: var(--space-4); max-height: calc(100dvh - 2 * var(--space-4)); overflow-y: auto; padding: var(--space-1); margin: calc(-1 * var(--space-1)); scroll-padding-bottom: var(--space-8); }
  /* (The padding keeps focus rings on the rail's edge from being clipped by the scroll box.) A rail cut by the window
     fades out at its foot until it is scrolled to its end, so a half line reads as more below (the 2026-10-25
     critique); one that fits is not faded, since its scroll timeline is inactive and the fade's initial value is 0. */
  @property --rail-fade { syntax: "<length>"; inherits: false; initial-value: 0px; }
  @keyframes rail-end { from, 95% { --rail-fade: 2rem; } to { --rail-fade: 0px; } }
  /* The phone bar's kinds do the same at their row's end. */
  @property --kinds-fade { syntax: "<length>"; inherits: false; initial-value: 0px; }
  @keyframes kinds-end { from, 95% { --kinds-fade: 1.5rem; } to { --kinds-fade: 0px; } }
  @supports (animation-timeline: scroll()) {
    .rail { mask-image: linear-gradient(to bottom, black calc(100% - var(--rail-fade)), transparent); animation: rail-end linear both; }
    /* A rule of its own (a doubled selector, so it still wins): in one rule the minifier folds the timeline into the
       animation shorthand, which Chromium rejects, and the fade never runs. */
    .rail.rail { animation-timeline: scroll(self); }
  }
  .sheet-toggle { display: none; }
  /* Sticky within the whole explorer, not just its grid row, so it stays over the results as they scroll. */
  .bar { grid-area: bar; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); position: sticky; top: 0; background: var(--bg); padding: var(--space-2) 0; z-index: var(--z-bar); }
  .search { position: relative; flex: 1 1 14rem; max-width: 24rem; }
  /* The raised surface, as in the rail: Chromium's dark field is #3b3b3b, where its placeholder grey is about 2.4:1. */
  .search input { width: 100%; font-size: var(--text-sm); padding: var(--space-1) 1.75rem var(--space-1) var(--space-2); background: var(--bg-raised); color: var(--fg); border: 1px solid var(--fg-faint); border-radius: 4px; }
  .search input::placeholder { color: var(--fg-faint); opacity: 1; }
  /* Chromium draws its clear button in its own blue, the one hue in the chrome that names no kind. */
  .search input::-webkit-search-cancel-button { filter: grayscale(1); }
  /* The phone bar's kinds: the rail's kind chips (FilterRail.svelte), outlined in muted ink with the icon in its shade,
     pressed in the kind's tint, shade and edge; one that would list nothing faint and dashed, its count beside it. */
  .bar-kinds, .break { display: none; }
  .bar-kinds button {
    display: inline-flex; align-items: center; gap: 0.3em; flex: none; min-height: 2rem; padding: 0 var(--space-2);
    font: inherit; font-size: var(--text-xs); color: var(--fg-muted); background: none;
    border: 1px solid var(--control-border); border-radius: 999px; cursor: pointer;
  }
  .bar-kinds :global(.kind-icon) { color: var(--hue); }
  .bar-kinds .n { margin-left: 0.1em; color: var(--fg-faint); font-variant-numeric: tabular-nums; }
  .bar-kinds button[aria-pressed="true"] { color: var(--hue); background: var(--hue-tint); border-color: var(--hue); font-weight: var(--weight-medium); }
  .bar-kinds button[aria-pressed="true"] .n { color: inherit; }
  .bar-kinds button.none:not([aria-pressed="true"]) { color: var(--fg-faint); border-color: var(--rule-strong); border-style: dashed; }
  .bar-kinds button.none:not([aria-pressed="true"]) :global(.kind-icon) { color: inherit; }
  @media (forced-colors: active) {
    .bar-kinds button[aria-pressed="true"] { forced-color-adjust: none; color: HighlightText; background: Highlight; border-color: Highlight; }
    .bar-kinds button[aria-pressed="true"] :global(.kind-icon) { color: HighlightText; }
  }
  .foot { margin: var(--space-8) 0 0; }
  /* The / shortcut, at the field's end (in the padding it keeps clear) while it is empty and unfocused; not where
     there is no keyboard to press it. */
  .hint { position: absolute; right: var(--space-2); top: 50%; transform: translateY(-50%); pointer-events: none; font-size: var(--text-xs); color: var(--fg-muted); }
  .search input:focus + .hint, .search input:not(:placeholder-shown) + .hint { display: none; }
  @media (hover: none) { .hint { display: none; } }
  /* Off screen until focused, then just under the search field. */
  .skip {
    position: absolute; left: 0; top: 100%; z-index: var(--z-skip); transform: translateY(-200vh);
    background: var(--bg-raised); color: var(--fg); border: 1px solid var(--control-border); border-radius: var(--radius);
    padding: var(--space-2) var(--space-3); font-size: var(--text-sm);
  }
  .skip:focus { transform: none; }
  /* The slice in view: the count, then a pill per filter, which removes it. Kind pills wear their kind as the rail does. */
  .slice { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-2); margin-right: auto; }
  .count { margin: 0; color: var(--fg-muted); font-size: var(--text-sm); }
  .pills { display: flex; flex-wrap: wrap; gap: var(--space-1); list-style: none; margin: 0; padding: 0; }
  .pill {
    display: inline-flex; align-items: center; gap: 0.3em; min-height: 1.75rem; font: inherit; font-size: var(--text-xs);
    color: var(--fg); background: var(--bg-raised); border: 1px solid var(--control-border); border-radius: 999px;
    padding: 0 var(--space-2); cursor: pointer;
  }
  .pill:hover { border-color: var(--fg-faint); }
  .pill.kind { color: var(--hue); background: var(--hue-tint); border-color: var(--hue); font-weight: var(--weight-medium); }
  .pill :global(.ui-icon) { width: 0.95em; height: 0.95em; margin-right: -0.15em; }
  /* The sort, as small as the bar's buttons, on the raised surface the search field has: Chromium's dark-scheme select
     is grey (#6b6b6b), under 4.5:1 with --fg. */
  .sort select {
    min-height: 1.75rem; font-size: var(--text-xs); padding: 0 var(--space-1);
    background: var(--bg-raised); color: var(--fg); border: 1px solid var(--control-border); border-radius: var(--radius); cursor: pointer;
  }
  .show-results { display: none; }
  .ways { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); margin-top: var(--space-3); }
  .link { font: inherit; font-size: var(--text-sm); color: var(--accent); background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; }
  .empty { color: var(--fg-muted); }
  /* Keep going: a full-width tap target after the last day, the see-all link quieter beside it. */
  .keep { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); margin: var(--space-6) 0; font-size: var(--text-sm); }
  .keep-going {
    display: inline-flex; align-items: center; gap: var(--space-1); min-height: var(--tap); padding: 0 var(--space-4);
    color: var(--accent); font-weight: var(--weight-medium); text-decoration: none;
    border: 1px solid var(--control-border); border-radius: var(--radius); background: var(--bg-raised);
  }
  .keep-going:hover { border-color: var(--fg-faint); }
  .see-all { color: var(--fg-muted); }
  /* A collapsed group (On now with no when-filter): one line between hairlines, as light as a day heading, a full tap
     target, with a chevron that turns when it opens. Open, its line sticks under the bar like a
     day heading, so it can be closed from anywhere. */
  .collapsed { margin-top: var(--space-2); }
  /* A hundred-odd venues, half of them with a single event: their headings sit closer than the days'. */
  .results :global(.section-heading.venue) { margin-top: var(--space-3); }
  .collapsed summary {
    display: flex; align-items: center; gap: var(--space-2); min-height: var(--tap); padding: 0 var(--space-1);
    background: var(--bg); border-block: 1px solid var(--rule);
    color: var(--fg-muted); font-size: var(--text-sm); cursor: pointer; list-style: none;
  }
  .collapsed summary::-webkit-details-marker { display: none; }
  /* A chevron that turns when its disclosure opens: On now's line, and the phone's Filters button. */
  .collapsed summary::before, .sheet-toggle::before {
    content: ""; width: 0.4em; height: 0.4em; margin-right: var(--space-1);
    border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor;
    transform: rotate(-45deg); transition: transform 150ms var(--ease-out);
  }
  .collapsed summary:hover { color: var(--fg); }
  .collapsed .heading { display: inline; font-size: inherit; font-weight: var(--weight-medium); color: var(--fg); margin: 0; }
  .collapsed[open] summary::before, .sheet-toggle[aria-expanded="true"]::before { transform: rotate(45deg); }
  .collapsed[open] summary { position: sticky; top: var(--bar-height, var(--tap)); z-index: var(--z-sticky); margin-bottom: var(--space-1); }
  @media (max-width: 800px) {
    /* No gap: the rail is empty but for the sheet, which spaces itself when it is open. */
    .explorer { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; grid-template-areas: "bar" "rail" "results"; gap: 0; }
    /* Three lines: search; the kinds (32 px chips, as the rail's on phones) and Filters (a 44 px action); then the count
       and the pills, the sort and Clear. The first line scrolls away and the other two stick (the negative top), and
       the kinds and the pills each keep to one line, swiped sideways, so the stuck bar never grows past two lines (the
       2026-10-25 critique). */
    .search { flex-basis: 100%; max-width: none; }
    .search input { min-height: var(--tap); font-size: var(--text-md); }
    .bar-kinds, .slice { min-width: 0; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: -4px; padding: 4px; }
    /* Positioned, so the chips' out-of-sight counts (absolute) are laid out in the row and clipped with it, not in the
       sticky bar, where they would widen the page. */
    .bar-kinds { display: flex; align-items: center; gap: var(--space-1); flex: 1 1 0; position: relative; scroll-padding-inline: 4px calc(1.5rem + 4px); }
    /* The kinds fade at the row's end until it is swiped there, so a cut chip reads as more to come. */
    @supports (animation-timeline: scroll()) {
      .bar-kinds { mask-image: linear-gradient(to right, black calc(100% - var(--kinds-fade)), transparent); animation: kinds-end linear both; }
      .bar-kinds.bar-kinds { animation-timeline: scroll(self inline); } /* apart, as the rail's */
    }
    .sheet-toggle { display: inline-flex; gap: var(--space-2); flex: none; }
    .break { display: block; flex-basis: 100%; height: 0; }
    .slice { flex: 1 1 0; margin-right: auto; }
    .count, .pills, .pill { flex: none; }
    .pills { flex-wrap: nowrap; }
    /* Clear, and the saved view's Share and Export, are their icons beside the pills, their words their names (WCAG
       2.5.3 holds: the name has no visible words to match), so the line never wraps. */
    .clear, .bar .export, .bar :global(button.share) { min-width: 1.75rem; padding: 0; font-size: 0; }
    .clear :global(.ui-icon), .bar .export :global(.ui-icon), .bar :global(button.share .ui-icon) { width: 1rem; height: 1rem; }    .rail { position: static; max-height: none; overflow: visible; padding: 0; margin: 0; mask-image: none; animation: none; }
    /* Closed by default in CSS and in the server HTML alike, so nothing moves when the page hydrates. */
    .sheet:not(.open) { display: none; }
    .sheet.open { margin: var(--space-2) 0 var(--space-4); }
    /* At the screen's foot while any of the sheet is on it, over the chips that scroll under it, with the page's
       ground under its margin so nothing shows between it and the edge. */
    .show-results {
      display: flex; width: 100%; position: sticky; bottom: 0; z-index: var(--z-sticky); margin-top: var(--space-4);
      color: var(--accent-fg); background: var(--accent); border-color: var(--accent);
      box-shadow: 0 var(--space-2) 0 var(--bg);
    }
    .show-results:hover { border-color: var(--accent); }
  }
  /* The search line's height and the gap under it: what scrolls away before the bar sticks. On the root, so the
     document's scroll padding can use it too. Not while search has focus (the / shortcut, Shift+Tab, the last pill
     removed), so the field being typed in is never off screen (WCAG 2.4.11). explore.astro's no-JS style sets it back
     to 0, since the bar is then the count alone. */
  @property --bar-top { syntax: "<length>"; inherits: true; initial-value: 0px; }
  .bar { top: var(--bar-top); }
  @media (max-width: 800px) and (min-height: 501px) {
    :global(:root) { --bar-top: calc(-1 * (var(--tap) + var(--space-2))); }
    :global(:root:has(.explorer .search input:focus)) { --bar-top: 0px; }
  }
</style>
