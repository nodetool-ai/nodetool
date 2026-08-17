/**
 * Open/close state for the bug-report dialog, so every error surface — a
 * failed node, a crashed panel, the route error boundary, the command menu —
 * opens the same form with the context it happens to know.
 */
import { create } from "zustand";
import type { BugReportContext } from "../utils/bugReportBundle";

interface BugReportState {
  context: BugReportContext | null;
  open: (context: BugReportContext) => void;
  close: () => void;
}

export const useBugReportStore = create<BugReportState>((set) => ({
  context: null,
  open: (context) => set({ context }),
  close: () => set({ context: null })
}));

/**
 * Open the dialog from outside React — class error boundaries and plain
 * callbacks have no hook to call.
 */
export const openBugReport = (context: BugReportContext): void => {
  useBugReportStore.getState().open(context);
};
