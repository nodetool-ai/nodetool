// WorkflowDocumentationStore.ts
// -----------------------------------------------
// Zustand store for managing workflow documentation.
// Provides rich markdown documentation capabilities for workflows.
// -----------------------------------------------

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Workflow documentation data structure
 */
export interface WorkflowDocumentation {
  workflowId: string;
  content: string;
  lastModified: number;
}

/**
 * Mapping of workflow IDs to their documentation
 */
export type WorkflowDocumentationMap = Record<string, WorkflowDocumentation>;

interface WorkflowDocumentationState {
  documentation: WorkflowDocumentationMap;
  isEditing: boolean;
  currentWorkflowId: string | null;
}

interface WorkflowDocumentationActions {
  setDocumentation: (workflowId: string, content: string) => void;
  getDocumentation: (workflowId: string) => string | null;
  deleteDocumentation: (workflowId: string) => void;
  setIsEditing: (isEditing: boolean) => void;
  setCurrentWorkflowId: (workflowId: string | null) => void;
  clearAll: () => void;
}

type WorkflowDocumentationStore = WorkflowDocumentationState &
  WorkflowDocumentationActions;

/**
 * Creates the workflow documentation store with localStorage persistence
 */
export const useWorkflowDocumentationStore = create<WorkflowDocumentationStore>()(
  persist(
    (set, get) => ({
      // Initial state
      documentation: {},
      isEditing: false,
      currentWorkflowId: null,

      /**
       * Sets or updates documentation for a workflow
       * @param workflowId - The workflow ID
       * @param content - The markdown content
       */
      setDocumentation: (workflowId: string, content: string) =>
        set((state) => ({
          documentation: {
            ...state.documentation,
            [workflowId]: {
              workflowId,
              content,
              lastModified: Date.now()
            }
          }
        })),

      /**
       * Gets documentation for a workflow
       * @param workflowId - The workflow ID
       * @returns The markdown content or null if not found
       */
      getDocumentation: (workflowId: string) => {
        const doc = get().documentation[workflowId];
        return doc ? doc.content : null;
      },

      /**
       * Deletes documentation for a workflow
       * @param workflowId - The workflow ID
       */
      deleteDocumentation: (workflowId: string) =>
        set((state) => {
          const newDocs = { ...state.documentation };
          delete newDocs[workflowId];
          return { documentation: newDocs };
        }),

      /**
       * Sets the editing state
       * @param isEditing - Whether the documentation is being edited
       */
      setIsEditing: (isEditing: boolean) =>
        set({ isEditing }),

      /**
       * Sets the current workflow ID for documentation
       * @param workflowId - The workflow ID or null
       */
      setCurrentWorkflowId: (workflowId: string | null) =>
        set({ currentWorkflowId: workflowId }),

      /**
       * Clears all documentation data
       */
      clearAll: () =>
        set({
          documentation: {},
          isEditing: false,
          currentWorkflowId: null
        })
    }),
    {
      name: "workflow-documentation-storage",
      partialize: (state) => ({
        documentation: state.documentation
      })
    }
  )
);
