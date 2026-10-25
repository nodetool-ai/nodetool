/**
 * RightPanelStore manages the right-side panel state. The right panel now
 * hosts only the Inspector — secondary tools (logs, jobs, assistant, etc.)
 * moved to the bottom panel.
 */
import { createResizablePanelStore } from "./createResizablePanelStore";
import { isBoolean } from "../utils/typePredicates";

export type RightPanelView = "inspector";

interface RightPanelExtraState {
  /**
   * False after the user hides the inspector with the toggle. Selection then
   * no longer reveals it until the user shows it again.
   */
  autoReveal: boolean;
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
  // Selecting a node reveals the panel. Visibility is not restored on launch.
  persistVisibility: false,
  extraState: { autoReveal: true },
  partializeExtra: (panel) => ({ autoReveal: panel.autoReveal }),
  mergeExtra: (persisted) =>
    isBoolean(persisted.autoReveal)
      ? { autoReveal: persisted.autoReveal }
      : {},
  extraActions: (patch) => ({
    closeInspector: () =>
      patch(() => ({ isVisible: false })),
    revealForSelection: () =>
      patch((panel) =>
        panel.autoReveal
          ? {
              activeView: "inspector",
              isVisible: true,
              panelSize: Math.max(130, panel.panelSize)
            }
          : {}
      ),
    toggleInspector: () =>
      patch((panel) => ({
        activeView: "inspector",
        isVisible: !panel.isVisible,
        autoReveal: !panel.isVisible,
        panelSize: !panel.isVisible
          ? Math.max(130, panel.panelSize)
          : panel.panelSize
      }))
  })
});
