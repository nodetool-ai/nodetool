import { create } from "zustand";

interface AnnotationDialogState {
  isOpen: boolean;
  nodeId: string | null;
  openAnnotationDialog: (nodeId: string) => void;
  closeAnnotationDialog: () => void;
}

const useAnnotationDialogStore = create<AnnotationDialogState>((set) => ({
  isOpen: false,
  nodeId: null,
  openAnnotationDialog: (nodeId: string) =>
    set({ isOpen: true, nodeId }),
  closeAnnotationDialog: () =>
    set({ isOpen: false, nodeId: null })
}));

export default useAnnotationDialogStore;
