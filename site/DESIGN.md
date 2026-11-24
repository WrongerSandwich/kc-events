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
    fontFamily: "KC Display, Geist Variable, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.16em"
  headline:
    fontFamily: "KC Display, Geist Variable, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0.07em"
  section:
    fontFamily: "KC Display, Geist Variable, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.12em"
  caps-label:
    fontFamily: "KC Display, Geist Variable, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.12em"
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
    textColor: "{colors.ink}"
    typography: "{typography.caps-label}"
  date-tile:
    backgroundColor: "{colors.kind-film-tint}"
    textColor: "{colors.kind-film}"
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

The system serves PRODUCT.md's "sleek, colorful, honest tool": the delight of a well-made instrument, closer to Fantastical's colour-coded calendar and Linear's exact chrome than to any magazine. Its dress is the city's: Art Deco, for a skyline that mostly is (#293, chosen 2026-11-21, and the style of the venue illustrations commissioned for #149). Headings and small labels are tracked geometric capitals; date tiles are stepped at the shoulders like a setback tower; rules come thick and thin; a sunburst closes the page. All of that ornament is ink or grey. Beside it sit the header's fountain mark (five drops in kind colours, which play once on hover) and the flag's carmine, kept for the single state that is not a kind: a pick. It rejects, by name, ad-laden local aggregators (thumbnails, sponsored slots, undifferentiated volume), ticketing marketplaces (big event images, countdowns, scarcity pressure, buy buttons), social feeds (infinite scroll, engagement bait), and the hand-written newsletter (serif voice type, a curator persona).

Layout is two widths: a reading measure (42rem) for the front page, event pages and prose, and a wide frame (80rem, 86rem from 1440px) for the explorer's rail and one-line rows. Sections sit twice as far apart as the cards inside them (4rem between sections, 1rem between cards; 3rem between sections on phones). Motion is state feedback only: 150ms ease-out-quart transitions on controls, a 260ms cross-document view transition that glides a card's date tile and title into the event page's, and the fountain. All of it switches off under `prefers-reduced-motion`.

**Key Characteristics:**
- Monochrome chrome; colour arrives only with a kind or a state.
- Eleven kind hues at matched lightness and chroma, about evenly spaced around the wheel.
- One sans (Geist, 400 to 600) for everything read; one display face in tracked capitals for the site's own headings and labels.
- Deco ornament in ink and grey only: the stepped crown, the stepped tile, thick and thin rules, the sunburst.
- Flat surfaces, hairline rules, one shadow in the whole system.
- Light and dark schemes follow the reader's system, both WCAG AA for every pairing.
- 44px tap targets for actions, 32px filter chips on phones.

## 2. Colors

A grey interface lit by eleven kind hues and two colours from the city flag.

### Primary
- **Ink** (`ink`): text, link colour, and the filled state of a pressed toggle (a saved Save). Links and selection are ink, never a hue, because a hue would read as one more kind.

### Secondary
- **Flag Carmine** (`flag-carmine`): the diamond that leads a pick's tag, and the sign on the staleness banner. The carmine of the city's 2023 flag, its lightness set to clear 3:1 on the ground. Never a fill, a tint or the colour of words: at hue 27 it sits seven degrees from talks and readings' brick red, and a red pill beside that chip read as a second kind.
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

**The A-Pick-Is-A-Point Rule.** A kind is always a tint with its shade on it, or its shade as words. A state that is not a kind (a pick) is neither: a small carmine diamond, then its reason in ink capitals (Rare, Big name, Occasion, Tradition, Unusual, Major run), one mark for all six. The red is a point to find down a list, never an area, so it is not mistaken for a kind and does not outweigh the title beside it; the word reads in greyscale and to a screen reader, which hears "Pick:" before it. (Until 2026-11-22 a pick was a solid carmine pill, the Solid-Means-State Rule: the loudest thing on every row it sat in.)

**The Matched-Pair Rule.** A new kind gets the same lightness and chroma as the others and a hue in the widest gap on the wheel. Every shade must clear 4.5:1 on its own tint and on both grounds, in both schemes.

**The Diagram-Roles Exception.** One page breaks the Only-Kinds-Bring-Colour Rule: How it works (`/about/how-it-works`), whose diagrams colour a step by who does it (the network, the extraction model, the curation model, plain code, a person), with two more tones for the dataset and a warning. The rule exists because a hue beside events is read as a kind; that page lists no event and shows no kind, and the colour is how a reader finds the steps that call a model. Its terms: the tones are defined in `src/styles/how-it-works.css` and never in `tokens.css`; they are used inside that page's figures and its key and nowhere else, never on a link, a heading or a rule; each is a kind's own pair (the kinds' hues, lightness and chroma, so the Matched-Pair contrast holds); none is the flag carmine, which stays the pick's; and every role and outcome is also said in words, so the page reads in greyscale, in forced colours and to a screen reader.

**Diagrams on How it works.** The same page's diagrams wear the Deco dress in rules and capitals only (#310). The thick and thin rule heads every figure; the double hairline divides a diagram where it falls into groups (the run's phases; the Expired box's reasons from its name). A diagram's labels are in the Caps label: the role tags, and so the key's terms; a phase's Mon and Thu (0.625rem and untracked on phones, so they fit their columns); a figure's row labels; the week's days; a ladder's yes and no; a gate's failure; and a table's column heads. A group's name is the same capitals a size or two up: the week's lanes and a slab's, a verdict's and a reason's name at 0.75rem, a phase's name at 0.875rem, and the drawing's titles at 13px, tracked 0.08em to fit their boxes. A ladder's arrows fall back to Geist, never drawn bolder than its cut. What a step, a box or a cell says stays in Geist, and so does a label carrying a date (the run's strip above the figures), since figures are the face's weak spot. The rules are ink and the role tones stay inside boxes, tags and swatches. No diagram carries a stepped shape: the crown stays where Rules and ornaments places it, and the stepped motifs stay two.

## 3. Typography

**Body Font:** Geist Variable (with system-ui, sans-serif), cut to weights 400 to 600
**Display Font:** KC Display, a subset of Josefin Sans Bold holding capitals (the accented ones a venue's name may carry among them), figures and punctuation, and no lower case

**Character:** A neutral, exact sans does everything that is read, in three weights and a tight scale. Over it, a 1920s geometric in tracked capitals sets the site's own words: the period note, for a skyline that is mostly Art Deco.

### Hierarchy
- **Display** (700, 1.25rem, tracked 0.16em, uppercase): the site's name in the header. 0.875rem and 0.08em on phones under 26rem, so the nav keeps its row.
- **Headline** (display face, 700, 2rem, 1.15, tracked 0.07em, uppercase): a page's one h1, over a short thick and thin flourish. 1.5rem on the front page on phones; 1.75rem on the explorer and for a venue's name or a list's (1.25rem for those names on phones). An event page's h1 is not this: it is the event's title, in Geist at 600 and 1.75rem.
- **Section** (display face, 700, 1.125rem, 1.2, tracked 0.12em, uppercase): horizon buckets, the front page's On now, Always there, More like this, between the crown and a double hairline. 0.9375rem and 0.1em on phones. A list's sticky day or venue heading is the same element at the caps label's size, on a 1.6 line so its hairline sits clear, with no crown or rule. The explorer's folded "On now" line is not a heading but a control with a count, and stays in Geist.
- **Caps label** (display face, 700, 0.6875rem, tracked 0.12em, uppercase): a date tile's weekday and month, the week strip's weekdays (0.625rem), the one-line list's dates, a list's sticky day or venue heading (the explorer's, and a venue's, a kind's and a region's page), the explorer rail's group names, a pick's tag, and How it works' diagram labels (Diagrams on How it works).
- **Title** (600, 1.125rem, 1.25, -0.01em): an event's name on a card. On an explorer row it is 1rem at 500.
- **Body** (400, 1rem, 1.5): the why line, descriptions, prose. Lines capped near 38rem on a card, 70ch on a row, 42rem on a page.
- **Meta** (400, 0.875rem, 1.5, tabular figures): dates, times, venue lines, nav links.
- **Label** (500, 0.75rem, 1.6): chips, a passed save's tag, counts.

### Named Rules
**The Capitals-Are-The-Site's Rule.** The display face sets the site's own words (its name, a page's heading, a section's heading, a weekday, a month, a list's date) and a place's name, always in capitals: its file has no lower case. It never sets an event's title, which is quoted from its source and stays in Geist as written; nor a button, a chip, or a sentence. Of the tags it sets one, a pick's reason, which is the site's own word and one of six; and on How it works the role tags, the site's own words for who does a step (Diagrams on How it works). Figures in it are the face's weak spot, so the date tile's day and every time stay in Geist's tabular figures.

**The Three-Labels-In-The-Explorer Rule.** Inside the explorer three things are set in capitals and nothing else (an e2e check holds it, #297): the rail's group names, the list's group headings, and a pick's tag, one or two short words on the rows that have one. Its rows are dense, so a row's own words, a chip, a control and a count stay in Geist, as written.

**The Figures-Only-Where-They-Line-Up Rule.** Tabular figures go on dates, times and counts, never on running text, where tnum widens the hyphen in "ad-free".

**The 600 Ceiling.** Bold asks for 600, the heaviest weight the font carries. Never 700 on Geist.

## 4. Elevation

Flat. Depth comes from the raised surface against the ground (a step of 0.015 lightness), from hairline rules, and from space. There is exactly one cast shadow, on the one element that floats over content: the Add to calendar menu.

### Shadow Vocabulary
- **Menu lift** (`box-shadow: 0 4px 16px oklch(0 0 0 / 0.12)`): the calendar choice's dropdown, which hangs over the content below it.
- **Hairline cut** (`box-shadow: 0 1px 0 var(--rule)`): under a sticky group heading, so a row scrolling beneath is cut by a rule rather than showing through. A rule, not depth.
- **Today ring**: today's date tile, ringed 1.5px in its kind's shade. Not a shadow since the tile took its stepped shoulders (#293), which would cut one: the tile fills with the shade and a second stepped shape, set in by the ring's width, lays the tint over it. A mark, not depth.

### Named Rules
**The One-Shadow Rule.** Only an element that genuinely floats over content casts a shadow. Cards, rows, chips and buttons never do. If a surface needs separating, use a hairline or space.

## 5. Components

Quiet instruments: precise edges, ink words, colour only where a kind lives.

### Buttons (the control)
- **Shape:** gently rounded (6px), 1px control edge, raised surface, ink words at 0.875rem/500 after a 16px icon.
- **Size:** 44px tall for every primary action (Save, Share, Add to calendar, Keep going, the header's links); the explorer bar's small control is 28px.
- **Hover / Focus:** the edge darkens to faint ink over 150ms ease-out-quart; pressing nudges it down 1px; focus is the Fountain Blue ring.
- **Pressed toggle:** a saved Save fills with ink, words in the ground colour.
- **Quiet on a card:** on a pick's card the controls drop their box and sit in muted ink, gaining the card's kind tint on hover, so five cards are not ten buttons. The 44px target stays.
- **The main control (event page):** "Details at …" or "Tickets at …", the page's one filled control, in ink with the ground's colour for its words, and the one square control (#295): it takes the shape of the rules around it, where every other control keeps its 6px corner. The column's width on phones. Once the event has passed, the banner's "See what's on this week" is the same control, and takes its place. On an ended page (#303), built after the event's last day, the banner is in the HTML and its control is "More at <venue>", with the kind's page beside it as a plain link; with no venue page, the kind's link is the control.

### Chips
- **Kind chip:** a pill (999px) in the kind's tint with its shade for the icon and words, label type. As a link to the kind's page it drops the pill, keeping icon and words, underlined on hover: of the things a reader can press, only a filter is pill-shaped.
- **Filter chip (explorer rail, front page kinds):** an outlined pill in muted ink. Pressed, it takes its kind's tint, shade and edge at weight 500; a filter that is not a kind takes the grey pressed tint under ink. A chip that would list nothing goes faint with a dashed edge and stays pressable. Each carries its count in faint ink. In forced colours a pressed chip takes the system's Highlight.
- **Kind row (explorer bar and front page, phones):** every kind's filter chip in one line that swipes sideways, fading at its end until swiped there. On the front page it is This week's All and kinds, so the first card starts on the first screen; in the explorer, Filters at its end; kind is the explorer's lens, since the list is in date order already and the picks lead the front page (Picks only is a Show switch like the others). The sheet keeps the dates, regions and switches; wide windows keep the rail's Kind group.
- **Pick tag** (`PickTag.svelte`): not a chip and not a pill. A Flag Carmine diamond (a square on its point, half the capitals' size), then the pick's reason in the caps label, in ink: Rare, Big name, Occasion, Tradition, Unusual or Major run (ADR 0014, #273). One mark for all six, so the diamond says pick and the word says why; the word is written in sentence case and set in capitals by the stylesheet, and a visually hidden "Pick:" precedes it for a screen reader. In forced colours the diamond takes the text colour. It replaced a solid carmine pill with the word in white (2026-11-22), which was louder than the titles and too near a kind's chip, and before that a pill that said "Don't miss" on every pick, an imperative with the scarcity tone the system rejects. On a row it rides the date line or sits beside the title, and on the front page's one-line rows it sits under the date at every width (on the date line on the narrowest), so the titles start in one column, since a row has no why line and the word is all of the why it can carry; on an event page it sits beside the kind chip; on a card it leads the why line, since every card is a pick and the word is what differs between them. The six reasons are explained once, on the About page. A passed save's tag sits in the tag's place, a pill outlined in a hairline, muted, in Geist.

### Rules and ornaments (Deco)
All in ink (`fg`) or the strong rule's grey, never a hue, and all decoration: none carries meaning a reader needs.
- **Thick and thin rule:** 3px, a 3px gap, 1px, the page's width. It closes the header; turned over (thin, then thick) it opens the footer. A 4.5rem cut of it is the flourish under a page's heading, and it heads each figure on How it works.
- **Crown:** a stepped ziggurat, three steps to a flat top (`--crown`, a clip path that fits any box). It leads a section's heading, 26 by 15px, sits over today's tile in the week strip, 26 by 13px, and leads today's day heading in the explorer, 20 by 10px, and nowhere else: one stepped motif, used sparingly. In the explorer only, of the lists: it follows the visitor's day, where a venue's, a kind's and a region's page is built once a day.
- **Double hairline:** two 1px lines 2px apart, running from a section's heading to the column's edge, and between a How it works diagram's groups. On phones the heading is a block: the crown sits in the first line of the words, so a heading that wraps never leaves it alone, and the hairline goes under them, the column's width.
- **Sunburst:** a half sun's eleven rays, short and long by turns, in the strong rule's grey, rising from the footer's rule with the fountain mark at its centre. Once a page, at its foot.
- In forced colours the crown keeps a fill in the text colour; the rules are borders and survive on their own.

### Section Heading
The crown, the words in the Section style, then the double hairline. Sections sit 4rem apart (3rem on phones), so a heading reads as the start of a group.

### Date Tile (signature)
The kind's tint with its shade, stepped at the shoulders like a setback tower (two 5px steps at each top corner, `--shoulders`) with a double line at its foot in its own shade. Weekday and month in the caps label around a 1.75rem/600 day number in Geist's tabular figures. 4rem wide on a card (3.5rem on phones, 5rem large on an event page). Today is ringed in its own shade, the ring following the steps. A passed event's tile is a flat grey (`pressed-tint`), no ring. On navigation it glides into the event page's tile.

### Venue Block (event page)
Under the event and before More like this, a section headed "The venue" (#295): the venue's name at 500, its street address in muted meta type, then two ways on in ink at 500, each a 44px target: "Everything at this venue" to the venue's page and "Map". Shown only when the venue table has an address for the venue; without one it would repeat the line under the title. One column of words: a venue's illustration, when it has one (#149), sits to their left, and no empty slot is drawn before then.

### Pick Card
Not a box. A three-column grid: the date tile, the words (title, a meta line of icon-led facts, the why line in ink led by the pick tag, chips and a muted source link), then the action column with Save over Add to calendar. On phones the actions fold into a row under the words. Cards are separated by 1rem of space, never a border or shadow.

### Front Page Rows and On Now
After This week's cards, a pick is one row: the date in the caps label with the pick tag under it, the kind's icon and title, then the venue in muted meta type. A list is one grid and each row a subgrid of it, so the titles and the venues each start in one column down the list; on phones the venue drops under the title, and on the narrowest the date and tag share a line over the title. A day's number keeps to its month when a date wraps. On now, a section after This week, holds the picks that are runs already open and staying open past Sunday, in these rows, the soonest to close first, a run's weekdays over its close ("Wed–Sun", "Closes Dec 27"): a run on all week is not the week's news, so This week's cards, kind chips and week strip are left to what happens, opens or closes by Sunday, and a tile never shows a close weeks off.

### Result Row (explorer)
One shape on every row: the date line, the title, the kind chip leading the venue and neighbourhood, Save spanning them at the row's end, and the why line full width beneath. Below 1024px Save is the bookmark alone, quiet in muted ink with its 44px target, so a screen of rows is not a column of boxes and the venue keeps the room; the neighbourhood gives way before the venue. From 1024px it collapses to one line. Rows are divided by a hairline and nothing else.

### Inputs / Fields
- **Style:** raised surface, 1px faint-ink edge, 4px radius, meta-size text. Search, sort and the date range share it.
- **Focus:** the Fountain Blue ring; date fields ring on `:focus-within`.
- **Checkboxes:** 13px, ink accent colour rather than the browser's blue.

### Navigation
The header: the fountain mark and the name at left, nav links at right in muted ink at 0.875rem (Geist: a link is not a label), each padded to 44px, ink on hover with no underline. The thick and thin rule under the header. Phones shrink and tighten the name so the nav keeps its row. The footer: the rule turned over under the sunburst, then two short lines and five links in muted ink.

### Week Strip (signature)
A row of square day tiles (raised surface, hairline edge): the weekday in the caps label, the day number at 1.125rem/600, then the kinds on that day as icons in their shades, then each running exhibition or show as a 3px band in its kind's shade (2px radius), left empty on a day it is closed so the bands keep their rows. Today is edged in ink under a 3px bar, with the crown over it; an empty day goes dashed and faint. The week's shape in colour before any title is read. On phones a tile keeps one icon and counts the rest as "+n".

## 6. Do's and Don'ts

### Do:
- **Do** keep every neutral a true grey (chroma 0) and let only the kinds and the flag's two colours carry hue.
- **Do** pair a kind's shade with its own tint, and check 4.5:1 for every new pairing in both the light and dark scheme.
- **Do** say a state in words as well as colour: a pick's reason is written after its red diamond; kind is never conveyed by colour alone.
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
- **Don't** use a diagram's role colour outside the How it works page's figures and key, or borrow the exception for another page.
- **Don't** set an event's title, a button, a chip, a sentence, or any tag but a pick's reason (and How it works' role tags) in the display face, or anything in it in lower case; and never set Geist at 700.
- **Don't** fill or tint anything with the flag's carmine, or set words in it: a pick's diamond and the staleness sign are all of it.
- **Don't** give an ornament a hue, or add a second stepped motif: the crown and the tile's shoulders are the two.
- **Don't** put a shadow on a card, row, chip or button; the calendar menu is the only thing that floats.
- **Don't** use a `border-left` or `border-right` over 1px as a coloured stripe; a card's kind lives in its date tile.
- **Don't** use gradient text, glassmorphism, or a hero-metric block.
- **Don't** write exclamation marks, slogans, or "we" into the interface; headings are nouns.
