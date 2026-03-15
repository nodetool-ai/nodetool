/**
 * Local Model Fit — Zustand Store
 *
 * Manages the user's selected/detected hardware profile and UI preferences
 * for the local-model-fit domain.  Persists to localStorage so the user's
 * choice survives reloads.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { HardwareProfile, FitTier } from "../types";
import { HARDWARE_PRESETS } from "../hardwareProfiles";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface LocalModelFitState {
  /** Currently active hardware profile. */
  hardwareProfile: HardwareProfile;

  /** Search text for filtering. */
  search: string;

  /** Active tag filters (empty = all). */
  selectedTags: string[];

  /** Active family filters (empty = all). */
  selectedFamilies: string[];

  /** Active tier filters (empty = all). */
  selectedTiers: FitTier[];

  /** Only show models that fit. */
  fitsOnly: boolean;

  /** "card" or "list" view mode. */
  viewMode: "card" | "list";

  // Actions
  setHardwareProfile: (profile: HardwareProfile) => void;
  setSearch: (search: string) => void;
  setSelectedTags: (tags: string[]) => void;
  setSelectedFamilies: (families: string[]) => void;
  setSelectedTiers: (tiers: FitTier[]) => void;
  setFitsOnly: (fitsOnly: boolean) => void;
  setViewMode: (mode: "card" | "list") => void;
  resetFilters: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const DEFAULT_PROFILE: HardwareProfile = HARDWARE_PRESETS[0] as HardwareProfile;

export const useLocalModelFitStore = create<LocalModelFitState>()(
  persist(
    (set) => ({
      hardwareProfile: DEFAULT_PROFILE,
      search: "",
      selectedTags: [],
      selectedFamilies: [],
      selectedTiers: [],
      fitsOnly: false,
      viewMode: "card",

      setHardwareProfile: (profile) => set({ hardwareProfile: profile }),
      setSearch: (search) => set({ search }),
      setSelectedTags: (tags) => set({ selectedTags: tags }),
      setSelectedFamilies: (families) => set({ selectedFamilies: families }),
      setSelectedTiers: (tiers) => set({ selectedTiers: tiers }),
      setFitsOnly: (fitsOnly) => set({ fitsOnly }),
      setViewMode: (mode) => set({ viewMode: mode }),
      resetFilters: () =>
        set({
          search: "",
          selectedTags: [],
          selectedFamilies: [],
          selectedTiers: [],
          fitsOnly: false,
        }),
    }),
    {
      name: "nodetool-local-model-fit",
      partialize: (state) => ({
        hardwareProfile: state.hardwareProfile,
        viewMode: state.viewMode,
      }),
    }
  )
);
