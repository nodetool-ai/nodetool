/**
 * RightPanelStore manages the right-side panel state. The right panel now
 * hosts only the Inspector — secondary tools (logs, jobs, assistant, etc.)
 * moved to the bottom panel.
 */
import { createResizablePanelStore } from "./createResizablePanelStore";

export type RightPanelView = "inspector";

interface RightPanelExtraState {
  /** User intent, distinct from selection-derived visibility. */
  explicitlyClosed: boolean;
}

interface RightPanelExtraActions {
  closeInspector: () => void;
  revealForSelection: () => void;
  toggleInspector: () => void;
}

const isRightPanelView = (value: unknown): value is RightPanelView =>
  value === "inspector";

export const useRightPanelStore = createResizablePanelStore<
  RightPanelView,
  RightPanelExtraState,
  RightPanelExtraActions
>({
  name: "right-panel-storage",
  version: 3,
  sizes: { drag: 60, min: 130, max: 600, initial: 350 },
  defaultView: "inspector",
  isView: isRightPanelView,
  // Selection can reveal the panel, but an explicit close suppresses that
  // behavior until the user reopens it. Neither intent is restored on launch.
  persistVisibility: false,
  extraState: { explicitlyClosed: false },
  extraActions: (patch) => ({
    closeInspector: () =>
      patch(() => ({ isVisible: false, explicitlyClosed: true })),
    revealForSelection: () =>
      patch((panel) =>
        panel.explicitlyClosed
          ? {}
          : {
              activeView: "inspector",
              isVisible: true,
              panelSize: Math.max(130, panel.panelSize)
            }
      ),
    toggleInspector: () =>
      patch((panel) => ({
        activeView: "inspector",
        isVisible: !panel.isVisible,
        explicitlyClosed: panel.isVisible,
        panelSize: !panel.isVisible
          ? Math.max(130, panel.panelSize)
          : panel.panelSize
      }))
  })
});
