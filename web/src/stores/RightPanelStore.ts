/**
 * RightPanelStore manages the right-side panel state. The right panel now
 * hosts only the Inspector — secondary tools (logs, jobs, assistant, etc.)
 * moved to the bottom panel.
 */
import { createResizablePanelStore } from "./createResizablePanelStore";

export type RightPanelView = "inspector";

interface RightPanelExtraActions {
  closeInspector: () => void;
  revealForSelection: () => void;
  toggleInspector: () => void;
}

const isRightPanelView = (value: unknown): value is RightPanelView =>
  value === "inspector";

export const useRightPanelStore = createResizablePanelStore<
  RightPanelView,
  object,
  RightPanelExtraActions
>({
  name: "right-panel-storage",
  version: 3,
  sizes: { drag: 60, min: 130, max: 600, initial: 350 },
  defaultView: "inspector",
  isView: isRightPanelView,
  // Selecting a node reveals the panel. Visibility is not restored on launch.
  persistVisibility: false,
  extraState: {},
  extraActions: (patch) => ({
    closeInspector: () =>
      patch(() => ({ isVisible: false })),
    revealForSelection: () =>
      patch((panel) => ({
        activeView: "inspector",
        isVisible: true,
        panelSize: Math.max(130, panel.panelSize)
      })),
    toggleInspector: () =>
      patch((panel) => ({
        activeView: "inspector",
        isVisible: !panel.isVisible,
        panelSize: !panel.isVisible
          ? Math.max(130, panel.panelSize)
          : panel.panelSize
      }))
  })
});
