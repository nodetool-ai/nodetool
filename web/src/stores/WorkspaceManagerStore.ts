/**
 * Manages workspace organization state.
 *
 * Handles the workspace manager dialog visibility. Workspaces provide
 * isolated environments for organizing workflows and assets separately.
 * Used primarily in desktop/ Electron environments with local file access.
 *
 * Features:
 * - Workspace manager dialog open/close state
 * - Multiple workspace support for organization
 * - Local file system integration
 *
 * @example
 * ```typescript
 * import { useWorkspaceManagerStore } from './WorkspaceManagerStore';
 *
 * const store = useWorkspaceManagerStore();
 * store.setIsOpen(true);
 * ```
 */
import { create } from "zustand";

interface WorkspaceManagerState {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export const useWorkspaceManagerStore = create<WorkspaceManagerState>((set) => ({
  isOpen: false,
  setIsOpen: (isOpen) => set({ isOpen })
}));
