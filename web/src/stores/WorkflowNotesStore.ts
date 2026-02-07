/**
 * WorkflowNotesStore
 *
 * Manages workflow notes and documentation.
 * Provides CRUD operations for notes associated with workflows.
 * Notes are persisted to localStorage for offline access.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Represents a single workflow note with metadata.
 */
export interface WorkflowNote {
  id: string;
  workflowId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Maps workflow IDs to their notes.
 */
interface NotesState {
  notes: Record<string, WorkflowNote>;
  getNote: (workflowId: string) => WorkflowNote | undefined;
  setNote: (workflowId: string, content: string) => void;
  updateNote: (workflowId: string, content: string) => void;
  deleteNote: (workflowId: string) => void;
  hasNote: (workflowId: string) => boolean;
}

/**
 * Creates the WorkflowNotesStore with localStorage persistence.
 */
export const useWorkflowNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      notes: {},

      /**
       * Retrieves a note for a specific workflow.
       * @param workflowId - The ID of the workflow
       * @returns The workflow note or undefined if not found
       */
      getNote: (workflowId: string) => {
        return get().notes[workflowId];
      },

      /**
       * Creates or updates a note for a workflow.
       * @param workflowId - The ID of the workflow
       * @param content - The note content
       */
      setNote: (workflowId: string, content: string) => {
        const now = new Date().toISOString();
        const existing = get().notes[workflowId];

        set((state) => ({
          notes: {
            ...state.notes,
            [workflowId]: existing
              ? {
                  ...existing,
                  content,
                  updatedAt: now
                }
              : {
                  id: `note-${workflowId}`,
                  workflowId,
                  content,
                  createdAt: now,
                  updatedAt: now
                }
          }
        }));
      },

      /**
       * Updates an existing note's content.
       * @param workflowId - The ID of the workflow
       * @param content - The new note content
       */
      updateNote: (workflowId: string, content: string) => {
        const now = new Date().toISOString();
        const existing = get().notes[workflowId];

        if (!existing) {
          return;
        }

        set((state) => ({
          notes: {
            ...state.notes,
            [workflowId]: {
              ...existing,
              content,
              updatedAt: now
            }
          }
        }));
      },

      /**
       * Deletes a note for a workflow.
       * @param workflowId - The ID of the workflow
       */
      deleteNote: (workflowId: string) => {
        set((state) => {
          const newNotes = { ...state.notes };
          delete newNotes[workflowId];
          return { notes: newNotes };
        });
      },

      /**
       * Checks if a workflow has a note.
       * @param workflowId - The ID of the workflow
       * @returns True if the workflow has a note
       */
      hasNote: (workflowId: string) => {
        return !!get().notes[workflowId];
      }
    }),
    {
      name: "workflow-notes-storage",
      version: 1
    }
  )
);
