import { create } from "zustand";

export type ModelFilterStatus = "all" | "downloaded" | "not_downloaded";
export type ModelSortField = "name" | "size" | "downloads" | "likes";
export type ModelSortDirection = "asc" | "desc";

interface ModelManagerState {
  isOpen: boolean;
  modelSearchTerm: string;
  selectedModelType: string;
  maxModelSizeGB: number; // 0 means no limit
  filterStatus: ModelFilterStatus;
  sortField: ModelSortField;
  sortDirection: ModelSortDirection;
  setIsOpen: (isOpen: boolean) => void;
  setModelSearchTerm: (term: string) => void;
  setSelectedModelType: (type: string) => void;
  setMaxModelSizeGB: (gb: number) => void;
  setFilterStatus: (status: ModelFilterStatus) => void;
  setSortField: (field: ModelSortField) => void;
  setSortDirection: (direction: ModelSortDirection) => void;
  toggleSortDirection: () => void;
}

export const useModelManagerStore = create<ModelManagerState>((set) => ({
  isOpen: false,
  modelSearchTerm: "",
  selectedModelType: "All",
  maxModelSizeGB: 0,
  filterStatus: "all",
  sortField: "name",
  sortDirection: "asc",
  setIsOpen: (isOpen) => set({ isOpen }),
  setModelSearchTerm: (term) => set({ modelSearchTerm: term }),
  setSelectedModelType: (type) => set({ selectedModelType: type }),
  setMaxModelSizeGB: (gb) => set({ maxModelSizeGB: gb }),
  setFilterStatus: (status) => set({ filterStatus: status }),
  setSortField: (field) => set({ sortField: field }),
  setSortDirection: (direction) => set({ sortDirection: direction }),
  toggleSortDirection: () =>
    set((state) => ({
      sortDirection: state.sortDirection === "asc" ? "desc" : "asc"
    }))
}));
