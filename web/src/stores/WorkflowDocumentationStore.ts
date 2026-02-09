/**
 * WorkflowDocumentationStore manages workflow-level documentation and notes.
 *
 * This store handles the extended documentation (markdown) that complements
 * the basic workflow description field, allowing users to add comprehensive
 * notes, usage instructions, and documentation to their workflows.
 *
 * Features:
 * - Markdown-rich documentation notes
 * - Per-workflow documentation storage
 * - Auto-save functionality
 * - Change tracking for dirty state
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface WorkflowDocumentation {
  workflowId: string;
  notes: string;
  lastModified: string;
}

interface WorkflowDocumentationState {
  documentations: Record<string, WorkflowDocumentation>;
  getDocumentation: (workflowId: string) => WorkflowDocumentation | undefined;
  setDocumentation: (workflowId: string, notes: string) => void;
  updateNotes: (workflowId: string, notes: string) => void;
  deleteDocumentation: (workflowId: string) => void;
  clearAll: () => void;
}

export const useWorkflowDocumentationStore = create<WorkflowDocumentationState>()(
  persist(
    (set, get) => ({
      documentations: {},

      getDocumentation: (workflowId: string) => {
        const state = get();
        return state.documentations[workflowId];
      },

      setDocumentation: (workflowId: string, notes: string) => {
        set((state) => ({
          documentations: {
            ...state.documentations,
            [workflowId]: {
              workflowId,
              notes,
              lastModified: new Date().toISOString()
            }
          }
        }));
      },

      updateNotes: (workflowId: string, notes: string) => {
        set((state) => {
          const existing = state.documentations[workflowId];
          if (existing && existing.notes === notes) {
            return state;
          }
          return {
            documentations: {
              ...state.documentations,
              [workflowId]: {
                workflowId,
                notes,
                lastModified: new Date().toISOString()
              }
            }
          };
        });
      },

      deleteDocumentation: (workflowId: string) => {
        set((state) => {
          const newDocumentations = { ...state.documentations };
          delete newDocumentations[workflowId];
          return { documentations: newDocumentations };
        });
      },

      clearAll: () => {
        set({ documentations: {} });
      }
    }),
    {
      name: 'workflow-documentation-storage',
      partialize: (state: WorkflowDocumentationState) => ({
        documentations: state.documentations
      })
    }
  )
);
