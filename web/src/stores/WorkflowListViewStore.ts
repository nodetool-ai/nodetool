import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SortBy = "name" | "date";

interface WorkflowListViewState {
  showGraphPreview: boolean;
  sortBy: SortBy;
  selectedTags: string[];
  actions: {
    toggleGraphPreview: () => void;
    setShowGraphPreview: (show: boolean) => void;
    setSortBy: (sortBy: SortBy) => void;
    setSelectedTags: (tags: string[]) => void;
    toggleTag: (tag: string) => void;
    clearSelectedTags: () => void;
  };
}

export const useWorkflowListViewStore = create<WorkflowListViewState>()(
  persist(
    (set) => ({
      showGraphPreview: true,
      sortBy: "date" as SortBy,
      selectedTags: [],
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
        setSelectedTags: (tags: string[]) => {
          set({ selectedTags: tags });
        },
        toggleTag: (tag: string) => {
          set((state) => ({
            selectedTags: state.selectedTags.includes(tag)
              ? state.selectedTags.filter((t) => t !== tag)
              : [...state.selectedTags, tag]
          }));
        },
        clearSelectedTags: () => {
          set({ selectedTags: [] });
        },
      },
    }),
    {
      name: "workflow-list-view",
      partialize: (state) => ({ 
        showGraphPreview: state.showGraphPreview,
        sortBy: state.sortBy,
        selectedTags: state.selectedTags
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        showGraphPreview:
          (persistedState as Partial<WorkflowListViewState>)?.showGraphPreview ??
          currentState.showGraphPreview,
        sortBy:
          (persistedState as Partial<WorkflowListViewState>)?.sortBy ??
          currentState.sortBy,
        selectedTags:
          (persistedState as Partial<WorkflowListViewState>)?.selectedTags ??
          currentState.selectedTags,
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

export const useSelectedTags = () =>
  useWorkflowListViewStore((state) => state.selectedTags);
