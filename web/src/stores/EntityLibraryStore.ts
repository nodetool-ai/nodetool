// EntityLibraryStore.ts
// -----------------------------------------------------------------
// A one-shot request for the Entities page to open its guided "Add entity"
// flow. The page is a workspace tab, so a caller that wants the flow
// (e.g. `+ New → Entity`) requests it before opening the tab. The page
// consumes the request, so a later visit lands on the library grid.
// -----------------------------------------------------------------

import { create } from "zustand";

interface EntityLibraryState {
  createRequested: boolean;
  requestCreate: () => void;
  clearCreateRequest: () => void;
}

export const useEntityLibraryStore = create<EntityLibraryState>((set) => ({
  createRequested: false,
  requestCreate: () => set({ createRequested: true }),
  clearCreateRequest: () => set({ createRequested: false })
}));
