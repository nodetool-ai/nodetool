import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

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
      showGraphPreview: true, // Default to showing graph preview
      actions: {
        toggleGraphPreview: () => {
          set((state) => ({ showGraphPreview: !state.showGraphPreview }));
        },
        setShowGraphPreview: (show: boolean) => {
          set({ showGraphPreview: show });
        },
      },
    }),
    {
      name: "workflow-list-view",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export const useWorkflowListViewActions = () =>
  useWorkflowListViewStore((state) => state.actions);

export const useShowGraphPreview = () =>
  useWorkflowListViewStore((state) => state.showGraphPreview);
