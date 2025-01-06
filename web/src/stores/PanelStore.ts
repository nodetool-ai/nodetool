import { create } from "zustand";

type PanelPosition = "left" | "right";

interface PanelState {
  size: number;
  isDragging: boolean;
  hasDragged: boolean;
  minWidth: number;
  maxWidth: number;
  defaultWidth: number;
}

interface ResizePanelState {
  panels: Record<PanelPosition, PanelState>;
  setSize: (position: PanelPosition, newSize: number) => void;
  setIsDragging: (position: PanelPosition, isDragging: boolean) => void;
  setHasDragged: (position: PanelPosition, hasDragged: boolean) => void;
  initializePanelSizes: (sizes: { left?: number; right?: number }) => void;
}

const DEFAULT_LEFT_PANEL_SIZE = 300;
const DEFAULT_RIGHT_PANEL_SIZE = 300;

export const usePanelStore = create<ResizePanelState>()((set) => ({
  panels: {
    left: {
      size: DEFAULT_LEFT_PANEL_SIZE,
      isDragging: false,
      hasDragged: false,
      minWidth: 60,
      maxWidth: 800,
      defaultWidth: DEFAULT_LEFT_PANEL_SIZE
    },
    right: {
      size: DEFAULT_RIGHT_PANEL_SIZE,
      isDragging: false,
      hasDragged: false,
      minWidth: 52,
      maxWidth: 1200,
      defaultWidth: DEFAULT_RIGHT_PANEL_SIZE
    }
  },
  orientation: "horizontal" as const,

  initializePanelSizes: (sizes) =>
    set((state) => ({
      panels: {
        left: {
          ...state.panels.left,
          size: sizes.left ?? DEFAULT_LEFT_PANEL_SIZE
        },
        right: {
          ...state.panels.right,
          size: sizes.right ?? DEFAULT_RIGHT_PANEL_SIZE
        }
      }
    })),

  setSize: (position, newSize) =>
    set((state) => ({
      panels: {
        ...state.panels,
        [position]: { ...state.panels[position], size: newSize }
      }
    })),

  setIsDragging: (position, isDragging) =>
    set((state) => ({
      panels: {
        ...state.panels,
        [position]: { ...state.panels[position], isDragging }
      }
    })),

  setHasDragged: (position, hasDragged) =>
    set((state) => ({
      panels: {
        ...state.panels,
        [position]: { ...state.panels[position], hasDragged }
      }
    }))
}));
