/**
 * WorkflowNotesStore
 *
 * Manages workflow-level notes and documentation.
 * Notes are stored in the workflow's settings object for persistence.
 */

import { create } from "zustand";
import { Workflow } from "./ApiTypes";

interface WorkflowNotesStore {
  notes: string;
  isEditing: boolean;
  setNotes: (notes: string) => void;
  setIsEditing: (isEditing: boolean) => void;
  loadNotesFromWorkflow: (workflow: Workflow) => void;
  getNotesForSave: () => Record<string, string | boolean | number | null>;
  clearNotes: () => void;
}

export const useWorkflowNotesStore = create<WorkflowNotesStore>((set, get) => ({
  notes: "",
  isEditing: false,

  setNotes: (notes: string) => {
    set({ notes });
  },

  setIsEditing: (isEditing: boolean) => {
    set({ isEditing });
  },

  loadNotesFromWorkflow: (workflow: Workflow) => {
    const settings = workflow.settings || {};
    const notes = (settings.notes as string) || "";
    set({ notes });
  },

  getNotesForSave: () => {
    const notes = get().notes;
    if (notes.length === 0 || notes.trim().length === 0) {
      return { notes: null };
    }
    return { notes };
  },

  clearNotes: () => {
    set({ notes: "" });
  }
}));

export default useWorkflowNotesStore;
