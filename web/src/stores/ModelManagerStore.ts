import { create } from "zustand";
import { persist } from "zustand/middleware";

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
   * Whether the source has been settled for this session — either the user
   * picked a tab or the manager auto-defaulted based on what's installed. Once
   * true, the empty-install auto-default never fires again, so opening the
   * (still empty) Installed tab doesn't bounce back to onboarding.
   */
  sourceInitialized: boolean;
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
  setSourceInitialized: (initialized: boolean) => void;
  setVramOverrideGb: (gb: number | null) => void;
}

export const useModelManagerStore = create<ModelManagerState>()(
  persist(
    (set) => ({
      isOpen: false,
      modelSearchTerm: "",
      selectedModelType: "All",
      maxModelSizeGB: 0,
      sortField: "name",
      sortDirection: "asc",
      scope: "local",
      source: "installed",
      sourceInitialized: false,
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
      setSourceInitialized: (initialized) =>
        set({ sourceInitialized: initialized }),
      setVramOverrideGb: (gb) => set({ vramOverrideGb: gb })
    }),
    {
      name: "model-manager",
      version: 1,
      // Only the sort and size-filter preferences survive reloads. Session
      // state (open flag, search term, active scope/source, the empty-install
      // onboarding one-shot, VRAM override) is intentionally left ephemeral so
      // each visit starts from a clean, predictable view.
      partialize: (state) => ({
        sortField: state.sortField,
        sortDirection: state.sortDirection,
        maxModelSizeGB: state.maxModelSizeGB
      })
    }
  )
);
