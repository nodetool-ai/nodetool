import { create } from "zustand";

/**
 * Session-scoped state for the "large run" confirmation dialog.
 *
 * The "Run Workflow" button executes every node in the workspace at once. For
 * graphs with many provider/model nodes that can fire a lot of API calls in
 * one click, so we ask the user to confirm. Not persisted: `suppressedThisSession`
 * resets on reload, which is exactly the "don't ask again for this session"
 * semantics.
 */
interface RunWarningState {
  /** True while the confirmation dialog is open. */
  open: boolean;
  /** Heavy-node count that triggered the warning. */
  heavyCount: number;
  /** Threshold that was exceeded (shown in the dialog). */
  threshold: number;
  /** When true, skip the warning for the rest of this browser session. */
  suppressedThisSession: boolean;
  /** Action to run if the user confirms. */
  onConfirm: (() => void) | null;
  requestConfirmation: (params: {
    heavyCount: number;
    threshold: number;
    onConfirm: () => void;
  }) => void;
  confirm: (dontAskAgain: boolean) => void;
  cancel: () => void;
}

export const useRunWarningStore = create<RunWarningState>((set, get) => ({
  open: false,
  heavyCount: 0,
  threshold: 0,
  suppressedThisSession: false,
  onConfirm: null,
  requestConfirmation: ({ heavyCount, threshold, onConfirm }) =>
    set({ open: true, heavyCount, threshold, onConfirm }),
  confirm: (dontAskAgain) => {
    const { onConfirm, suppressedThisSession } = get();
    set({
      open: false,
      onConfirm: null,
      suppressedThisSession: dontAskAgain || suppressedThisSession
    });
    onConfirm?.();
  },
  cancel: () => set({ open: false, onConfirm: null })
}));

export default useRunWarningStore;
