import { create } from "zustand";

export type ModelSortField = "name" | "size" | "downloads" | "likes";
export type ModelSortDirection = "asc" | "desc";
/** Which model cache the manager is browsing: the local FS or an attached worker. */
export type ModelScope = "local" | "worker";
/**
 * Which catalog the manager lists:
 * - "installed": models actually on disk / the attached worker
 * - "recommended": the curated recommended-models catalog aggregated from node
 *   metadata, browsable for download
 * - "hub": live search results from the HuggingFace Hub, browsable for download
 * - "onboarding": the guided "Get Started" experience — hardware-aware model,
 *   engine, and node-pack recommendations
 */
export type ModelSource = "onboarding" | "installed" | "recommended" | "hub";

interface ModelManagerState {
  isOpen: boolean;
  modelSearchTerm: string;
  selectedModelType: string;
  maxModelSizeGB: number; // 0 means no limit
  sortField: ModelSortField;
  sortDirection: ModelSortDirection;
  scope: ModelScope;
  source: ModelSource;
  /**
   * Manual GPU-memory budget (GB) for the onboarding recommendations, used when
   * hardware detection can't read VRAM (the default server sampler often can't).
   * `null` means "use whatever was detected".
   */
  vramOverrideGb: number | null;
  setIsOpen: (isOpen: boolean) => void;
  setModelSearchTerm: (term: string) => void;
  setSelectedModelType: (type: string) => void;
  setMaxModelSizeGB: (gb: number) => void;
  setSortField: (field: ModelSortField) => void;
  setSortDirection: (direction: ModelSortDirection) => void;
  toggleSortDirection: () => void;
  setScope: (scope: ModelScope) => void;
  setSource: (source: ModelSource) => void;
  setVramOverrideGb: (gb: number | null) => void;
}

export const useModelManagerStore = create<ModelManagerState>((set) => ({
  isOpen: false,
  modelSearchTerm: "",
  selectedModelType: "All",
  maxModelSizeGB: 0,
  sortField: "name",
  sortDirection: "asc",
  scope: "local",
  source: "installed",
  vramOverrideGb: null,
  setIsOpen: (isOpen) => set({ isOpen }),
  setModelSearchTerm: (term) => set({ modelSearchTerm: term }),
  setSelectedModelType: (type) => set({ selectedModelType: type }),
  setMaxModelSizeGB: (gb) => set({ maxModelSizeGB: gb }),
  setSortField: (field) => set({ sortField: field }),
  setSortDirection: (direction) => set({ sortDirection: direction }),
  toggleSortDirection: () =>
    set((state) => ({
      sortDirection: state.sortDirection === "asc" ? "desc" : "asc"
    })),
  setScope: (scope) => set({ scope }),
  setSource: (source) => set({ source }),
  setVramOverrideGb: (gb) => set({ vramOverrideGb: gb })
}));
