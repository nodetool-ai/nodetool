import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WorkflowListViewState {
  showGraphPreview: boolean;
  actions: {
    toggleGraphPreview: () => void;
    setShowGraphPreview: (show: boolean) => void;
  };
}

export const useWorkflowListViewStore = create<WorkflowListViewState>()(
  persist(
    (set) => ({
      showGraphPreview: true,
      actions: {
        toggleGraphPreview: () => {
          set((state) => ({ showGraphPreview: !state.showGraphPreview }));
        },
        setShowGraphPreview: (show: boolean) => {
          set({ showGraphPreview: show });
        },
      },
    }),
    { name: "workflow-list-view" }
  )
);

export const useWorkflowListViewActions = () =>
  useWorkflowListViewStore((state) => state.actions);

export const useShowGraphPreview = () =>
  useWorkflowListViewStore((state) => state.showGraphPreview);
