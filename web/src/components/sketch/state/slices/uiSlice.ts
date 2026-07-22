/**
 * UI Slice — ephemeral UI flags, layer multi-select, layer isolation.
 */

import type { StateCreator } from "zustand";
import type { SketchStore } from "../useSketchStore";
import { buildLayersPanelRows } from "../../types";

export interface UiSlice {
  /** True while Ctrl/Cmd is held for spring-loaded move. */
  transientMoveModifierHeld: boolean;
  setTransientMoveModifierHeld: (held: boolean) => void;

  isDrawing: boolean;
  setIsDrawing: (isDrawing: boolean) => void;

  panelsHidden: boolean;
  togglePanelsHidden: () => void;

  /** Whether the AI assistant chat panel is open (right side of the editor). */
  assistantPanelOpen: boolean;
  toggleAssistantPanel: () => void;
  setAssistantPanelOpen: (open: boolean) => void;

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

  assistantPanelOpen: false,
  toggleAssistantPanel: () =>
    set((state) => ({ assistantPanelOpen: !state.assistantPanelOpen })),
  setAssistantPanelOpen: (open: boolean) => set({ assistantPanelOpen: open }),

  mobilePanelsOpen: false,
  toggleMobilePanels: () =>
    set((state) => ({ mobilePanelsOpen: !state.mobilePanelsOpen })),
  setMobilePanelsOpen: (open: boolean) => set({ mobilePanelsOpen: open }),

  selectedLayerIds: [] as string[],
  layerShiftRangeAnchorId: null as string | null,

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
      if (prev === pos || (prev && pos && prev.x === pos.x && prev.y === pos.y)) {
        return state;
      }
      return { ...state, cursorDocPos: pos };
    })
});
