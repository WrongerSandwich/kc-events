export const STORAGE_KEY = "kc-events.saved.v2";
/** The first shape, a bare list of ids; read once into v2 when v2 is not there yet. */
export const LEGACY_KEY = "kc-events.saved.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** A saved event's id, and its last day as the visitor saw it (undefined for a recurring event, or a migrated v1 save). */
export type Saved = { id: string; last?: string };
/** The saves keyed by id; the value is the event's last day. */
export type SavedMap = ReadonlyMap<string, string | undefined>;
/** Events' last days by id, as the dataset has them (undefined for a recurring event). */
export type LastDays = ReadonlyMap<string, string | undefined>;

export type Saves = {
  list(): string[];
  has(id: string): boolean;
  /** Saves with the event's last day, or unsaves. */
  toggle(id: string, last?: string): void;
  /**
   * Brings each save's last day up to the dataset's (a date can move between runs; a migrated save has none). Ids the
   * dataset does not have keep what they were saved with.
   */
  refresh(lastDays: LastDays): void;
  /** Re-reads storage: another tab changed it. */
  reload(): void;
  /** Calls fn now and after every change; returns an unsubscribe. Shaped so Svelte can read it as $saves. */
  subscribe(fn: (saved: SavedMap) => void): () => void;
};

/** How many saves are still to come on `today`: a save with no last day counts, as does one ending today or later. */
export function upcomingCount(saved: SavedMap, today: string): number {
  let n = 0;
  for (const last of saved.values()) if (last === undefined || last >= today) n++;
  return n;
}

function parseV2(raw: string): Map<string, string | undefined> {
  const parsed: unknown = JSON.parse(raw);
  const out = new Map<string, string | undefined>();
  if (!Array.isArray(parsed)) return out;
  for (const x of parsed) {
    if (typeof x !== "object" || x === null || typeof (x as Saved).id !== "string") continue;
    const last = (x as Saved).last;
    out.set((x as Saved).id, typeof last === "string" ? last : undefined);
  }
  return out;
}

function parseV1(raw: string): Map<string, string | undefined> {
  const parsed: unknown = JSON.parse(raw);
  const ids = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  return new Map(ids.map((id) => [id, undefined]));
}

/** The stored saves; undefined when storage is missing or throws, so the caller keeps what it has in memory. */
function read(storage: StorageLike | undefined): Map<string, string | undefined> | undefined {
  if (storage === undefined) return undefined;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw !== null) return parseV2(raw);
    const legacy = storage.getItem(LEGACY_KEY);
    return legacy === null ? new Map() : parseV1(legacy);
  } catch {
    return undefined;
  }
}

function needsMigration(storage: StorageLike | undefined): boolean {
  try {
    return storage !== undefined && storage.getItem(STORAGE_KEY) === null && storage.getItem(LEGACY_KEY) !== null;
  } catch {
    return false;
  }
}

function serialize(saved: SavedMap): string {
  return JSON.stringify([...saved].map(([id, last]): Saved => (last === undefined ? { id } : { id, last })));
}

function same(a: SavedMap, b: SavedMap): boolean {
  return a.size === b.size && [...a].every(([id, last]) => b.has(id) && b.get(id) === last);
}

/** Calls every subscriber; one that throws must not stop the rest or the toggle that caused the change. */
function notify(subscribers: Set<(saved: SavedMap) => void>, saved: SavedMap): void {
  for (const fn of subscribers) {
    try {
      fn(saved);
    } catch (err) {
      console.error("saves: a subscriber threw", err);
    }
  }
}

/**
 * Browser-local saves. A storage that is missing, blocked, full, or corrupt degrades to nothing saved and never throws.
 * v1 is migrated once: with no v2 yet, its ids are written as v2 straight away (v1 itself is left alone, so a
 * failed write only means trying again next page). Saves are never pruned: a passed one is shown as passed, not dropped.
 */
export function createSaves(storage: StorageLike | undefined): Saves {
  let saved = read(storage) ?? new Map<string, string | undefined>();
  const subscribers = new Set<(saved: SavedMap) => void>();
  const persist = () => {
    try {
      storage?.setItem(STORAGE_KEY, serialize(saved));
    } catch {
      // Keep the in-memory state for this page's life; nothing else to do.
    }
  };
  const write = () => {
    persist();
    notify(subscribers, saved);
  };
  if (saved.size > 0 && needsMigration(storage)) persist();
  /** Takes what storage holds now, telling every subscriber when it differs. */
  const reload = () => {
    const fresh = read(storage);
    if (fresh !== undefined && !same(fresh, saved)) {
      saved = fresh;
      notify(subscribers, saved); // keep every button on the page in step
    }
  };
  return {
    list: () => [...saved.keys()],
    has: (id) => saved.has(id),
    toggle(id, last) {
      saved = new Map(saved);
      if (saved.has(id)) saved.delete(id);
      else saved.set(id, last);
      write();
    },
    refresh(lastDays) {
      reload(); // from what storage holds now, so a write here cannot undo another tab's
      const next = new Map(saved);
      for (const id of next.keys()) if (lastDays.has(id)) next.set(id, lastDays.get(id));
      if (same(next, saved)) return;
      saved = next;
      write();
    },
    reload,
    subscribe(fn) {
      reload();
      subscribers.add(fn);
      fn(saved);
      return () => void subscribers.delete(fn);
    },
  };
}

function browserStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined; // access itself can throw when storage is blocked
  }
}

/** The page's one store; created on first use so server rendering never touches storage. */
let singleton: Saves | undefined;
export function saves(): Saves {
  if (singleton === undefined) {
    singleton = createSaves(browserStorage());
    // Another tab's toggle: the storage event fires here, never in the tab that wrote.
    const store = singleton;
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (e) => {
        if (e.key === STORAGE_KEY || e.key === LEGACY_KEY || e.key === null) store.reload();
      });
    }
  }
  return singleton;
}
