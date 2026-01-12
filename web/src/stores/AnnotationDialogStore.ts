import { create } from "zustand";

interface AnnotationDialogState {
  isOpen: boolean;
  nodeId: string | null;
  initialAnnotation: string;
  nodeTitle: string | undefined;
  openAnnotationDialog: (
    nodeId: string,
    initialAnnotation?: string,
    nodeTitle?: string
  ) => void;
  closeAnnotationDialog: () => void;
}

const useAnnotationDialogStore = create<AnnotationDialogState>((set) => ({
  isOpen: false,
  nodeId: null,
  initialAnnotation: "",
  nodeTitle: undefined,
  openAnnotationDialog: (nodeId, initialAnnotation = "", nodeTitle) =>
    set({
      isOpen: true,
      nodeId,
      initialAnnotation,
      nodeTitle
    }),
  closeAnnotationDialog: () =>
    set({
      isOpen: false,
      nodeId: null,
      initialAnnotation: "",
      nodeTitle: undefined
    })
}));

export default useAnnotationDialogStore;
