import { create } from "zustand";

interface WorkflowListViewState {
  showGraphPreview: boolean;
  actions: {
    toggleGraphPreview: () => void;
    setShowGraphPreview: (show: boolean) => void;
  };
}

export const useWorkflowListViewStore = create<WorkflowListViewState>()(
  (set) => ({
    showGraphPreview: false,
    actions: {
      toggleGraphPreview: () => {
        set((state) => ({ showGraphPreview: !state.showGraphPreview }));
      },
      setShowGraphPreview: (show: boolean) => {
        set({ showGraphPreview: show });
      },
    },
  })
);

export const useWorkflowListViewActions = () =>
  useWorkflowListViewStore((state) => state.actions);

export const useShowGraphPreview = () =>
  useWorkflowListViewStore((state) => state.showGraphPreview);
