import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "nodetool.timeline.inspector.fold";
const OPEN_EVENT = "nodetool:timeline-inspector-open-fold";

type FoldMap = Record<string, boolean>;

function readMap(): FoldMap {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as FoldMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: FoldMap): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage might be full or unavailable — fold state isn't critical.
  }
}

export function openPersistedFold(id: string): void {
  const map = readMap();
  map[id] = true;
  writeMap(map);
  window.dispatchEvent(new CustomEvent<string>(OPEN_EVENT, { detail: id }));
}

/**
 * Persist a single boolean fold state by `id` to localStorage. Multiple
 * call sites with the same id share state. Default is closed.
 */
export function usePersistedFold(
  id: string,
  defaultOpen = false
): [boolean, (next: boolean) => void] {
  const [open, setOpen] = useState<boolean>(() => {
    const map = readMap();
    return id in map ? Boolean(map[id]) : defaultOpen;
  });

  useEffect(() => {
    const map = readMap();
    if (id in map) {
      const stored = Boolean(map[id]);
      setOpen((prev) => (prev === stored ? prev : stored));
    }
  }, [id]);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      if ((event as CustomEvent<string>).detail === id) {
        setOpen(true);
      }
    };
    window.addEventListener(OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_EVENT, handleOpen);
  }, [id]);

  const update = useCallback(
    (next: boolean) => {
      setOpen(next);
      const map = readMap();
      map[id] = next;
      writeMap(map);
    },
    [id]
  );

  return [open, update];
}
