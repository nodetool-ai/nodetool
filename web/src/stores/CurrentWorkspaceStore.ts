import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CurrentWorkspaceState {
  lastUsedWorkspaceId: string | null;
  setLastUsedWorkspaceId: (id: string | null) => void;
}

export const useCurrentWorkspaceStore = create<CurrentWorkspaceState>()(
  persist(
    (set) => ({
      lastUsedWorkspaceId: null,
      setLastUsedWorkspaceId: (id) => set({ lastUsedWorkspaceId: id })
    }),
    { name: "nodetool-current-workspace" }
  )
);
