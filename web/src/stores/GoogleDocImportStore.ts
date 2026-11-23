/**
 * Open/close state for the "Import Google Doc" dialog, so the `+ New` menu,
 * the command menu and the new-project strip open the same dialog.
 */
import { create } from "zustand";

interface GoogleDocImportState {
  /** The project the doc is imported into, or null while closed. */
  projectId: string | null;
  open: (projectId: string) => void;
  close: () => void;
}

export const useGoogleDocImportStore = create<GoogleDocImportState>((set) => ({
  projectId: null,
  open: (projectId) => set({ projectId }),
  close: () => set({ projectId: null })
}));
