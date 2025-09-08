import { create } from "zustand";

export type ModelSource = "downloaded" | "recommended";

interface ModelManagerState {
  modelSource: ModelSource;
  modelSearchTerm: string;
  selectedModelType: string;
  setModelSource: (source: ModelSource) => void;
  setModelSearchTerm: (term: string) => void;
  setSelectedModelType: (type: string) => void;
  handleModelSourceChange: (
    event: React.MouseEvent<HTMLElement>,
    newSource: ModelSource | null
  ) => void;
}

export const useModelManagerStore = create<ModelManagerState>((set) => ({
  modelSource: "downloaded",
  modelSearchTerm: "",
  selectedModelType: "All",
  setModelSource: (source) => set({ modelSource: source }),
  setModelSearchTerm: (term) => set({ modelSearchTerm: term }),
  setSelectedModelType: (type) => set({ selectedModelType: type }),
  handleModelSourceChange: (event, newSource) => {
    if (newSource !== null) {
      set({ modelSource: newSource });
    }
  }
}));
