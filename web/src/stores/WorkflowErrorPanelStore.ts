import { create } from "zustand";

interface WorkflowErrorPanelState {
  isOpen: boolean;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
}

/**
 * WorkflowErrorPanelStore manages the visibility state of the workflow error panel.
 *
 * This store tracks whether the error panel is open or closed, providing
 * actions to toggle, open, or close the panel.
 */
const useWorkflowErrorPanelStore = create<WorkflowErrorPanelState>((set) => ({
  isOpen: false,

  /**
   * Toggle the error panel visibility
   */
  togglePanel: () => {
    set((state) => ({ isOpen: !state.isOpen }));
  },

  /**
   * Open the error panel
   */
  openPanel: () => {
    set({ isOpen: true });
  },

  /**
   * Close the error panel
   */
  closePanel: () => {
    set({ isOpen: false });
  }
}));

export default useWorkflowErrorPanelStore;
