/**
 * PanelStore manages the state and behavior of resizable panels in the application.
 * It handles panel dimensions, visibility, dragging state, and view management using Zustand.
 */

import { create } from "zustand";

export type LeftPanelView = "chat" | "assets" | "workflowGrid" | "collections";
export type PanelView = LeftPanelView;

interface PanelState {
  panelSize: number;
  isVisible: boolean;
  isDragging: boolean;
  hasDragged: boolean;
  minWidth: number;
  maxWidth: number;
  defaultWidth: number;
  activeView: PanelView;
}

interface ResizePanelState {
  panel: PanelState;
  setSize: (newSize: number) => void;
  setIsDragging: (isDragging: boolean) => void;
  setHasDragged: (hasDragged: boolean) => void;
  initializePanelSize: (size?: number) => void;
  setActiveView: (view: PanelView) => void;
  closePanel: () => void;
  handleViewChange: (view: PanelView) => void;
  setVisibility: (isVisible: boolean) => void;
}

const DEFAULT_PANEL_SIZE = 500;
const MIN_DRAG_SIZE = 60;
const MIN_PANEL_SIZE = DEFAULT_PANEL_SIZE - 100;
const MAX_PANEL_SIZE = 800;

// Create initial state with guaranteed valid values
const createInitialState = (): PanelState => {
  return {
    panelSize: DEFAULT_PANEL_SIZE,
    isVisible: false,
    isDragging: false,
    hasDragged: false,
    minWidth: MIN_DRAG_SIZE,
    maxWidth: MAX_PANEL_SIZE,
    defaultWidth: DEFAULT_PANEL_SIZE,
    activeView: "workflowGrid"
  };
};

export const usePanelStore = create<ResizePanelState>()((set, get) => ({
  panel: createInitialState(),

  setSize: (newSize) =>
    set((state) => {
      // Allow collapsing to MIN_DRAG_SIZE
      if (newSize <= MIN_DRAG_SIZE) {
        return {
          panel: {
            ...state.panel,
            panelSize: MIN_DRAG_SIZE
          }
        };
      }

      const validSize = Math.min(newSize, MAX_PANEL_SIZE);
      return {
        panel: {
          ...state.panel,
          panelSize: validSize
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
        panelSize: validSize
      }
    }));
  },

  setActiveView: (view) => {
    set((state) => ({
      panel: {
        ...state.panel,
        activeView: view
      }
    }));
  },

  closePanel: () => {
    set((state) => ({
      panel: { ...state.panel, panelSize: MIN_DRAG_SIZE }
    }));
  },

  setVisibility: (isVisible: boolean) => {
    set((state) => ({
      panel: { ...state.panel, isVisible }
    }));
  },

  handleViewChange: (view: PanelView) => {
    const { panel } = get();

    if (panel.activeView === view) {
      if (!panel.isVisible && panel.panelSize < MIN_PANEL_SIZE) {
        set((state) => ({
          panel: {
            ...state.panel,
            panelSize: MIN_PANEL_SIZE,
            isVisible: true
          }
        }));
      } else {
        set((state) => ({
          panel: {
            ...state.panel,
            isVisible: !state.panel.isVisible
          }
        }));
      }
    } else {
      set((state) => ({
        panel: {
          ...state.panel,
          activeView: view,
          isVisible: true
        }
      }));
    }
  }
}));
