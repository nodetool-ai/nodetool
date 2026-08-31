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
 *
 * Resolvers are held per offer, not per document. A batch of external writes
 * arrives as several merges and the user answers at their own pace, so an
 * offer must stay resolvable by the merge that made it — its callback closes
 * over the server document that offer came from.
 */
import { create } from "zustand";
import type { MergeConflict } from "./documentMerge";
import { setDocumentConflictReporter } from "./documentConflictReporter";

interface ConflictResolvers {
  /** Take the external value into the draft through the surface's own mutation. */
  onAccept: (unitId: string) => void;
  /** Keep the draft version; drop the offered value. */
  onDiscard: (unitId: string) => void;
}

interface RegisteredConflicts {
  conflicts: MergeConflict[];
  /** The resolvers each offer was registered with, by `kind:id`. */
  resolvers: Record<string, ConflictResolvers>;
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
    resolvers: ConflictResolvers
  ): void;
  /**
   * Fold one merge's conflicts into what is already offered.
   *
   * Replacing the list on every merge dropped every offer the user had not
   * reached yet: an agent rendering six stills onto a dirty board left five of
   * them unreachable, with no sign anything had been refused. A unit offered
   * again carries the newer external value and the newer resolver.
   */
  addConflicts(
    key: string,
    conflicts: MergeConflict[],
    resolvers: ConflictResolvers
  ): void;
  /** Drop every conflict for one document without resolving them. */
  clear: (key: string) => void;
  /** Apply one external value through the surface's resolver, then unlist it. */
  accept: (key: string, unitId: string) => void;
  /** Reject one external value, then unlist it. */
  discard: (key: string, unitId: string) => void;
}

const unitKey = (conflict: MergeConflict): string =>
  `${conflict.unit.kind}:${conflict.unit.id}`;

/** Drop one unit's offer and its resolver; returns null when none is left. */
const withoutUnit = (
  entry: RegisteredConflicts,
  unitId: string
): RegisteredConflicts | null => {
  const conflicts = entry.conflicts.filter((c) => c.unit.id !== unitId);
  if (conflicts.length === 0) return null;
  const keep = new Set(conflicts.map(unitKey));
  return {
    conflicts,
    resolvers: Object.fromEntries(
      Object.entries(entry.resolvers).filter(([k]) => keep.has(k))
    )
  };
};

/** The resolver registered for one unit, whichever merge registered it. */
const resolverFor = (
  entry: RegisteredConflicts,
  unitId: string
): ConflictResolvers | undefined => {
  const conflict = entry.conflicts.find((c) => c.unit.id === unitId);
  return conflict ? entry.resolvers[unitKey(conflict)] : undefined;
};

const replaceEntry = (
  state: ConflictState,
  key: string,
  entry: RegisteredConflicts | null
): Pick<ConflictState, "byKey"> => {
  const byKey = { ...state.byKey };
  if (entry) byKey[key] = entry;
  else delete byKey[key];
  return { byKey };
};

export const useConflictStore = create<ConflictState>((set, get) => ({
  byKey: {},
  setConflicts: (key, conflicts, resolvers) =>
    set((state) =>
      replaceEntry(
        state,
        key,
        conflicts.length === 0
          ? null
          : {
              conflicts,
              resolvers: Object.fromEntries(
                conflicts.map((c) => [unitKey(c), resolvers])
              )
            }
      )
    ),
  addConflicts: (key, conflicts, resolvers) =>
    set((state) => {
      const existing = state.byKey[key];
      if (conflicts.length === 0) return state;
      const byUnit = new Map(
        (existing?.conflicts ?? []).map((c) => [unitKey(c), c])
      );
      const merged = { ...(existing?.resolvers ?? {}) };
      for (const conflict of conflicts) {
        byUnit.set(unitKey(conflict), conflict);
        merged[unitKey(conflict)] = resolvers;
      }
      return replaceEntry(state, key, {
        conflicts: [...byUnit.values()],
        resolvers: merged
      });
    }),
  clear: (key) =>
    set((state) =>
      key in state.byKey ? replaceEntry(state, key, null) : state
    ),
  accept: (key, unitId) => {
    const entry = get().byKey[key];
    if (!entry) return;
    resolverFor(entry, unitId)?.onAccept(unitId);
    set((state) => replaceEntry(state, key, withoutUnit(entry, unitId)));
  },
  discard: (key, unitId) => {
    const entry = get().byKey[key];
    if (!entry) return;
    resolverFor(entry, unitId)?.onDiscard(unitId);
    set((state) => replaceEntry(state, key, withoutUnit(entry, unitId)));
  }
}));

/** Test seam and unmount cleanup: drop every registration. */
export function clearAllConflicts(): void {
  useConflictStore.setState({ byKey: {} });
}

// This store is the one writer of merge-conflict state. Producers (other
// stores, sync hooks) report through the documentConflictReporter registry,
// which wires here — installed once at module load, so every entry point and
// test gets it without composition-root plumbing. They are all merge
// producers, so they fold into what is already offered rather than replacing.
setDocumentConflictReporter((key, conflicts, handlers) => {
  useConflictStore.getState().addConflicts(key, conflicts, handlers);
});
