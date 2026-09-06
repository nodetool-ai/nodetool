/**
 * RightPanelStore manages the right-side panel state. The right panel now
 * hosts only the Inspector — secondary tools (logs, jobs, assistant, etc.)
 * moved to the bottom panel.
 */
import { createResizablePanelStore } from "./createResizablePanelStore";

export type RightPanelView = "inspector";

const isRightPanelView = (value: unknown): value is RightPanelView =>
  value === "inspector";

export const useRightPanelStore = createResizablePanelStore<RightPanelView>({
  name: "right-panel-storage",
  version: 3,
  sizes: { drag: 60, min: 130, max: 600, initial: 350 },
  defaultView: "inspector",
  isView: isRightPanelView,
  // Visibility is selection-driven — the panel only opens while a node is
  // selected. Persisting `isVisible` would re-open an empty inspector on a
  // fresh load (no selection yet), so only the size/view are persisted, and a
  // legacy persisted `isVisible` (pre-v3) is ignored on rehydrate.
  persistVisibility: false
});
