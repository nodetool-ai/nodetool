import { useState, useCallback } from "react";

export function useCollapsedSections<K extends string>(
  storageKey: string,
  defaults: Record<K, boolean>
): [Record<K, boolean>, (key: K) => void] {
  const [sections, setSections] = useState<Record<K, boolean>>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const record = parsed as Record<string, unknown>;
          const result = { ...defaults };
          for (const key of Object.keys(defaults)) {
            if (typeof record[key] === "boolean") {
              (result as Record<string, boolean>)[key] = record[key] as boolean;
            }
          }
          return result;
        }
      }
    } catch {
      // localStorage parse failed, use defaults
    }
    return defaults;
  });

  const toggle = useCallback(
    (key: K) => {
      setSections((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // localStorage write failed, ignore
        }
        return next;
      });
    },
    [storageKey]
  );

  return [sections, toggle];
}
