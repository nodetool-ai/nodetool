import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SortBy = "name" | "date";

interface WorkflowListViewState {
  showGraphPreview: boolean;
  sortBy: SortBy;
  actions: {
    toggleGraphPreview: () => void;
    setShowGraphPreview: (show: boolean) => void;
    setSortBy: (sortBy: SortBy) => void;
  };
}

export const useWorkflowListViewStore = create<WorkflowListViewState>()(
  persist(
    (set) => ({
      showGraphPreview: true,
      sortBy: "date" as SortBy,
      actions: {
        toggleGraphPreview: () => {
          set((state) => ({ showGraphPreview: !state.showGraphPreview }));
        },
        setShowGraphPreview: (show: boolean) => {
          set({ showGraphPreview: show });
        },
        setSortBy: (sortBy: SortBy) => {
          set({ sortBy });
        },
      },
    }),
    {
      name: "workflow-list-view",
      partialize: (state) => ({ 
        showGraphPreview: state.showGraphPreview,
        sortBy: state.sortBy 
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        showGraphPreview:
          (persistedState as Partial<WorkflowListViewState>)?.showGraphPreview ??
          currentState.showGraphPreview,
        sortBy:
          (persistedState as Partial<WorkflowListViewState>)?.sortBy ??
          currentState.sortBy,
      }),
    }
  )
);

export const useWorkflowListViewActions = () =>
  useWorkflowListViewStore((state) => state.actions);

export const useShowGraphPreview = () =>
  useWorkflowListViewStore((state) => state.showGraphPreview);

export const useSortBy = () =>
  useWorkflowListViewStore((state) => state.sortBy);
