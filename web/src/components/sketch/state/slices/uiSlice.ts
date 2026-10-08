/**
 * UI Slice — ephemeral UI flags, layer multi-select, layer isolation.
 */

import type { StateCreator } from "zustand";
import type { SketchStore } from "../useSketchStore";
import { buildLayersPanelRows } from "../../types";
import type { SnapLines } from "../../snapping/moveSnap";

const ASSISTANT_OPEN_KEY = "sketch.assistantPanelOpen";
const VIEW_PREFS_KEY = "sketch.viewPrefs";

interface ViewPrefs {
  rulersVisible: boolean;
  guidesVisible: boolean;
  snapEnabled: boolean;
}

const DEFAULT_VIEW_PREFS: ViewPrefs = {
  rulersVisible: false,
  guidesVisible: true,
  snapEnabled: true
};

function readViewPrefs(): ViewPrefs {
  try {
    const saved = localStorage.getItem(VIEW_PREFS_KEY);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (parsed && typeof parsed === "object") {
        const p = parsed as Partial<Record<keyof ViewPrefs, unknown>>;
        return {
          rulersVisible:
            typeof p.rulersVisible === "boolean"
              ? p.rulersVisible
              : DEFAULT_VIEW_PREFS.rulersVisible,
          guidesVisible:
            typeof p.guidesVisible === "boolean"
              ? p.guidesVisible
              : DEFAULT_VIEW_PREFS.guidesVisible,
          snapEnabled:
            typeof p.snapEnabled === "boolean"
              ? p.snapEnabled
              : DEFAULT_VIEW_PREFS.snapEnabled
        };
      }
    }
  } catch {
    /* private mode or malformed value */
  }
  return { ...DEFAULT_VIEW_PREFS };
}

function writeViewPrefs(prefs: ViewPrefs): void {
  try {
    localStorage.setItem(VIEW_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode */
  }
}

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

  /** Rulers along the top and left canvas edges. Remembered per browser. */
  rulersVisible: boolean;
  toggleRulersVisible: () => void;
  /** Whether ruler guides are drawn. Hidden guides do not snap. */
  guidesVisible: boolean;
  toggleGuidesVisible: () => void;
  /** Snap moves to canvas edges, canvas center, guides and other layers. */
  snapEnabled: boolean;
  toggleSnapEnabled: () => void;
  /**
   * Document-space lines the active drag snapped to, drawn as smart guides.
   * Transient: set by tools during a drag and cleared on release.
   */
  activeSnapLines: SnapLines | null;
  setActiveSnapLines: (lines: SnapLines | null) => void;

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

const initialViewPrefs = readViewPrefs();

function pickViewPrefs(state: ViewPrefs): ViewPrefs {
  return {
    rulersVisible: state.rulersVisible,
    guidesVisible: state.guidesVisible,
    snapEnabled: state.snapEnabled
  };
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

  rulersVisible: initialViewPrefs.rulersVisible,
  toggleRulersVisible: () =>
    set((state) => {
      const rulersVisible = !state.rulersVisible;
      writeViewPrefs({ ...pickViewPrefs(state), rulersVisible });
      return { rulersVisible };
    }),
  guidesVisible: initialViewPrefs.guidesVisible,
  toggleGuidesVisible: () =>
    set((state) => {
      const guidesVisible = !state.guidesVisible;
      writeViewPrefs({ ...pickViewPrefs(state), guidesVisible });
      return { guidesVisible };
    }),
  snapEnabled: initialViewPrefs.snapEnabled,
  toggleSnapEnabled: () =>
    set((state) => {
      const snapEnabled = !state.snapEnabled;
      writeViewPrefs({ ...pickViewPrefs(state), snapEnabled });
      return { snapEnabled };
    }),

  activeSnapLines: null,
  setActiveSnapLines: (lines: SnapLines | null) =>
    set((state) => {
      const prev = state.activeSnapLines;
      const next = lines && (lines.x !== null || lines.y !== null) ? lines : null;
      if (prev === next || (prev && next && prev.x === next.x && prev.y === next.y)) {
        return state;
      }
      return { activeSnapLines: next };
    }),

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
