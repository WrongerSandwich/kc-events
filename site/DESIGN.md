---
name: KC This Week
description: A weekly researched, ad-free list of what's worth doing in Kansas City.
colors:
  ground: "oklch(0.985 0 0)"
  raised-surface: "oklch(1 0 0)"
  ink: "oklch(0.21 0 0)"
  muted-ink: "oklch(0.46 0 0)"
  faint-ink: "oklch(0.53 0 0)"
  hairline: "oklch(0.915 0 0)"
  strong-rule: "oklch(0.78 0 0)"
  control-edge: "oklch(0.62 0 0)"
  pressed-tint: "oklch(0.94 0 0)"
  fountain-blue-focus: "oklch(0.56 0.15 238)"
  flag-carmine: "oklch(0.55 0.2 27)"
  kind-talks-readings: "oklch(0.47 0.14 20)"
  kind-talks-readings-tint: "oklch(0.945 0.045 20)"
  kind-food-drink: "oklch(0.47 0.14 56)"
  kind-food-drink-tint: "oklch(0.945 0.045 56)"
  kind-comedy: "oklch(0.47 0.14 88)"
  kind-comedy-tint: "oklch(0.945 0.045 88)"
  kind-festivals-markets: "oklch(0.47 0.14 130)"
  kind-festivals-markets-tint: "oklch(0.945 0.045 130)"
  kind-outdoors-community: "oklch(0.47 0.14 165)"
  kind-outdoors-community-tint: "oklch(0.945 0.045 165)"
  kind-art-exhibitions: "oklch(0.47 0.14 205)"
  kind-art-exhibitions-tint: "oklch(0.945 0.045 205)"
  kind-sports: "oklch(0.47 0.14 245)"
  kind-sports-tint: "oklch(0.945 0.045 245)"
  kind-film: "oklch(0.47 0.14 278)"
  kind-film-tint: "oklch(0.945 0.045 278)"
  kind-music: "oklch(0.47 0.14 308)"
  kind-music-tint: "oklch(0.945 0.045 308)"
  kind-theater-dance: "oklch(0.47 0.14 345)"
  kind-theater-dance-tint: "oklch(0.945 0.045 345)"
  kind-other: "oklch(0.48 0 0)"
  kind-other-tint: "oklch(0.94 0 0)"
typography:
  display:
    fontFamily: "KC Wordmark, Geist Variable, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.14em"
  headline:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  section:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.6
rounded:
  hairline: "2px"
  field: "4px"
  md: "6px"
  pill: "999px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "6": "1.5rem"
  "8": "2rem"
  "12": "3rem"
  "16": "4rem"
  tap: "2.75rem"
  measure: "42rem"
components:
  control:
    backgroundColor: "{colors.raised-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "{spacing.tap}"
  control-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.raised-surface}"
    rounded: "{rounded.md}"
    height: "{spacing.tap}"
  control-small:
    backgroundColor: "{colors.raised-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 0.5rem"
    height: "1.75rem"
  kind-chip:
    backgroundColor: "{colors.kind-music-tint}"
    textColor: "{colors.kind-music}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 0.5rem"
  filter-chip:
    textColor: "{colors.muted-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.5rem"
  filter-chip-pressed:
    backgroundColor: "{colors.pressed-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.5rem"
  dont-miss-tag:
    backgroundColor: "{colors.flag-carmine}"
    textColor: "{colors.raised-surface}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 0.5rem"
  date-tile:
    backgroundColor: "{colors.kind-film-tint}"
    textColor: "{colors.kind-film}"
    rounded: "{rounded.md}"
    width: "4rem"
  field:
    backgroundColor: "{colors.raised-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "0.25rem 0.5rem"
---

# Design System: KC This Week

## 1. Overview

**Creative North Star: "The Color-Coded Almanac"**

A reference you scan, not a feed you scroll. The interface is set in true greys, ink on an off-white ground, and the only colour on most screens comes from the eleven kinds of event: talks, food, comedy, festivals, outdoors, art, sports, film, music, theater, other. Each kind is a filing tab in a strong shade and a tint, so a glance down a column of events sorts it before a word is read. The page is calm and dense at once: many events fit a screen, separated by space and the odd hairline, with nothing competing for attention.

The system serves PRODUCT.md's "sleek, colorful, honest tool": the delight of a well-made instrument, closer to Fantastical's colour-coded calendar and Linear's exact chrome than to any magazine. Its one nod to the city is the header's fountain mark (five drops in kind colours, which play once on hover) and the flag's carmine, kept for the single state that is not a kind: don't miss. It rejects, by name, ad-laden local aggregators (thumbnails, sponsored slots, undifferentiated volume), ticketing marketplaces (big event images, countdowns, scarcity pressure, buy buttons), social feeds (infinite scroll, engagement bait), and the hand-written newsletter (serif voice type, a curator persona).

Layout is two widths: a reading measure (42rem) for the front page, event pages and prose, and a wide frame (80rem, 86rem from 1440px) for the explorer's rail and one-line rows. Sections sit twice as far apart as the cards inside them (4rem between sections, 1rem between cards; 3rem between sections on phones). Motion is state feedback only: 150ms ease-out-quart transitions on controls, a 260ms cross-document view transition that glides a card's date tile and title into the event page's, and the fountain. All of it switches off under `prefers-reduced-motion`.

**Key Characteristics:**
- Monochrome chrome; colour arrives only with a kind or a state.
- Eleven kind hues at matched lightness and chroma, about evenly spaced around the wheel.
- One sans (Geist, 400 to 600) for everything; the wordmark is the only display type.
- Flat surfaces, hairline rules, one shadow in the whole system.
- Light and dark schemes follow the reader's system, both WCAG AA for every pairing.
- 44px tap targets for actions, 32px filter chips on phones.

## 2. Colors

A grey interface lit by eleven kind hues and two colours from the city flag.

### Primary
- **Ink** (`ink`): text, link colour, and the filled state of a pressed toggle (a saved Save). Links and selection are ink, never a hue, because a hue would read as one more kind.

### Secondary
- **Flag Carmine** (`flag-carmine`): the don't-miss tag and nothing else. The carmine of the city's 2023 flag, its lightness set for white words on it.
- **Fountain Blue** (`fountain-blue-focus`): the focus ring, 2px with a 2px offset. The flag's NCS blue, used only to show where the keyboard is.

### Tertiary: The Kinds
Each kind is a pair: a strong shade (lightness 0.47, chroma 0.14) and a tint (0.945, 0.045) on the same hue. Hues run 20 (talks and readings, a brick red) through 56 (food and drink, amber), 88 (comedy, mustard), 130 (festivals and markets, leaf), 165 (outdoors and community, pine), 205 (art and exhibitions, teal), 245 (sports, royal blue), 278 (film, indigo), 308 (music, violet), 345 (theater and dance, magenta), with a neutral grey for other. In the dark scheme the pair inverts: a light shade (0.82, 0.11) on a deep tint (0.31, 0.06). A kind's colours are reached through a `.kind-<slug>` class that sets `--hue` and `--hue-tint` for any element inside it.

### Neutral
- **Ground** (`ground`): the page.
- **Raised Surface** (`raised-surface`): controls, fields, the calendar menu.
- **Muted Ink** (`muted-ink`): secondary text, venue lines, quiet card controls.
- **Faint Ink** (`faint-ink`): verified stamps, counts, icons beside their words.
- **Hairline** (`hairline`): row dividers, the header's bottom rule, a sticky group heading's cut line.
- **Strong Rule** (`strong-rule`): the dashed edge of a filter chip that would list nothing.
- **Control Edge** (`control-edge`): a control's 1px border, cleared at 3:1.
- **Pressed Tint** (`pressed-tint`): a pressed filter that is not a kind, a grey tint under ink.

All neutrals are true greys (chroma 0), on purpose: a tinted neutral would bring a hue, and only the kinds may. Under `prefers-contrast: more` the muted inks, rules and control edges each move one step toward the text.

### Named Rules
**The Only-Kinds-Bring-Colour Rule.** Chrome, links, selection, saved state and hover are ink or grey. A new hue anywhere in the interface is forbidden unless it names a kind; it would be read as one.

**The Solid-Means-State Rule.** A kind is always a tint with its shade on it. A state that is not a kind (don't miss) is a solid fill, so it can never be mistaken for a kind, and it says its name in words so it reads in greyscale and to a screen reader.

**The Matched-Pair Rule.** A new kind gets the same lightness and chroma as the others and a hue in the widest gap on the wheel. Every shade must clear 4.5:1 on its own tint and on both grounds, in both schemes.

## 3. Typography

**Body Font:** Geist Variable (with system-ui, sans-serif), cut to weights 400 to 600
**Display Font:** KC Wordmark, a subset of Josefin Sans Bold holding only the capitals of the site's name

**Character:** One neutral, exact sans does every job, in three weights and a tight scale. The wordmark's 1920s geometric capitals are the single period note, for a skyline that is mostly Art Deco.

### Hierarchy
- **Display** (700, 1.0625rem, tracked 0.14em, uppercase): the site's name in the header, and nowhere else. 0.875rem and 0.08em on phones under 26rem.
- **Headline** (600, 2.25rem, 1.25, -0.03em): a page's one h1. Phones set it at 1.75rem.
- **Section** (600, 1.75rem, 1.25, -0.02em): horizon buckets, Always there, More <kind>. 1.375rem on phones, a step under the h1. The explorer's sticky day or venue heading is the same element at 0.875rem.
- **Title** (600, 1.125rem, 1.25, -0.01em): an event's name on a card. On an explorer row it is 1rem at 500.
- **Body** (400, 1rem, 1.5): the why line, descriptions, prose. Lines capped near 38rem on a card, 70ch on a row, 42rem on a page.
- **Meta** (400, 0.875rem, 1.5, tabular figures): dates, times, venue lines, nav links.
- **Label** (500, 0.75rem, 1.6): chips, tags, counts, the date tile's weekday and month.

### Named Rules
**The One-Display-Line Rule.** The wordmark face sets "KC THIS WEEK" and nothing else: never a heading, a label or a button. Headings are Geist at 600.

**The Figures-Only-Where-They-Line-Up Rule.** Tabular figures go on dates, times and counts, never on running text, where tnum widens the hyphen in "ad-free".

**The 600 Ceiling.** Bold asks for 600, the heaviest weight the font carries. Never 700 on Geist.

## 4. Elevation

Flat. Depth comes from the raised surface against the ground (a step of 0.015 lightness), from hairline rules, and from space. There is exactly one cast shadow, on the one element that floats over content: the Add to calendar menu.

### Shadow Vocabulary
- **Menu lift** (`box-shadow: 0 4px 16px oklch(0 0 0 / 0.12)`): the calendar choice's dropdown, which hangs over the content below it.
- **Hairline cut** (`box-shadow: 0 1px 0 var(--rule)`): under a sticky group heading, so a row scrolling beneath is cut by a rule rather than showing through. A rule, not depth.
- **Today ring** (`box-shadow: inset 0 0 0 1.5px var(--hue)`): today's date tile, ringed in its kind's shade. A mark, not depth.

### Named Rules
**The One-Shadow Rule.** Only an element that genuinely floats over content casts a shadow. Cards, rows, chips and buttons never do. If a surface needs separating, use a hairline or space.

## 5. Components

Quiet instruments: precise edges, ink words, colour only where a kind lives.

### Buttons (the control)
- **Shape:** gently rounded (6px), 1px control edge, raised surface, ink words at 0.875rem/500 after a 16px icon.
- **Size:** 44px tall for every primary action (Save, Share, Add to calendar, Keep going, the header's links); the explorer bar's small control is 28px.
- **Hover / Focus:** the edge darkens to faint ink over 150ms ease-out-quart; pressing nudges it down 1px; focus is the Fountain Blue ring.
- **Pressed toggle:** a saved Save fills with ink, words in the ground colour.
- **Quiet on a card:** on a don't-miss card the controls drop their box and sit in muted ink, gaining the card's kind tint on hover, so five cards are not ten buttons. The 44px target stays.

### Chips
- **Kind chip:** a pill (999px) in the kind's tint with its shade for the icon and words, label type. As a link to the kind's page it drops the pill, keeping icon and words, underlined on hover: only a filter is pill-shaped.
- **Filter chip (explorer rail, front page kinds):** an outlined pill in muted ink. Pressed, it takes its kind's tint, shade and edge at weight 500; a filter that is not a kind takes the grey pressed tint under ink. A chip that would list nothing goes faint with a dashed edge and stays pressable. Each carries its count in faint ink. In forced colours a pressed chip takes the system's Highlight.
- **Don't-miss tag:** a solid Flag Carmine pill with "Don't miss" in white. A passed save's tag sits in the same place, outlined in a hairline, muted.

### Date Tile (signature)
The kind's tint with its shade, weekday and month in label type around a 1.75rem/600 day number in tabular figures, 6px radius, 4rem wide on a card (3.5rem on phones, 5rem large on an event page). Today is ringed in its own shade. On navigation it glides into the event page's tile.

### Don't-Miss Card
Not a box. A three-column grid: the date tile, the words (title, a meta line of icon-led facts, the why line in ink, chips and a muted source link), then the action column with Save over Add to calendar. On phones the actions fold into a row under the words. Cards are separated by 1rem of space, never a border or shadow.

### Result Row (explorer)
One shape on every row: the date line, the title, the kind chip leading the venue and neighbourhood, Save spanning them at the row's end, and the why line full width beneath. From 1024px it collapses to one line. Rows are divided by a hairline and nothing else.

### Inputs / Fields
- **Style:** raised surface, 1px faint-ink edge, 4px radius, meta-size text. Search, sort and the date range share it.
- **Focus:** the Fountain Blue ring; date fields ring on `:focus-within`.
- **Checkboxes:** 13px, ink accent colour rather than the browser's blue.

### Navigation
The header: the fountain mark and wordmark at left, nav links at right in muted ink at 0.875rem, each padded to 44px, ink on hover with no underline. A hairline under the header. Phones shrink and tighten the wordmark so the nav keeps its row.

### Week Strip (signature)
A row of day tiles (raised surface, hairline edge, 6px radius): weekday, the day number at 1.125rem/600, then the kinds on that day as icons in their shades, then each running exhibition or show as a 3px band in its kind's shade (2px radius), left empty on a day it is closed so the bands keep their rows. Today is edged in ink; an empty day goes dashed and faint. The week's shape in colour before any title is read. On phones a tile keeps one icon and counts the rest as "+n".

## 6. Do's and Don'ts

### Do:
- **Do** keep every neutral a true grey (chroma 0) and let only the kinds and the flag's two colours carry hue.
- **Do** pair a kind's shade with its own tint, and check 4.5:1 for every new pairing in both the light and dark scheme.
- **Do** say a state in words as well as colour: "Don't miss" is written on its red pill; kind is never conveyed by colour alone.
- **Do** separate with space first, hairlines second: 4rem between sections, 1rem between cards.
- **Do** give every action a 44px target and every filter chip at least 32px on phones.
- **Do** use tabular figures for dates, times and counts.
- **Do** honour `prefers-reduced-motion`, `prefers-contrast: more` and forced colours.

### Don't:
- **Don't** add anything from ad-laden local aggregators: thumbnails, sponsored slots, undifferentiated volume.
- **Don't** borrow from ticketing marketplaces (Eventbrite, Ticketmaster): big event images, countdowns, scarcity pressure, buy buttons.
- **Don't** build social-feed mechanics: infinite scroll, engagement bait, algorithmic ordering.
- **Don't** dress it as a hand-written newsletter or editorial magazine: no serif "voice" type, no chatty personal copy, no curator persona.
- **Don't** colour a link, a selection, a hover or the saved state with a hue; it would read as one more kind.
- **Don't** set anything but the site's name in the wordmark face, and never set Geist at 700.
- **Don't** put a shadow on a card, row, chip or button; the calendar menu is the only thing that floats.
- **Don't** use a `border-left` or `border-right` over 1px as a coloured stripe; a card's kind lives in its date tile.
- **Don't** use gradient text, glassmorphism, or a hero-metric block.
- **Don't** write exclamation marks, slogans, or "we" into the interface; headings are nouns.
