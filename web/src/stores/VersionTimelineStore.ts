/**
 * Version Timeline Store
 *
 * Research Feature: State management for the version timeline view.
 * Tracks timeline-specific state like annotations, branches, and view preferences.
 *
 * Status: ⚠️ Experimental - This is a research feature. API may change.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface VersionAnnotation {
  versionId: string;
  annotation: string;
  createdAt: string;
}

export interface VersionBranch {
  versionId: string;
  branchName: string;
  createdAt: string;
}

export interface TimelineViewState {
  showMetrics: boolean;
  expandedVersionId: string | null;
  sortOrder: "newest" | "oldest" | "complexity";
  filterSaveTypes: Set<string>;
  searchQuery: string;
}

interface VersionTimelineState {
  // Annotations per version
  annotations: Record<string, VersionAnnotation>;

  // Branches per version
  branches: Record<string, VersionBranch>;

  // Timeline view state
  viewState: TimelineViewState;

  // Actions
  addAnnotation: (versionId: string, annotation: string) => void;
  removeAnnotation: (versionId: string) => void;
  addBranch: (versionId: string, branchName: string) => void;
  removeBranch: (versionId: string) => void;
  setShowMetrics: (show: boolean) => void;
  setExpandedVersion: (versionId: string | null) => void;
  setSortOrder: (order: TimelineViewState["sortOrder"]) => void;
  toggleFilterSaveType: (saveType: string) => void;
  setSearchQuery: (query: string) => void;
  clearTimelineState: () => void;
}

const defaultViewState: TimelineViewState = {
  showMetrics: true,
  expandedVersionId: null,
  sortOrder: "newest",
  filterSaveTypes: new Set(),
  searchQuery: ""
};

export const useVersionTimelineStore = create<VersionTimelineState>()(
  persist(
    (set) => ({
      annotations: {},
      branches: {},
      viewState: defaultViewState,

      addAnnotation: (versionId: string, annotation: string): void => {
        set((state) => ({
          annotations: {
            ...state.annotations,
            [versionId]: {
              versionId,
              annotation,
              createdAt: new Date().toISOString()
            }
          }
        }));
      },

      removeAnnotation: (versionId: string): void => {
        set((state) => {
          const { [versionId]: _, ...rest } = state.annotations;
          return { annotations: rest };
        });
      },

      addBranch: (versionId: string, branchName: string): void => {
        set((state) => ({
          branches: {
            ...state.branches,
            [versionId]: {
              versionId,
              branchName,
              createdAt: new Date().toISOString()
            }
          }
        }));
      },

      removeBranch: (versionId: string): void => {
        set((state) => {
          const { [versionId]: _, ...rest } = state.branches;
          return { branches: rest };
        });
      },

      setShowMetrics: (show: boolean): void => {
        set((state) => ({
          viewState: { ...state.viewState, showMetrics: show }
        }));
      },

      setExpandedVersion: (versionId: string | null): void => {
        set((state) => ({
          viewState: { ...state.viewState, expandedVersionId: versionId }
        }));
      },

      setSortOrder: (order: TimelineViewState["sortOrder"]): void => {
        set((state) => ({
          viewState: { ...state.viewState, sortOrder: order }
        }));
      },

      toggleFilterSaveType: (saveType: string): void => {
        set((state) => {
          const newFilter = new Set(state.viewState.filterSaveTypes);
          if (newFilter.has(saveType)) {
            newFilter.delete(saveType);
          } else {
            newFilter.add(saveType);
          }
          return {
            viewState: { ...state.viewState, filterSaveTypes: newFilter }
          };
        });
      },

      setSearchQuery: (query: string): void => {
        set((state) => ({
          viewState: { ...state.viewState, searchQuery: query }
        }));
      },

      clearTimelineState: (): void => {
        set({
          annotations: {},
          branches: {},
          viewState: defaultViewState
        });
      }
    }),
    {
      name: "version-timeline-storage",
      partialize: (state) => ({
        annotations: state.annotations,
        branches: state.branches,
        viewState: state.viewState
      })
    }
  )
);

// Selector hooks for common queries
export const useVersionAnnotations = () => {
  return useVersionTimelineStore((state) => state.annotations);
};

export const useVersionBranches = () => {
  return useVersionTimelineStore((state) => state.branches);
};

export const useTimelineViewState = () => {
  return useVersionTimelineStore((state) => state.viewState);
};

export const useVersionAnnotation = (versionId: string) => {
  return useVersionTimelineStore((state) => state.annotations[versionId]);
};

export const useVersionBranch = (versionId: string) => {
  return useVersionTimelineStore((state) => state.branches[versionId]);
};

export default useVersionTimelineStore;
