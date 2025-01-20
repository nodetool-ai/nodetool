import { create } from "zustand";
import { devError } from "../utils/DevLog";
import { persist } from "zustand/middleware";

export type LeftPanelView =
  | "chat"
  | "assets"
  | "workflow"
  | "workflowGrid"
  | "nodes"
  | "collections";
export type PanelView = LeftPanelView;

interface PanelState {
  size: number;
  isDragging: boolean;
  hasDragged: boolean;
  minWidth: number;
  maxWidth: number;
  defaultWidth: number;
  activeView: PanelView;
  viewSizes: Record<PanelView, number>;
}

interface ResizePanelState {
  panel: PanelState;
  isHydrated: boolean;
  setSize: (newSize: number) => void;
  setIsDragging: (isDragging: boolean) => void;
  setHasDragged: (hasDragged: boolean) => void;
  initializePanelSize: (size?: number) => void;
  setActiveView: (view: PanelView) => void;
  closePanel: () => void;
  handleViewChange: (view: PanelView) => void;
}

const DEFAULT_PANEL_SIZE = 400;
const MIN_DRAG_SIZE = 60;
const MIN_PANEL_SIZE = DEFAULT_PANEL_SIZE;
const MAX_PANEL_SIZE = 800;

try {
  const stored = localStorage.getItem("panel-storage");
  if (stored) {
    const parsed = JSON.parse(stored);
    if (
      !parsed?.state?.panel?.size ||
      parsed.state.panel.size > MAX_PANEL_SIZE ||
      parsed.state.panel.size < MIN_DRAG_SIZE
    ) {
      localStorage.removeItem("panel-storage");
    }
  }
} catch (e) {
  devError("Error checking storage:", e);
}

// Create initial state with guaranteed valid values
const createInitialState = (): PanelState => {
  return {
    size: DEFAULT_PANEL_SIZE,
    isDragging: false,
    hasDragged: false,
    minWidth: MIN_DRAG_SIZE,
    maxWidth: MAX_PANEL_SIZE,
    defaultWidth: DEFAULT_PANEL_SIZE,
    activeView: "nodes",
    viewSizes: {
      nodes: DEFAULT_PANEL_SIZE,
      chat: DEFAULT_PANEL_SIZE,
      assets: DEFAULT_PANEL_SIZE,
      workflow: DEFAULT_PANEL_SIZE,
      workflowGrid: DEFAULT_PANEL_SIZE,
      collections: DEFAULT_PANEL_SIZE
    }
  };
};

export const usePanelStore = create<ResizePanelState>()(
  persist(
    (set, get) => ({
      panel: createInitialState(),
      isHydrated: false,

      setSize: (newSize) =>
        set((state) => {
          // Allow collapsing to MIN_DRAG_SIZE
          if (newSize <= MIN_DRAG_SIZE) {
            return {
              panel: {
                ...state.panel,
                size: MIN_DRAG_SIZE
              }
            };
          }

          const validSize = Math.min(newSize, MAX_PANEL_SIZE);
          return {
            panel: {
              ...state.panel,
              size: validSize,
              viewSizes: {
                ...state.panel.viewSizes,
                [state.panel.activeView]: validSize
              }
            }
          };
        }),

      setIsDragging: (isDragging) => {
        set((state) => ({
          panel: { ...state.panel, isDragging }
        }));
      },

      setHasDragged: (hasDragged) => {
        set((state) => ({
          panel: { ...state.panel, hasDragged }
        }));
      },

      initializePanelSize: (size) => {
        // When initializing, ensure we don't go below MIN_PANEL_SIZE
        const validSize = Math.max(
          MIN_PANEL_SIZE,
          Math.min(size || DEFAULT_PANEL_SIZE, MAX_PANEL_SIZE)
        );
        set((state) => ({
          panel: {
            ...state.panel,
            size: validSize
          }
        }));
      },

      setActiveView: (view) => {
        const state = get();
        const storedSize = state.panel.viewSizes[view];
        // When opening a view, ensure we don't go below MIN_PANEL_SIZE
        const validSize = Math.max(
          MIN_PANEL_SIZE,
          Math.min(storedSize || DEFAULT_PANEL_SIZE, MAX_PANEL_SIZE)
        );

        set((state) => ({
          panel: {
            ...state.panel,
            activeView: view,
            size: validSize
          }
        }));
      },

      closePanel: () => {
        set((state) => ({
          panel: { ...state.panel, size: MIN_DRAG_SIZE }
        }));
      },

      handleViewChange: (view: PanelView) => {
        const { panel } = get();
        const isCollapsed = panel.size <= MIN_DRAG_SIZE;

        if (panel.activeView === view) {
          // Toggle panel for same view
          if (isCollapsed) {
            const storedSize = panel.viewSizes[view];
            // When opening, ensure we don't go below MIN_PANEL_SIZE
            const validSize = Math.max(
              MIN_PANEL_SIZE,
              Math.min(storedSize || DEFAULT_PANEL_SIZE, MAX_PANEL_SIZE)
            );
            get().setSize(validSize);
          } else {
            get().closePanel();
          }
        } else {
          // Switch to different view
          get().setActiveView(view);
          if (isCollapsed) {
            const storedSize = panel.viewSizes[view];
            // When opening, ensure we don't go below MIN_PANEL_SIZE
            const validSize = Math.max(
              MIN_PANEL_SIZE,
              Math.min(storedSize || DEFAULT_PANEL_SIZE, MAX_PANEL_SIZE)
            );
            get().setSize(validSize);
          }
        }
      }
    }),
    {
      name: "panel-storage",
      version: 5, // Increment version to force reset with new size rules
      partialize: (state) => {
        // Store all sizes above MIN_DRAG_SIZE
        const validViewSizes = Object.fromEntries(
          Object.entries(state.panel.viewSizes)
            .filter(([_, size]) => size > MIN_DRAG_SIZE)
            .map(([view, size]) => [view, Math.min(size, MAX_PANEL_SIZE)])
        );

        // Store panel size if above MIN_DRAG_SIZE
        return state.panel.size > MIN_DRAG_SIZE
          ? {
              panel: {
                size: Math.min(state.panel.size, MAX_PANEL_SIZE),
                activeView: state.panel.activeView,
                viewSizes: validViewSizes
              }
            }
          : null;
      },
      onRehydrateStorage: () => (state) => {
        if (
          !state?.panel?.size ||
          state.panel.size < MIN_DRAG_SIZE ||
          state.panel.size > MAX_PANEL_SIZE
        ) {
          const initialState = createInitialState();
          return { panel: initialState, isHydrated: true };
        }

        // Ensure valid sizes
        const validState = {
          panel: {
            ...state.panel,
            size: Math.min(state.panel.size, MAX_PANEL_SIZE),
            viewSizes: { ...createInitialState().viewSizes } // Start with defaults
          },
          isHydrated: true
        };

        // Keep view sizes above MIN_DRAG_SIZE
        Object.entries(state.panel.viewSizes).forEach(([view, size]) => {
          if (size > MIN_DRAG_SIZE) {
            validState.panel.viewSizes[view as PanelView] = Math.min(
              size,
              MAX_PANEL_SIZE
            );
          }
        });

        return validState;
      }
    }
  )
);
