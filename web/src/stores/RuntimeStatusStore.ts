import { create } from "zustand";

/**
 * Installed state of the host runtimes (FFmpeg, Python, ...) that nodes
 * require, shared by every NodeDependencyWarning so one refresh updates all.
 */
interface RuntimeStatusState {
  /** Installed flag by runtime id and package id; null until a load succeeds. */
  statuses: Record<string, boolean> | null;
  /** True once a load has been attempted, whether or not it succeeded. */
  loaded: boolean;
  setStatuses: (statuses: Record<string, boolean>) => void;
  markLoaded: () => void;
}

const useRuntimeStatusStore = create<RuntimeStatusState>()((set) => ({
  statuses: null,
  loaded: false,
  setStatuses: (statuses) => set({ statuses, loaded: true }),
  markLoaded: () => set({ loaded: true })
}));

export default useRuntimeStatusStore;
