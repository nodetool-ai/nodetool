import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * State for the floating, draggable chat dock on the node editor canvas
 * (the composer + conversation overlay rendered by `FloatingToolBar`).
 *
 * Persisted across sessions so the dock keeps its position and size:
 *  - `position`  — drag offset (px) from the default bottom-centre anchor.
 *  - `overlayHeight` — height (px) of the conversation overlay.
 *  - `dockWidth` — width (px) of the whole dock, or `null` for the responsive
 *                  default (`min(820px, 100vw - 32px)`).
 *  - `composerCollapsed` — the prompt is hidden and only the workflow toolbar
 *                  row (Run, canvas tools) stays on the canvas.
 *
 * Transient view flags (`conversationCollapsed`, `threadsOpen`) are kept here
 * too so the keyboard shortcut and command menu can drive them, but they are
 * intentionally not persisted — each session starts with the overlay closed.
 */
export interface DockPosition {
  x: number;
  y: number;
}

export const DEFAULT_OVERLAY_HEIGHT = 420;
export const MIN_OVERLAY_HEIGHT = 160;
export const MAX_OVERLAY_HEIGHT = 2000;
export const MIN_DOCK_WIDTH = 360;
export const MAX_DOCK_WIDTH = 1200;

const DEFAULT_POSITION: DockPosition = { x: 0, y: 0 };

export const clampOverlayHeight = (h: number): number =>
  Math.max(MIN_OVERLAY_HEIGHT, Math.min(h, MAX_OVERLAY_HEIGHT));

export const clampDockWidth = (w: number): number =>
  Math.max(MIN_DOCK_WIDTH, Math.min(w, MAX_DOCK_WIDTH));

interface CanvasChatDockState {
  position: DockPosition;
  overlayHeight: number;
  dockWidth: number | null;
  composerCollapsed: boolean;
  conversationCollapsed: boolean;
  threadsOpen: boolean;

  setPosition: (pos: DockPosition) => void;
  resetPosition: () => void;
  setOverlayHeight: (height: number) => void;
  setDockWidth: (width: number | null) => void;
  setComposerCollapsed: (collapsed: boolean) => void;
  setConversationCollapsed: (collapsed: boolean) => void;
  toggleConversation: () => void;
  setThreadsOpen: (open: boolean) => void;
  toggleThreads: () => void;
}

export const useCanvasChatDockStore = create<CanvasChatDockState>()(
  persist(
    (set) => ({
      position: DEFAULT_POSITION,
      overlayHeight: DEFAULT_OVERLAY_HEIGHT,
      dockWidth: null,
      composerCollapsed: false,
      conversationCollapsed: true,
      threadsOpen: false,

      setPosition: (position) => set({ position }),
      resetPosition: () => set({ position: DEFAULT_POSITION }),
      setOverlayHeight: (height) =>
        set({ overlayHeight: clampOverlayHeight(height) }),
      setDockWidth: (width) =>
        set({ dockWidth: width === null ? null : clampDockWidth(width) }),
      setComposerCollapsed: (composerCollapsed) => set({ composerCollapsed }),
      setConversationCollapsed: (conversationCollapsed) =>
        set({ conversationCollapsed }),
      // The overlay is hidden while the composer is collapsed, so toggling
      // it then expands the composer and opens the conversation.
      toggleConversation: () =>
        set((state) =>
          state.composerCollapsed
            ? { composerCollapsed: false, conversationCollapsed: false }
            : { conversationCollapsed: !state.conversationCollapsed }
        ),
      setThreadsOpen: (threadsOpen) => set({ threadsOpen }),
      toggleThreads: () =>
        set((state) => ({ threadsOpen: !state.threadsOpen }))
    }),
    {
      name: "canvas-chat-dock",
      version: 1,
      partialize: (state) => ({
        position: state.position,
        overlayHeight: state.overlayHeight,
        dockWidth: state.dockWidth,
        composerCollapsed: state.composerCollapsed
      })
    }
  )
);

export default useCanvasChatDockStore;
