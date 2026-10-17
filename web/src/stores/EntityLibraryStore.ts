// EntityLibraryStore.ts
// -----------------------------------------------------------------
// A one-shot request for the Entities page to open its guided "Add entity"
// flow. The page is a workspace tab, so a caller that wants the flow
// (e.g. `+ New → Entity`) requests it before opening the tab. The page
// consumes the request, so a later visit lands on the library grid.
// A request may name an image asset to preselect as the reference
// (the Library's "Use as entity…" item, study-7).
// -----------------------------------------------------------------

import { create } from "zustand";

interface EntityLibraryState {
  createRequested: boolean;
  /** The reference image the requested flow starts with, if any. */
  createAssetId: string | null;
  requestCreate: (assetId?: string) => void;
  clearCreateRequest: () => void;
}

export const useEntityLibraryStore = create<EntityLibraryState>((set) => ({
  createRequested: false,
  createAssetId: null,
  requestCreate: (assetId) =>
    set({ createRequested: true, createAssetId: assetId ?? null }),
  clearCreateRequest: () => set({ createRequested: false, createAssetId: null })
}));
