import { create } from "zustand";

interface WorkflowNotesPanelState {
  isVisible: boolean;
  setVisible: (visible: boolean) => void;
  toggle: () => void;
}

export const useWorkflowNotesPanelStore = create<WorkflowNotesPanelState>((set) => ({
  isVisible: false,

  setVisible: (visible: boolean) => {
    set({ isVisible: visible });
  },

  toggle: () => {
    set((state) => ({ isVisible: !state.isVisible }));
  }
}));
