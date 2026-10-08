// EntityLibraryStore.ts
// -----------------------------------------------------------------
// Whether the Entities page shows its guided "Add entity" flow or the
// library grid. The page is a workspace tab, so a caller that wants the
// flow (e.g. `+ New → Entity`) sets it before opening the tab.
// -----------------------------------------------------------------

import { create } from "zustand";

interface EntityLibraryState {
  creating: boolean;
  setCreating: (creating: boolean) => void;
}

export const useEntityLibraryStore = create<EntityLibraryState>((set) => ({
  creating: false,
  setCreating: (creating) => set({ creating })
}));
