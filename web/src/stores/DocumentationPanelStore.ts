import { create } from "zustand";

interface DocumentationPanelState {
  isVisible: boolean;
  isExpanded: boolean;
  actions: {
    show: () => void;
    hide: () => void;
    toggle: () => void;
    setExpanded: (expanded: boolean) => void;
    toggleExpanded: () => void;
  };
}

const useDocumentationPanelStore = create<DocumentationPanelState>((set) => ({
  isVisible: false,
  isExpanded: true,
  actions: {
    show: () => set({ isVisible: true }),
    hide: () => set({ isVisible: false }),
    toggle: () => set((state) => ({ isVisible: !state.isVisible })),
    setExpanded: (expanded: boolean) => set({ isExpanded: expanded }),
    toggleExpanded: () => set((state) => ({ isExpanded: !state.isExpanded }))
  }
}));

export default useDocumentationPanelStore;
