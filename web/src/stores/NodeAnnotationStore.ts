import { create } from "zustand";

interface NodeAnnotationState {
  editingNodeId: string | null;
  annotationText: string;
  isDialogOpen: boolean;
  openAnnotationDialog: (nodeId: string, currentAnnotation?: string) => void;
  closeAnnotationDialog: () => void;
  setAnnotationText: (text: string) => void;
  clearEditingState: () => void;
}

const useNodeAnnotationStore = create<NodeAnnotationState>((set) => ({
  editingNodeId: null,
  annotationText: "",
  isDialogOpen: false,
  openAnnotationDialog: (nodeId, currentAnnotation = "") =>
    set({
      editingNodeId: nodeId,
      annotationText: currentAnnotation,
      isDialogOpen: true
    }),
  closeAnnotationDialog: () =>
    set({
      isDialogOpen: false,
      editingNodeId: null,
      annotationText: ""
    }),
  setAnnotationText: (text) => set({ annotationText: text }),
  clearEditingState: () =>
    set({
      editingNodeId: null,
      annotationText: "",
      isDialogOpen: false
    })
}));

export default useNodeAnnotationStore;
