import { create } from "zustand";
import { persist } from "zustand/middleware";

export type BottomPanelView = "trace";

interface PanelState {
  panelSize: number;
  isVisible: boolean;
  isDragging: boolean;
  hasDragged: boolean;
  minHeight: number;
  maxHeight: number;
  defaultHeight: number;
  activeView: BottomPanelView;
}

interface ResizePanelState {
  panel: PanelState;
  setSize: (newSize: number) => void;
  setIsDragging: (isDragging: boolean) => void;
  setHasDragged: (hasDragged: boolean) => void;
  initializePanelSize: (size?: number) => void;
  setActiveView: (view: BottomPanelView) => void;
  closePanel: () => void;
  handleViewChange: (view: BottomPanelView) => void;
  setVisibility: (isVisible: boolean) => void;
}

const DEFAULT_PANEL_SIZE = 300;
const MIN_DRAG_SIZE = 40;
const MIN_PANEL_SIZE = 200;
const MAX_PANEL_SIZE = 600;

const createInitialState = (): PanelState => ({
  panelSize: DEFAULT_PANEL_SIZE,
  isVisible: false,
  isDragging: false,
  hasDragged: false,
  minHeight: MIN_DRAG_SIZE,
  maxHeight: MAX_PANEL_SIZE,
  defaultHeight: DEFAULT_PANEL_SIZE,
  activeView: "trace"
});

export const useBottomPanelStore = create<ResizePanelState>()(
  persist(
    (set) => ({
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

      setActiveView: (view: BottomPanelView) =>
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

      handleViewChange: (view: BottomPanelView) => {
        set((state: ResizePanelState) => {
          const { panel } = state;
          if (panel.activeView === view) {
            if (!panel.isVisible && panel.panelSize < MIN_PANEL_SIZE) {
              return {
                panel: {
                  ...panel,
                  panelSize: MIN_PANEL_SIZE,
                  isVisible: true
                }
              };
            } else {
              return {
                panel: { ...panel, isVisible: !panel.isVisible }
              };
            }
          } else {
            return {
              panel: { ...panel, activeView: view, isVisible: true }
            };
          }
        });
      }
    }),
    {
      name: "bottom-panel-storage",
      version: 1,
      partialize: (state: ResizePanelState) => ({
        panel: {
          panelSize: state.panel.panelSize,
          isVisible: state.panel.isVisible,
          activeView: state.panel.activeView
        }
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<ResizePanelState>;
        const persistedPanel = (persisted.panel ?? {}) as Partial<PanelState>;
        const validViews: BottomPanelView[] = ["trace"];
        const activeView = validViews.includes(
          persistedPanel.activeView as BottomPanelView
        )
          ? (persistedPanel.activeView as BottomPanelView)
          : currentState.panel.activeView;
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
            activeView
          }
        };
      }
    }
  )
);
