import { create } from "zustand";

export type ModelFilterStatus = "all" | "downloaded" | "not_downloaded";

interface ModelManagerState {
  modelSearchTerm: string;
  selectedModelType: string;
  maxModelSizeGB: number; // 0 means no limit
  filterStatus: ModelFilterStatus;
  setModelSearchTerm: (term: string) => void;
  setSelectedModelType: (type: string) => void;
  setMaxModelSizeGB: (gb: number) => void;
  setFilterStatus: (status: ModelFilterStatus) => void;
}

export const useModelManagerStore = create<ModelManagerState>((set) => ({
  modelSearchTerm: "",
  selectedModelType: "All",
  maxModelSizeGB: 0,
  filterStatus: "all",
  setModelSearchTerm: (term) => set({ modelSearchTerm: term }),
  setSelectedModelType: (type) => set({ selectedModelType: type }),
  setMaxModelSizeGB: (gb) => set({ maxModelSizeGB: gb }),
  setFilterStatus: (status) => set({ filterStatus: status })
}));
