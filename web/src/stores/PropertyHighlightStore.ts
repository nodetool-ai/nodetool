import { create } from "zustand";

const HIGHLIGHT_DURATION_MS = 2500;

/**
 * Transiently highlights a single property field in the inspector — e.g. the
 * model picker, when guiding a user to set a model after a run was blocked.
 * The field (see PropertyField) pulses and scrolls into view, then clears
 * itself after a short delay. `token` bumps on each request so re-triggering
 * the same field restarts the pulse.
 */
interface PropertyHighlightState {
  nodeId: string | null;
  propertyName: string | null;
  token: number;
  highlight: (nodeId: string, propertyName: string) => void;
  clear: () => void;
}

let clearTimer: ReturnType<typeof setTimeout> | null = null;

export const usePropertyHighlightStore = create<PropertyHighlightState>(
  (set, get) => ({
    nodeId: null,
    propertyName: null,
    token: 0,
    highlight: (nodeId, propertyName) => {
      if (clearTimer) clearTimeout(clearTimer);
      set({ nodeId, propertyName, token: get().token + 1 });
      clearTimer = setTimeout(() => {
        set({ nodeId: null, propertyName: null });
        clearTimer = null;
      }, HIGHLIGHT_DURATION_MS);
    },
    clear: () => {
      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = null;
      set({ nodeId: null, propertyName: null });
    }
  })
);

export default usePropertyHighlightStore;
