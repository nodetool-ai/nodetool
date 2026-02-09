/**
 * WorkflowNotesStore
 *
 * Manages workflow notes and documentation for each workflow.
 * Provides rich text editing capabilities with markdown support.
 * Notes are persisted to localStorage for cross-session availability.
 *
 * Features:
 * - Per-workflow notes storage keyed by workflow ID
 * - Rich text content with markdown formatting
 * - Automatic save to localStorage
 * - Notes retrieval and update operations
 * - Notes existence checking
 *
 * @example
 * ```typescript
 * import { useWorkflowNotesStore } from './stores/WorkflowNotesStore';
 *
 * const getNotes = useWorkflowNotesStore(state => state.getNotes);
 * const updateNotes = useWorkflowNotesStore(state => state.updateNotes);
 *
 * const notes = getNotes('workflow-123');
 * updateNotes('workflow-123', '# My Workflow Notes\n\nThis workflow does X...');
 * ```
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface WorkflowNote {
  workflowId: string;
  content: string;
  updatedAt: number;
}

interface WorkflowNotesState {
  notes: Record<string, WorkflowNote>;
  getNotes: (workflowId: string) => string | null;
  updateNotes: (workflowId: string, content: string) => void;
  hasNotes: (workflowId: string) => boolean;
  deleteNotes: (workflowId: string) => void;
  getAllNotes: () => WorkflowNote[];
}

export const useWorkflowNotesStore = create<WorkflowNotesState>()(
  persist(
    (set, get) => ({
      notes: {},

      getNotes: (workflowId: string) => {
        const note = get().notes[workflowId];
        return note?.content ?? null;
      },

      updateNotes: (workflowId: string, content: string) => {
        set((state) => ({
          notes: {
            ...state.notes,
            [workflowId]: {
              workflowId,
              content,
              updatedAt: Date.now()
            }
          }
        }));
      },

      hasNotes: (workflowId: string) => {
        const note = get().notes[workflowId];
        return note !== undefined && note.content.length > 0;
      },

      deleteNotes: (workflowId: string) => {
        set((state) => {
          const newNotes = { ...state.notes };
          delete newNotes[workflowId];
          return { notes: newNotes };
        });
      },

      getAllNotes: () => {
        return Object.values(get().notes);
      }
    }),
    {
      name: "nodetool-workflow-notes",
      version: 1
    }
  )
);

export default useWorkflowNotesStore;
