import { create } from "zustand";

interface TemplateDialogState {
  saveDialogOpen: boolean;
  applyDialogOpen: boolean;
  openSaveDialog: () => void;
  closeSaveDialog: () => void;
  openApplyDialog: () => void;
  closeApplyDialog: () => void;
}

export const useTemplateDialogStore = create<TemplateDialogState>((set) => ({
  saveDialogOpen: false,
  applyDialogOpen: false,

  openSaveDialog: () => set({ saveDialogOpen: true }),
  closeSaveDialog: () => set({ saveDialogOpen: false }),

  openApplyDialog: () => set({ applyDialogOpen: true }),
  closeApplyDialog: () => set({ applyDialogOpen: false })
}));
