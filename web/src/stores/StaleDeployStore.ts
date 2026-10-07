import { create } from "zustand";

/**
 * State for the "new version available" dialog.
 *
 * - "update": the tab became visible again and a newer deploy is live.
 * - "chunk-error": part of the app failed to load because a newer deploy
 *   replaced this tab's assets.
 *
 * Not persisted: a reload starts a fresh tab with no stale deploy.
 */
export type StaleDeployReason = "update" | "chunk-error";

interface StaleDeployState {
  open: boolean;
  reason: StaleDeployReason;
  /** The user chose "Later"; tab-return checks stay quiet for this tab. */
  dismissed: boolean;
  show: (reason: StaleDeployReason) => void;
  dismiss: () => void;
}

export const useStaleDeployStore = create<StaleDeployState>((set) => ({
  open: false,
  reason: "update",
  dismissed: false,
  show: (reason) => set({ open: true, reason }),
  dismiss: () => set({ open: false, dismissed: true })
}));
