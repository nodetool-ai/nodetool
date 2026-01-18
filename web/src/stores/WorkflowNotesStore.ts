/**
 * WorkflowNotesStore
 *
 * Manages workflow notes for documentation purposes.
 * Notes are stored in localStorage keyed by workflow ID.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WorkflowNote {
  workflowId: string;
  content: string;
  updatedAt: number;
}

interface WorkflowNotesStore {
  notes: Record<string, string>;
  getNotes: (workflowId: string) => string;
  setNotes: (workflowId: string, content: string) => void;
  clearNotes: (workflowId: string) => void;
  getAllNotes: () => WorkflowNote[];
}

export const useWorkflowNotesStore = create<WorkflowNotesStore>()(
  persist(
    (set, get) => ({
      notes: {},

      getNotes: (workflowId: string): string => {
        return get().notes[workflowId] || "";
      },

      setNotes: (workflowId: string, content: string): void => {
        set((state) => ({
          notes: {
            ...state.notes,
            [workflowId]: content
          }
        }));
      },

      clearNotes: (workflowId: string): void => {
        set((state) => {
          const { [workflowId]: _, ...rest } = state.notes;
          return { notes: rest };
        });
      },

      getAllNotes: (): WorkflowNote[] => {
        const state = get();
        return Object.entries(state.notes).map(([workflowId, content]) => ({
          workflowId,
          content,
          updatedAt: Date.now()
        }));
      }
    }),
    {
      name: "nodetool-workflow-notes",
      version: 1
    }
  )
);

export default useWorkflowNotesStore;
