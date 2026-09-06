import { createResizablePanelStore } from "./createResizablePanelStore";
import { isObjectLike } from "../utils/typePredicates";

/**
 * Bottom panel hosts secondary workflow tools that used to live in PanelRight.
 * Grouped into:
 *  - "run":      logs, jobs
 *  - "workflow": versions
 *  - "debug":    trace
 *
 * The workspace file browser moved to the left panel (LeftPanelView
 * "workspace-files"); a stored activeView of "workspace" falls back to "logs".
 *
 * Workflow settings live in the left panel (LeftPanelView "settings"). Chat
 * now lives in the draggable canvas dock (FloatingToolBar), not a left-panel
 * view. The workflow assistant has been removed entirely.
 */
export type BottomPanelView =
  | "logs"
  | "queue"
  | "workers"
  | "versions"
  | "trace";

type BottomPanelGroup = "run" | "workflow" | "debug";

export const BOTTOM_PANEL_GROUPS: ReadonlyArray<{
  id: BottomPanelGroup;
  label: string;
  views: readonly BottomPanelView[];
}> = [
  { id: "run", label: "Run", views: ["logs", "queue", "workers"] },
  {
    id: "workflow",
    label: "Workflow",
    views: ["versions"]
  },
  { id: "debug", label: "Debug", views: ["trace"] }
];

const ALL_BOTTOM_VIEWS: BottomPanelView[] = BOTTOM_PANEL_GROUPS.flatMap((g) => [
  ...g.views
]);

const isBottomPanelView = (value: unknown): value is BottomPanelView =>
  typeof value === "string" &&
  (ALL_BOTTOM_VIEWS as readonly string[]).includes(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  isObjectLike(value) && !Array.isArray(value);

export const useBottomPanelStore = createResizablePanelStore<BottomPanelView>({
  name: "bottom-panel-storage",
  version: 3,
  sizes: { drag: 40, min: 200, max: 700, initial: 320 },
  defaultView: "logs",
  isView: isBottomPanelView,
  persistVisibility: true,
  // v3 removed the "workspace" view — the file browser lives in the left
  // panel now. A persisted selection of it would leave the panel showing
  // nothing, so it falls back to the default view.
  migrate: (persistedState) => {
    if (!isRecord(persistedState)) {
      return persistedState;
    }
    const panel = persistedState.panel;
    if (!isRecord(panel) || panel.activeView !== "workspace") {
      return persistedState;
    }
    return {
      ...persistedState,
      panel: { ...panel, activeView: "logs" }
    };
  }
});
