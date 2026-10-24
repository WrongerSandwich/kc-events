// The explorer's one-key shortcut (`/` to search) can be turned off (WCAG 2.1.4; the 2026-10-24 audit), on the About
// page, for anyone whose speech input or habits type it by accident. The choice stays in this browser, as saves do.
// Its own module, imported by the explorer alone, so the code reaches no other page; the About page's checkbox spells
// the key out (shortcuts.test.ts holds the two together).
export const SHORTCUTS_KEY = "kc-events.shortcuts";
type ShortcutStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): ShortcutStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined; // access itself can throw when storage is blocked
  }
}

/** On unless the reader turned it off; storage that cannot be read leaves it on. */
export function shortcutsOn(storage: ShortcutStorage | undefined = browserStorage()): boolean {
  try {
    return storage?.getItem(SHORTCUTS_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Off is stored; on is the default, so turning it back on leaves nothing behind. */
export function setShortcuts(on: boolean, storage: ShortcutStorage | undefined = browserStorage()): void {
  try {
    if (on) storage?.removeItem(SHORTCUTS_KEY);
    else storage?.setItem(SHORTCUTS_KEY, "off");
  } catch {
    // blocked storage: the choice lasts as long as the page
  }
}
