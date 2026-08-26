/**
 * Conflict Store
 *
 * Holds the conflicts a merge produced for one open document, keyed
 * `${type}:${id}` like the document sync registry.
 *
 * `accept` takes an external value from the conflict banner into the draft.
 * It is the user's own edit: each surface registers an accept callback that
 * applies the value through its own store mutation, so the accept lands on
 * the undo stack. `discard` keeps the draft version and drops the offer.
 */
import { create } from "zustand";
import type { MergeConflict } from "./documentMerge";
import { setDocumentConflictReporter } from "./documentConflictReporter";

export type DocumentConflictKey = string;

interface RegisteredConflicts {
  conflicts: MergeConflict[];
  /** Take the external value into the draft through the surface's own mutation. */
  onAccept: (unitId: string) => void;
  /** Keep the draft version; drop the offered value. */
  onDiscard: (unitId: string) => void;
}

interface ConflictState {
  byKey: Record<string, RegisteredConflicts>;
  /**
   * Replace the conflict list for one document and wire its resolvers.
   * An empty list clears the registration.
   */
  setConflicts(
    key: string,
    conflicts: MergeConflict[],
    resolvers: {
      onAccept: (unitId: string) => void;
      onDiscard: (unitId: string) => void;
    }
  ): void;
  /** Drop every conflict for one document without resolving them. */
  clear: (key: string) => void;
  /** Apply one external value through the surface's resolver, then unlist it. */
  accept: (key: string, unitId: string) => void;
  /** Reject one external value, then unlist it. */
  discard: (key: string, unitId: string) => void;
}

const withoutUnit = (
  entry: RegisteredConflicts,
  unitId: string
): MergeConflict[] => entry.conflicts.filter((c) => c.unit.id !== unitId);

export const useConflictStore = create<ConflictState>((set, get) => ({
  byKey: {},
  setConflicts: (key, conflicts, resolvers) =>
    set((state) => {
      const next = { ...state.byKey };
      if (conflicts.length === 0) {
        delete next[key];
      } else {
        next[key] = { conflicts, ...resolvers };
      }
      return { byKey: next };
    }),
  clear: (key) =>
    set((state) => {
      if (!(key in state.byKey)) return state;
      const next = { ...state.byKey };
      delete next[key];
      return { byKey: next };
    }),
  accept: (key, unitId) => {
    const entry = get().byKey[key];
    if (!entry) return;
    entry.onAccept(unitId);
    const remaining = withoutUnit(entry, unitId);
    get().setConflicts(key, remaining, {
      onAccept: entry.onAccept,
      onDiscard: entry.onDiscard
    });
  },
  discard: (key, unitId) => {
    const entry = get().byKey[key];
    if (!entry) return;
    entry.onDiscard(unitId);
    const remaining = withoutUnit(entry, unitId);
    get().setConflicts(key, remaining, {
      onAccept: entry.onAccept,
      onDiscard: entry.onDiscard
    });
  }
}));

/** Read the conflicts registered for one document key. */
export function selectConflicts(
  state: ConflictState,
  key: string
): MergeConflict[] {
  return state.byKey[key]?.conflicts ?? [];
}

/** Test seam and unmount cleanup: drop every registration. */
export function clearAllConflicts(): void {
  useConflictStore.setState({ byKey: {} });
}

// This store is the one writer of merge-conflict state. Producers (other
// stores, sync hooks) report through the documentConflictReporter registry,
// which wires here — installed once at module load, so every entry point and
// test gets it without composition-root plumbing.
setDocumentConflictReporter((key, conflicts, handlers) => {
  useConflictStore.getState().setConflicts(key, conflicts, handlers);
});
