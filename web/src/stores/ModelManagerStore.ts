import { create } from "zustand";

interface ModelManagerState {
  modelSearchTerm: string;
  selectedModelType: string;
  maxModelSizeGB: number; // 0 means no limit
  showDownloadedOnly: boolean;
  setModelSearchTerm: (term: string) => void;
  setSelectedModelType: (type: string) => void;
  setMaxModelSizeGB: (gb: number) => void;
  setShowDownloadedOnly: (show: boolean) => void;
}

export const useModelManagerStore = create<ModelManagerState>((set) => ({
  modelSearchTerm: "",
  selectedModelType: "All",
  maxModelSizeGB: 0,
  showDownloadedOnly: false,
  setModelSearchTerm: (term) => set({ modelSearchTerm: term }),
  setSelectedModelType: (type) => set({ selectedModelType: type }),
  setMaxModelSizeGB: (gb) => set({ maxModelSizeGB: gb }),
  setShowDownloadedOnly: (show) => set({ showDownloadedOnly: show })
}));
