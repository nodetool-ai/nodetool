import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * State for the floating chat window on the node editor canvas
 * (`CanvasChatWindow`, mounted by `FloatingToolBar`).
 *
 * The window is anchored to the top-right corner of the canvas. Persisted
 * across sessions so it keeps its place, size and open state:
 *  - `position`  — drag offset (px) from the default top-right anchor.
 *  - `windowWidth` / `windowHeight` — size (px) of the window.
 *  - `conversationCollapsed` — the window is closed. Starts closed on a
 *                  narrow viewport, where it would cover most of the graph.
 *
 * `threadsOpen` (the inline thread list) is transient so the keyboard
 * shortcut and command menu can drive it, but it is not persisted.
 */
export interface DockPosition {
  x: number;
  y: number;
}

export const DEFAULT_WINDOW_WIDTH = 420;
export const MIN_WINDOW_WIDTH = 320;
export const MAX_WINDOW_WIDTH = 960;
export const MIN_WINDOW_HEIGHT = 280;
export const MAX_WINDOW_HEIGHT = 2000;
/** By default the window runs down to the workflow toolbar. */
export const DEFAULT_WINDOW_HEIGHT = MAX_WINDOW_HEIGHT;

const DEFAULT_POSITION: DockPosition = { x: 0, y: 0 };

/** Viewports narrower than this (px) start with the chat window closed. */
export const NARROW_VIEWPORT_MAX_WIDTH = 1200;

export const defaultConversationCollapsed = (): boolean =>
  typeof window !== "undefined" &&
  window.innerWidth < NARROW_VIEWPORT_MAX_WIDTH;

export const clampWindowHeight = (h: number): number =>
  Math.max(MIN_WINDOW_HEIGHT, Math.min(h, MAX_WINDOW_HEIGHT));

export const clampWindowWidth = (w: number): number =>
  Math.max(MIN_WINDOW_WIDTH, Math.min(w, MAX_WINDOW_WIDTH));

interface CanvasChatDockState {
  position: DockPosition;
  windowWidth: number;
  windowHeight: number;
  conversationCollapsed: boolean;
  threadsOpen: boolean;

  setPosition: (pos: DockPosition) => void;
  resetPosition: () => void;
  setWindowWidth: (width: number) => void;
  setWindowHeight: (height: number) => void;
  setConversationCollapsed: (collapsed: boolean) => void;
  toggleConversation: () => void;
  setThreadsOpen: (open: boolean) => void;
  toggleThreads: () => void;
}

export const useCanvasChatDockStore = create<CanvasChatDockState>()(
  persist(
    (set) => ({
      position: DEFAULT_POSITION,
      windowWidth: DEFAULT_WINDOW_WIDTH,
      windowHeight: DEFAULT_WINDOW_HEIGHT,
      conversationCollapsed: defaultConversationCollapsed(),
      threadsOpen: false,

      setPosition: (position) => set({ position }),
      resetPosition: () => set({ position: DEFAULT_POSITION }),
      setWindowWidth: (width) => set({ windowWidth: clampWindowWidth(width) }),
      setWindowHeight: (height) =>
        set({ windowHeight: clampWindowHeight(height) }),
      setConversationCollapsed: (conversationCollapsed) =>
        set({ conversationCollapsed }),
      toggleConversation: () =>
        set((state) => ({
          conversationCollapsed: !state.conversationCollapsed
        })),
      setThreadsOpen: (threadsOpen) => set({ threadsOpen }),
      toggleThreads: () =>
        set((state) => ({ threadsOpen: !state.threadsOpen }))
    }),
    {
      name: "canvas-chat-dock",
      // v2: the chat moved from a bottom-centre dock to a top-right window,
      // so a v1 drag offset and size mean nothing to it. Start fresh.
      version: 2,
      migrate: () => ({}),
      partialize: (state) => ({
        position: state.position,
        windowWidth: state.windowWidth,
        windowHeight: state.windowHeight,
        conversationCollapsed: state.conversationCollapsed
      })
    }
  )
);

export default useCanvasChatDockStore;
