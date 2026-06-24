import { create } from "zustand";

/**
 * Session-scoped state for the run-confirmation dialog.
 *
 * Two situations ask for confirmation before starting a run:
 * - "heavy": the "Run Workflow" button executes every node in the workspace
 *   at once; for graphs with many provider/model nodes that can fire a lot of
 *   API calls in one click. Suppressible per session.
 * - "concurrent": a run of this workflow is already in progress; confirming
 *   starts a second run alongside it. Never suppressed.
 *
 * Not persisted: `suppressedThisSession` resets on reload, which is exactly
 * the "don't ask again for this session" semantics.
 */
type RunWarningKind = "heavy" | "concurrent";

interface RunWarningState {
  /** True while the confirmation dialog is open. */
  open: boolean;
  /** What is being confirmed (drives the dialog copy). */
  kind: RunWarningKind;
  /** Heavy-node count that triggered the warning (heavy kind only). */
  heavyCount: number;
  /** Threshold that was exceeded (heavy kind only). */
  threshold: number;
  /** When true, skip the heavy-run warning for the rest of this browser
   * session. Does not apply to "concurrent" confirmations. */
  suppressedThisSession: boolean;
  /** Action to run if the user confirms. */
  onConfirm: (() => void) | null;
  requestConfirmation: (params: {
    kind?: RunWarningKind;
    heavyCount?: number;
    threshold?: number;
    onConfirm: () => void;
  }) => void;
  confirm: (dontAskAgain: boolean) => void;
  cancel: () => void;
}

export const useRunWarningStore = create<RunWarningState>((set, get) => ({
  open: false,
  kind: "heavy",
  heavyCount: 0,
  threshold: 0,
  suppressedThisSession: false,
  onConfirm: null,
  requestConfirmation: ({ kind = "heavy", heavyCount = 0, threshold = 0, onConfirm }) =>
    set({ open: true, kind, heavyCount, threshold, onConfirm }),
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
