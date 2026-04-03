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
    }))
});
