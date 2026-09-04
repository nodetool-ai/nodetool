/**
 * UI Slice — ephemeral UI flags, layer multi-select, layer isolation.
 */

import type { StateCreator } from "zustand";
import type { SketchStore } from "../useSketchStore";
import { buildLayersPanelRows } from "../../types";

const ASSISTANT_OPEN_KEY = "sketch.assistantPanelOpen";

function readAssistantPanelOpen(): boolean {
  try {
    const saved = localStorage.getItem(ASSISTANT_OPEN_KEY);
    if (saved === "true" || saved === "false") {
      return saved === "true";
    }
  } catch {
    /* private mode */
  }
  return true;
}

function writeAssistantPanelOpen(open: boolean): void {
  try {
    localStorage.setItem(ASSISTANT_OPEN_KEY, open ? "true" : "false");
  } catch {
    /* private mode */
  }
}

export interface UiSlice {
  /** True while Ctrl/Cmd is held for spring-loaded move. */
  transientMoveModifierHeld: boolean;
  setTransientMoveModifierHeld: (held: boolean) => void;

  isDrawing: boolean;
  setIsDrawing: (isDrawing: boolean) => void;

  panelsHidden: boolean;
  togglePanelsHidden: () => void;

  /**
   * Whether the tool-settings row of the top bar is collapsed to just its
   * "Tool <name>" header. The settings wrap onto several rows for most tools,
   * which eats a large share of a phone-sized viewport — the header keeps a
   * one-tap way back. Set on every mobile/desktop transition (collapsed on
   * mobile, expanded on desktop) and toggled by the caret in the bar.
   */
  toolSettingsCollapsed: boolean;
  toggleToolSettingsCollapsed: () => void;
  setToolSettingsCollapsed: (collapsed: boolean) => void;

  /** Whether the AI assistant chat panel is open (right side of the editor). */
  assistantPanelOpen: boolean;
  toggleAssistantPanel: () => void;
  /** `persist: false` changes the panel without updating the remembered preference. */
  setAssistantPanelOpen: (
    open: boolean,
    options?: { persist?: boolean }
  ) => void;

  /**
   * Whether the mobile panels sheet (color / layers / canvas) is open. On
   * narrow viewports the right column can't sit beside the canvas, so it moves
   * into a bottom sheet toggled by this flag. Ignored on desktop, where the
   * column is docked (and hidden only by the `panelsHidden` chrome toggle).
   */
  mobilePanelsOpen: boolean;
  toggleMobilePanels: () => void;
  setMobilePanelsOpen: (open: boolean) => void;

  /** Cleared whenever a single layer is chosen exclusively (normal click). */
  selectedLayerIds: string[];
  /**
   * Layer id for Shift+click range: last row activated with plain click or Ctrl/Cmd+click.
   * `null` → use `activeLayerId` as range start.
   */
  layerShiftRangeAnchorId: string | null;
  toggleLayerInSelection: (layerId: string) => void;
  /** Shift+click: select all layers between anchor and `toLayerId` in panel row order. */
  selectLayerRangeInPanelOrder: (toLayerId: string) => void;

  isolatedLayerId: string | null;
  toggleIsolateLayer: (layerId: string) => void;

  /** Document-space crop preview while the crop tool is active (not persisted). */
  cropPreviewBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  setCropPreviewBounds: (
    bounds: { x: number; y: number; width: number; height: number } | null
  ) => void;

  /**
   * Document-space cursor position for the status bar (not persisted). Written
   * by the canvas on pointer move; only the status bar subscribes, so this
   * never touches the canvas render hot path.
   */
  cursorDocPos: { x: number; y: number } | null;
  setCursorDocPos: (pos: { x: number; y: number } | null) => void;
}

export const createUiSlice: StateCreator<SketchStore, [], [], UiSlice> = (
  set
) => ({
  transientMoveModifierHeld: false,
  setTransientMoveModifierHeld: (held: boolean) =>
    set({ transientMoveModifierHeld: held }),

  isDrawing: false,
  setIsDrawing: (isDrawing: boolean) => set({ isDrawing }),

  panelsHidden: false,
  togglePanelsHidden: () =>
    set((state) => ({ panelsHidden: !state.panelsHidden })),

  toolSettingsCollapsed: false,
  toggleToolSettingsCollapsed: () =>
    set((state) => ({ toolSettingsCollapsed: !state.toolSettingsCollapsed })),
  setToolSettingsCollapsed: (collapsed: boolean) =>
    set({ toolSettingsCollapsed: collapsed }),

  assistantPanelOpen: readAssistantPanelOpen(),
  toggleAssistantPanel: () =>
    set((state) => {
      const assistantPanelOpen = !state.assistantPanelOpen;
      writeAssistantPanelOpen(assistantPanelOpen);
      return { assistantPanelOpen };
    }),
  setAssistantPanelOpen: (open, options) => {
    if (options?.persist !== false) {
      writeAssistantPanelOpen(open);
    }
    set({ assistantPanelOpen: open });
  },

  mobilePanelsOpen: false,
  toggleMobilePanels: () =>
    set((state) => ({ mobilePanelsOpen: !state.mobilePanelsOpen })),
  setMobilePanelsOpen: (open: boolean) => set({ mobilePanelsOpen: open }),

  selectedLayerIds: [],
  layerShiftRangeAnchorId: null,

  toggleLayerInSelection: (layerId: string) =>
    set((state) => {
      const layer = state.document.layers.find((l) => l.id === layerId);
      if (!layer) {
        return state;
      }
      const { document, selectedLayerIds } = state;
      let base =
        selectedLayerIds.length > 0
          ? selectedLayerIds.filter((id) =>
              document.layers.some((l) => l.id === id)
            )
          : [document.activeLayerId];
      if (!base.includes(document.activeLayerId)) {
        base = [document.activeLayerId];
      }
      const pos = base.indexOf(layerId);
      let next: string[];
      if (pos >= 0) {
        next = base.filter((id) => id !== layerId);
        if (next.length === 0) {
          next = [layerId];
        }
      } else {
        next = [...base, layerId];
      }
      return {
        document: { ...document, activeLayerId: layerId },
        selectedLayerIds: next.length >= 2 ? next : [],
        layerShiftRangeAnchorId: layerId
      };
    }),

  selectLayerRangeInPanelOrder: (toLayerId: string) =>
    set((state) => {
      const { document, layerShiftRangeAnchorId } = state;
      const layers = document.layers;
      if (!layers.some((l) => l.id === toLayerId)) {
        return state;
      }
      const panelIds = buildLayersPanelRows(layers).map((r) => r.layer.id);
      const anchorId =
        layerShiftRangeAnchorId &&
        layers.some((l) => l.id === layerShiftRangeAnchorId)
          ? layerShiftRangeAnchorId
          : document.activeLayerId;
      const iAnchor = panelIds.indexOf(anchorId);
      const iTo = panelIds.indexOf(toLayerId);
      if (iAnchor < 0 || iTo < 0) {
        return {
          document: { ...document, activeLayerId: toLayerId },
          selectedLayerIds: [] as string[]
        };
      }
      const lo = Math.min(iAnchor, iTo);
      const hi = Math.max(iAnchor, iTo);
      const rangeIds = panelIds.slice(lo, hi + 1);
      return {
        document: { ...document, activeLayerId: toLayerId },
        selectedLayerIds: rangeIds.length >= 2 ? rangeIds : []
      };
    }),

  isolatedLayerId: null,
  toggleIsolateLayer: (layerId: string) =>
    set((state) => ({
      isolatedLayerId: state.isolatedLayerId === layerId ? null : layerId
    })),

  cropPreviewBounds: null,
  setCropPreviewBounds: (bounds) => set({ cropPreviewBounds: bounds }),

  cursorDocPos: null,
  setCursorDocPos: (pos) =>
    set((state) => {
      // Written on every pointer move — skip the notify when the integer
      // position is unchanged so subscribers don't re-render per event.
      const prev = state.cursorDocPos;
      if (
        prev === pos ||
        (prev && pos && prev.x === pos.x && prev.y === pos.y)
      ) {
        return state;
      }
      return { ...state, cursorDocPos: pos };
    })
});
