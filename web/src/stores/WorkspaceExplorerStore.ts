import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Which workspace the Workspace Explorer is browsing.
 *
 * Kept apart from {@link useCurrentWorkspaceStore}: that one remembers where
 * the next *run* writes and follows the active workflow, while this is a
 * viewing choice. Browsing a folder must not repoint a workflow, and switching
 * workflow tabs must not move the explorer out from under the user.
 */
interface WorkspaceExplorerState {
  browsedWorkspaceId: string | null;
  setBrowsedWorkspaceId: (id: string | null) => void;
}

export const useWorkspaceExplorerStore = create<WorkspaceExplorerState>()(
  persist(
    (set) => ({
      browsedWorkspaceId: null,
      setBrowsedWorkspaceId: (id) => set({ browsedWorkspaceId: id })
    }),
    { name: "nodetool-workspace-explorer" }
  )
);
