/**
 * useCollapsedSections
 *
 * Reusable hook for localStorage-backed collapsible section persistence.
 * Used by SketchLayersPanel and any future panel with collapsible sections.
 */

import { useState, useCallback } from "react";

export function useCollapsedSections<K extends string>(
  storageKey: string,
  defaults: Record<K, boolean>
): [Record<K, boolean>, (key: K) => void] {
  const [sections, setSections] = useState<Record<K, boolean>>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Validate structure: must be an object with boolean values
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const result = { ...defaults };
          for (const key of Object.keys(defaults)) {
            if (typeof parsed[key] === "boolean") {
              (result as Record<string, boolean>)[key] = parsed[key];
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
