/**
 * BudgetStore — the plan-before-spend budget for the creative agent.
 *
 * A single global spend ceiling (`cap`), the running `spent` this session, and
 * the current {@link DraftMode} route (cheap draft models vs. final). Persisted
 * to localStorage so a cap survives reloads. Read with selectors — never the
 * whole store.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Budget, DraftMode } from "@nodetool-ai/protocol";

interface BudgetState {
  /** Hard cap; generation whose estimate exceeds this should be gated. */
  cap: number;
  currency: string;
  /** Running spend this session. */
  spent: number;
  draftMode: DraftMode;
  setCap: (cap: number) => void;
  setDraftMode: (mode: DraftMode) => void;
  addSpent: (amount: number) => void;
  /**
   * Set the running spend to an absolute total. Used by the update pipeline to
   * mirror the sum of recorded provider costs (recompute-from-source avoids the
   * double-counting a node re-emitting `provider_cost` would cause). A
   * non-finite or negative total is ignored.
   */
  setSpent: (total: number) => void;
  reset: () => void;
}

const DEFAULT_CAP = 5;
const DEFAULT_CURRENCY = "USD";

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set) => ({
      cap: DEFAULT_CAP,
      currency: DEFAULT_CURRENCY,
      spent: 0,
      draftMode: "draft",
      setCap: (cap) =>
        set({ cap: Number.isFinite(cap) && cap >= 0 ? cap : 0 }),
      setDraftMode: (draftMode) => set({ draftMode }),
      addSpent: (amount) =>
        set((state) => ({
          spent:
            Number.isFinite(amount) && amount > 0
              ? state.spent + amount
              : state.spent
        })),
      setSpent: (total) =>
        set((state) => ({
          spent:
            Number.isFinite(total) && total >= 0 ? total : state.spent
        })),
      reset: () => set({ spent: 0 })
    }),
    {
      name: "budget-storage",
      version: 1,
      partialize: (state) => ({
        cap: state.cap,
        currency: state.currency,
        spent: state.spent,
        draftMode: state.draftMode
      })
    }
  )
);

/** Snapshot the store as a protocol {@link Budget} for cost helpers. */
export const selectBudget = (state: BudgetState): Budget => ({
  currency: state.currency,
  cap: state.cap,
  spent: state.spent
});

export default useBudgetStore;
