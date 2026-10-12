/**
 * `localStorage` for the variables a document declares `scope: "user"` with
 * `persist: true`. Everything else lives only as long as the page.
 */
import type { VariableDeclaration } from "@nodetool-ai/app-runtime";

const storageKey = (instanceKey: string): string => `nodetool-app:${instanceKey}:variables`;

const persistedIds = (variables: ReadonlyArray<VariableDeclaration>): Set<string> =>
  new Set(variables.filter((v) => v.scope === "user" && v.persist).map((v) => v.id));

export function loadPersistedVariables(
  instanceKey: string,
  variables: ReadonlyArray<VariableDeclaration>
): Record<string, unknown> {
  const ids = persistedIds(variables);
  if (ids.size === 0) return {};
  try {
    const raw = window.localStorage.getItem(storageKey(instanceKey));
    const stored: unknown = raw ? JSON.parse(raw) : {};
    if (typeof stored !== "object" || stored === null) return {};
    return Object.fromEntries(
      Object.entries(stored as Record<string, unknown>).filter(([id]) => ids.has(id))
    );
  } catch {
    // Storage blocked or the entry is corrupt: start from the defaults.
    return {};
  }
}

export function savePersistedVariables(
  instanceKey: string,
  variables: ReadonlyArray<VariableDeclaration>,
  values: Record<string, unknown>
): void {
  const ids = persistedIds(variables);
  if (ids.size === 0) return;
  const kept = Object.fromEntries(Object.entries(values).filter(([id]) => ids.has(id)));
  try {
    window.localStorage.setItem(storageKey(instanceKey), JSON.stringify(kept));
  } catch {
    // Storage blocked or full: the value simply does not outlive the page.
  }
}
