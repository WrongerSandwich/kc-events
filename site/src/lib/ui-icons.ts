/**
 * Interface icons for the details line and the card actions, from the same set and sprite as the kind icons
 * (Lucide, ISC licence, v1.52.0; inner SVG markup, 24x24, stroked in currentColor).
 */
export const uiIcons = {
  "clock": `<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>`, // lucide: clock
  "map-pin": `<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>`, // lucide: map-pin
  "link": `<path d="M7 7h10v10"/><path d="M7 17 17 7"/>`, // lucide: arrow-up-right
  "check": `<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>`, // lucide: circle-check
  "calendar-plus": `<path d="M16 18h6"/><path d="M16 2v3"/><path d="M19 15v6"/><path d="M21 11.5V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h8.3"/><path d="M3 9h18"/><path d="M8 2v3"/>`, // lucide: calendar-plus
  "chevron-right": `<path d="m9 18 6-6-6-6"/>`, // lucide: chevron-right
  "x": `<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`, // lucide: x
  "ticket": `<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>`, // lucide: ticket
  "bookmark": `<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>`, // lucide: bookmark
  "bookmark-check": `<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/><path d="m9 10 2 2 4-4"/>`, // lucide: bookmark-check
  "alert": `<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>`, // lucide: triangle-alert
  "share": `<path d="M12 2v13"/><path d="m16 6-4-4-4 4"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>`, // lucide: share
} as const;

export type UiIconName = keyof typeof uiIcons;
