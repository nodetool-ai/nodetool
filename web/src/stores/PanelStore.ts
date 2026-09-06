import { isString } from "../utils/typePredicates";
import {
  createResizablePanelStore,
  type ResizablePanelState
} from "./createResizablePanelStore";

/**
 * Top-level left-panel view. "nodes" hosts the node-browser sub-tabs (Inputs/
 * Outputs, Tools, Image Models, etc.) — the active sub-tab is tracked
 * separately in `activeNodeCategory`.
 *
 * Migration: prior versions used a flat list that included the node-category
 * IDs directly. `mergeExtra` below remaps legacy values onto the new
 * top-level view + activeNodeCategory pair.
 */
export type LeftPanelView =
  | "workflows"
  | "chats"
  | "sketches"
  | "timelines"
  | "storyboards"
  | "entities"
  | "scripts"
  | "jsscripts"
  | "skills"
  | "apps"
  | "settings"
  | "history"
  | "favorites"
  | "assets"
  | "library"
  | "workspace-files"
  | "nodes";
export type PanelView = LeftPanelView;

export type NodeCategoryId =
  | "all"
  | "io"
  | "image"
  | "image-ai"
  | "video"
  | "video-ai"
  | "audio"
  | "audio-ai"
  | "3d-models"
  | "agents"
  | "control-flow";

const VALID_VIEWS: LeftPanelView[] = [
  "workflows",
  "chats",
  "sketches",
  "timelines",
  "storyboards",
  "entities",
  "scripts",
  "jsscripts",
  "skills",
  "apps",
  "settings",
  "history",
  "favorites",
  "assets",
  "library",
  "workspace-files",
  "nodes"
];

const VALID_NODE_CATEGORIES: NodeCategoryId[] = [
  "all",
  "io",
  "image",
  "image-ai",
  "video",
  "video-ai",
  "audio",
  "audio-ai",
  "3d-models",
  "agents",
  "control-flow"
];

// Pre-split category ids (image/video/audio mixed AI + processing, plus the
// curated "tools" tab) map onto the closest current tab so a persisted
// selection survives the rename instead of silently resetting to "All".
const LEGACY_NODE_CATEGORY_ALIASES: Record<string, NodeCategoryId> = {
  tools: "image",
  "image-models": "image-ai",
  "video-models": "video-ai",
  "audio-models": "audio-ai"
};

function isNodeCategoryId(value: string): value is NodeCategoryId {
  return (VALID_NODE_CATEGORIES as readonly string[]).includes(value);
}

function normalizeNodeCategoryId(value: string): NodeCategoryId | undefined {
  if (isNodeCategoryId(value)) {
    return value;
  }
  return LEGACY_NODE_CATEGORY_ALIASES[value];
}

function isLeftPanelView(value: unknown): value is LeftPanelView {
  return (
    typeof value === "string" &&
    (VALID_VIEWS as readonly string[]).includes(value)
  );
}

interface LeftPanelExtra {
  activeNodeCategory: NodeCategoryId;
}

interface LeftPanelExtraActions {
  setActiveNodeCategory: (category: NodeCategoryId) => void;
}

export const usePanelStore = createResizablePanelStore<
  PanelView,
  LeftPanelExtra,
  LeftPanelExtraActions
>({
  name: "left-panel-storage",
  version: 3,
  sizes: { drag: 60, min: 160, max: 800, initial: 500 },
  defaultView: "workflows",
  isView: isLeftPanelView,
  persistVisibility: true,
  extraState: { activeNodeCategory: "all" },
  extraActions: (patch) => ({
    setActiveNodeCategory: (activeNodeCategory) =>
      patch(() => ({ activeNodeCategory }))
  }),
  partializeExtra: (panel) => ({
    activeNodeCategory: panel.activeNodeCategory
  }),
  mergeExtra: (persisted) => {
    // Legacy flat-list views: any node-category id now lives under the
    // "nodes" top-level view with that id selected as sub-tab.
    const raw = isString(persisted.activeView) ? persisted.activeView : undefined;
    const patch: Partial<ResizablePanelState<PanelView> & LeftPanelExtra> = {};

    const rawCategory = raw ? normalizeNodeCategoryId(raw) : undefined;
    if (raw === "workflowGrid") {
      patch.activeView = "workflows";
    } else if (raw === "search") {
      patch.activeView = "nodes";
      patch.activeNodeCategory = "all";
    } else if (rawCategory) {
      patch.activeView = "nodes";
      patch.activeNodeCategory = rawCategory;
    }

    const persistedCategory = isString(persisted.activeNodeCategory)
      ? normalizeNodeCategoryId(persisted.activeNodeCategory)
      : undefined;
    if (persistedCategory) {
      patch.activeNodeCategory = persistedCategory;
    }

    return patch;
  }
});
