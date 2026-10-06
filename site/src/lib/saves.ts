export const STORAGE_KEY = "kc-events.saved.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type Saves = {
  list(): string[];
  has(id: string): boolean;
  toggle(id: string): void;
  /** Calls fn now and after every change; returns an unsubscribe. Shaped so Svelte can read it as $saves. */
  subscribe(fn: (ids: ReadonlySet<string>) => void): () => void;
};

/** The stored ids; undefined when storage is missing or throws, so the caller keeps what it has in memory. */
function read(storage: StorageLike | undefined): string[] | undefined {
  if (storage === undefined) return undefined;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return undefined;
  }
}

/** Calls every subscriber; one that throws must not stop the rest or the toggle that caused the change. */
function notify(subscribers: Set<(ids: ReadonlySet<string>) => void>, ids: ReadonlySet<string>): void {
  for (const fn of subscribers) {
    try {
      fn(ids);
    } catch (err) {
      console.error("saves: a subscriber threw", err);
    }
  }
}

/** Browser-local saves. A storage that is missing, blocked, full, or corrupt degrades to nothing saved and never throws. */
export function createSaves(storage: StorageLike | undefined): Saves {
  let ids = new Set(read(storage) ?? []);
  const subscribers = new Set<(ids: ReadonlySet<string>) => void>();
  const write = () => {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify([...ids]));
    } catch {
      // Keep the in-memory state for this page's life; nothing else to do.
    }
    notify(subscribers, ids);
  };
  return {
    list: () => [...ids],
    has: (id) => ids.has(id),
    toggle(id) {
      ids = new Set(ids);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      write();
    },
    subscribe(fn) {
      const fresh = read(storage);
      if (fresh !== undefined && (fresh.length !== ids.size || fresh.some((id) => !ids.has(id)))) {
        ids = new Set(fresh);
        notify(subscribers, ids); // keep every button on the page in step
      }
      subscribers.add(fn);
      fn(ids);
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
  return (singleton ??= createSaves(browserStorage()));
}
