/**
 * Open/close state for the workflow share dialog, so any surface
 * (command menu, workflow list, header) can open it for a workflow.
 */
import { create } from "zustand";

interface ShareDialogTarget {
  workflowId: string;
  workflowName: string;
}

interface WorkflowShareDialogState {
  target: ShareDialogTarget | null;
  open: (target: ShareDialogTarget) => void;
  close: () => void;
}

export const useWorkflowShareDialogStore = create<WorkflowShareDialogState>(
  (set) => ({
    target: null,
    open: (target) => set({ target }),
    close: () => set({ target: null })
  })
);
