/**
 * RightPanelStore manages the right-side panel state.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RightPanelView = "inspector" | "assistant" | "logs" | "workspace" | "versions";

interface PanelState {
  panelSize: number;
  isVisible: boolean;
  isDragging: boolean;
  hasDragged: boolean;
  minWidth: number;
  maxWidth: number;
  defaultWidth: number;
  activeView: RightPanelView;
}

interface ResizePanelState {
  panel: PanelState;
  setSize: (newSize: number) => void;
  setIsDragging: (isDragging: boolean) => void;
  setHasDragged: (hasDragged: boolean) => void;
  initializePanelSize: (size?: number) => void;
  setActiveView: (view: RightPanelView) => void;
  closePanel: () => void;
  handleViewChange: (view: RightPanelView) => void;
  setVisibility: (isVisible: boolean) => void;
}

const DEFAULT_PANEL_SIZE = 350;
const MIN_DRAG_SIZE = 60;
const MIN_PANEL_SIZE = DEFAULT_PANEL_SIZE - 100;
const MAX_PANEL_SIZE = 600;

const createInitialState = (): PanelState => ({
  panelSize: DEFAULT_PANEL_SIZE,
  isVisible: false,
  isDragging: false,
  hasDragged: false,
  minWidth: MIN_DRAG_SIZE,
  maxWidth: MAX_PANEL_SIZE,
  defaultWidth: DEFAULT_PANEL_SIZE,
  activeView: "inspector"
});

export const useRightPanelStore = create<ResizePanelState>()(
  persist(
    (set, get) => ({
      panel: createInitialState(),

      setSize: (newSize: number) =>
        set((state: ResizePanelState) => {
          if (newSize <= MIN_DRAG_SIZE) {
            return { panel: { ...state.panel, panelSize: MIN_DRAG_SIZE } };
          }
          const validSize = Math.min(newSize, MAX_PANEL_SIZE);
          return { panel: { ...state.panel, panelSize: validSize } };
        }),

      setIsDragging: (isDragging: boolean) =>
        set((state: ResizePanelState) => ({
          panel: { ...state.panel, isDragging }
        })),

      setHasDragged: (hasDragged: boolean) =>
        set((state: ResizePanelState) => ({
          panel: { ...state.panel, hasDragged }
        })),

      initializePanelSize: (size?: number) => {
        const validSize = Math.max(
          MIN_PANEL_SIZE,
          Math.min(size || DEFAULT_PANEL_SIZE, MAX_PANEL_SIZE)
        );
        set((state: ResizePanelState) => ({
          panel: { ...state.panel, panelSize: validSize }
        }));
      },

      setActiveView: (view: RightPanelView) =>
        set((state: ResizePanelState) => ({
          panel: { ...state.panel, activeView: view }
        })),

      closePanel: () =>
        set((state: ResizePanelState) => ({
          panel: { ...state.panel, panelSize: MIN_DRAG_SIZE, isVisible: false }
        })),

      setVisibility: (isVisible: boolean) =>
        set((state: ResizePanelState) => ({
          panel: { ...state.panel, isVisible }
        })),

      handleViewChange: (view: RightPanelView) => {
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
              panel: { ...state.panel, isVisible: !state.panel.isVisible }
            }));
          }
        } else {
          set((state: ResizePanelState) => ({
            panel: { ...state.panel, activeView: view, isVisible: true }
          }));
        }
      }
    }),
    {
      name: "right-panel-storage",
      partialize: (state: ResizePanelState) => ({
        panel: {
          ...state.panel,
          isDragging: false,
          hasDragged: false
        }
      })
    }
  )
);
