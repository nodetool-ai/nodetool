import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Top-level left-panel view. "nodes" hosts the node-browser sub-tabs (Inputs/
 * Outputs, Tools, Image Models, etc.) — the active sub-tab is tracked
 * separately in `activeNodeCategory`.
 *
 * Migration: prior versions used a flat list that included the node-category
 * IDs directly. merge() below remaps legacy values onto the new top-level
 * view + activeNodeCategory pair.
 */
export type LeftPanelView =
  | "workflows"
  | "sketches"
  | "timelines"
  | "settings"
  | "history"
  | "favorites"
  | "assets"
  | "nodes"
  | "agent";
export type PanelView = LeftPanelView;

export type NodeCategoryId =
  | "all"
  | "io"
  | "tools"
  | "image-models"
  | "video-models"
  | "audio-models"
  | "3d-models"
  | "agents"
  | "control-flow";

interface PanelState {
  panelSize: number;
  isVisible: boolean;
  isDragging: boolean;
  hasDragged: boolean;
  minWidth: number;
  maxWidth: number;
  defaultWidth: number;
  activeView: PanelView;
  activeNodeCategory: NodeCategoryId;
}

interface ResizePanelState {
  panel: PanelState;
  setSize: (newSize: number) => void;
  setIsDragging: (isDragging: boolean) => void;
  setHasDragged: (hasDragged: boolean) => void;
  initializePanelSize: (size?: number) => void;
  setActiveView: (view: PanelView) => void;
  setActiveNodeCategory: (category: NodeCategoryId) => void;
  closePanel: () => void;
  handleViewChange: (view: PanelView) => void;
  setVisibility: (isVisible: boolean) => void;
}

const DEFAULT_PANEL_SIZE = 500;
const MIN_DRAG_SIZE = 60;
const MIN_PANEL_SIZE = DEFAULT_PANEL_SIZE - 100;
const MAX_PANEL_SIZE = 800;

const VALID_VIEWS: LeftPanelView[] = [
  "workflows",
  "sketches",
  "timelines",
  "settings",
  "history",
  "favorites",
  "assets",
  "nodes",
  "agent"
];

const VALID_NODE_CATEGORIES: NodeCategoryId[] = [
  "all",
  "io",
  "tools",
  "image-models",
  "video-models",
  "audio-models",
  "3d-models",
  "agents",
  "control-flow"
];

function isLeftPanelView(value: string): value is LeftPanelView {
  return (VALID_VIEWS as readonly string[]).includes(value);
}

function isNodeCategoryId(value: string): value is NodeCategoryId {
  return (VALID_NODE_CATEGORIES as readonly string[]).includes(value);
}

const createInitialState = (): PanelState => {
  return {
    panelSize: DEFAULT_PANEL_SIZE,
    isVisible: false,
    isDragging: false,
    hasDragged: false,
    minWidth: MIN_DRAG_SIZE,
    maxWidth: MAX_PANEL_SIZE,
    defaultWidth: DEFAULT_PANEL_SIZE,
    activeView: "workflows",
    activeNodeCategory: "all"
  };
};

export const usePanelStore = create<ResizePanelState>()(
  persist(
    (set, get) => ({
      panel: createInitialState(),

      setSize: (newSize: number) =>
        set((state: ResizePanelState) => {
          if (newSize <= MIN_DRAG_SIZE) {
            return {
              panel: { ...state.panel, panelSize: MIN_DRAG_SIZE }
            };
          }
          const validSize = Math.min(newSize, MAX_PANEL_SIZE);
          return {
            panel: { ...state.panel, panelSize: validSize }
          };
        }),

      setIsDragging: (isDragging: boolean) => {
        set((state: ResizePanelState) => ({
          panel: { ...state.panel, isDragging }
        }));
      },

      setHasDragged: (hasDragged: boolean) => {
        set((state: ResizePanelState) => ({
          panel: { ...state.panel, hasDragged }
        }));
      },

      initializePanelSize: (size?: number) => {
        const validSize = Math.max(
          MIN_PANEL_SIZE,
          Math.min(size || DEFAULT_PANEL_SIZE, MAX_PANEL_SIZE)
        );
        set((state: ResizePanelState) => ({
          panel: { ...state.panel, panelSize: validSize }
        }));
      },

      setActiveView: (view: PanelView) => {
        set((state: ResizePanelState) => ({
          panel: { ...state.panel, activeView: view }
        }));
      },

      setActiveNodeCategory: (category: NodeCategoryId) => {
        set((state: ResizePanelState) => ({
          panel: { ...state.panel, activeNodeCategory: category }
        }));
      },

      closePanel: () => {
        set((state: ResizePanelState) => ({
          panel: { ...state.panel, panelSize: MIN_DRAG_SIZE, isVisible: false }
        }));
      },

      setVisibility: (isVisible: boolean) => {
        set((state: ResizePanelState) => ({
          panel: { ...state.panel, isVisible }
        }));
      },

      handleViewChange: (view: PanelView) => {
        const { panel } = get();

        if (panel.activeView === view) {
          if (!panel.isVisible && panel.panelSize < MIN_PANEL_SIZE) {
            set((state: ResizePanelState) => ({
              panel: {
                ...state.panel,
                panelSize: MIN_PANEL_SIZE,
                isVisible: true
              }
            }));
          } else {
            set((state: ResizePanelState) => ({
              panel: {
                ...state.panel,
                isVisible: !state.panel.isVisible
              }
            }));
          }
        } else {
          set((state: ResizePanelState) => ({
            panel: {
              ...state.panel,
              activeView: view,
              isVisible: true
            }
          }));
        }
      }
    }),
    {
      name: "left-panel-storage",
      version: 3,
      partialize: (state: ResizePanelState) => ({
        panel: {
          panelSize: state.panel.panelSize,
          isVisible: state.panel.isVisible,
          activeView: state.panel.activeView,
          activeNodeCategory: state.panel.activeNodeCategory
        }
      }),
      merge: (persistedState, currentState) => {
        if (!persistedState || typeof persistedState !== "object" || Array.isArray(persistedState)) {
          return currentState;
        }
        const persisted = persistedState as Record<string, unknown>;
        const rawPanel = persisted.panel;
        if (!rawPanel || typeof rawPanel !== "object" || Array.isArray(rawPanel)) {
          return currentState;
        }
        const persistedPanel = rawPanel as Record<string, unknown>;
        const raw = persistedPanel.activeView as string | undefined;

        // Migrate legacy flat-list views: any node-category id now lives
        // under the "nodes" top-level view with that id selected as sub-tab.
        let migratedView: LeftPanelView = currentState.panel.activeView;
        let migratedSubcategory: NodeCategoryId =
          currentState.panel.activeNodeCategory;

        if (raw === "workflowGrid") {
          migratedView = "workflows";
        } else if (raw === "search") {
          migratedView = "nodes";
          migratedSubcategory = "all";
        } else if (raw && isNodeCategoryId(raw)) {
          migratedView = "nodes";
          migratedSubcategory = raw;
        } else if (raw && isLeftPanelView(raw)) {
          migratedView = raw;
        }

        const persistedSubcategory = persistedPanel.activeNodeCategory;
        if (
          typeof persistedSubcategory === "string" &&
          isNodeCategoryId(persistedSubcategory)
        ) {
          migratedSubcategory = persistedSubcategory;
        }

        return {
          ...currentState,
          panel: {
            ...currentState.panel,
            panelSize:
              typeof persistedPanel.panelSize === "number"
                ? Math.max(
                    MIN_DRAG_SIZE,
                    Math.min(persistedPanel.panelSize, MAX_PANEL_SIZE)
                  )
                : currentState.panel.panelSize,
            isVisible:
              typeof persistedPanel.isVisible === "boolean"
                ? persistedPanel.isVisible
                : currentState.panel.isVisible,
            activeView: migratedView,
            activeNodeCategory: migratedSubcategory
          }
        };
      }
    }
  )
);
