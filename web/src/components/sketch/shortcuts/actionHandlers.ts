import type { SketchActionId } from "./actionRegistry";
import type { UseEditorKeyboardShortcutsParams } from "../useEditorKeyboardShortcuts";
import { useSketchStore } from "../state";

export type ActionHandler = (e: KeyboardEvent, params: UseEditorKeyboardShortcutsParams) => void;
export type ActionHandlerMap = Partial<Record<SketchActionId, ActionHandler>>;

// ── Paint tool size steps ────────────────────────────────────────────────────

function adjustSize(params: UseEditorKeyboardShortcutsParams, delta: number): void {
  const store = useSketchStore.getState();
  const tool = store.activeTool;
  if (tool === "brush") {
    params.setBrushSettings({ size: Math.max(1, store.toolSettings.brush.size + delta * 5) });
  } else if (tool === "pencil") {
    params.setPencilSettings({ size: Math.max(1, store.toolSettings.pencil.size + delta) });
  } else if (tool === "eraser") {
    params.setEraserSettings({ size: Math.max(1, store.toolSettings.eraser.size + delta * 5) });
  } else if (tool === "blur") {
    params.setBlurSettings({ size: Math.max(1, store.toolSettings.blur.size + delta * 5) });
  } else if (tool === "clone_stamp") {
    params.setCloneStampSettings({ size: Math.max(1, store.toolSettings.cloneStamp.size + delta * 5) });
  }
}

function adjustHardness(params: UseEditorKeyboardShortcutsParams, delta: number): void {
  const store = useSketchStore.getState();
  const tool = store.activeTool;
  if (tool === "brush" || tool === "eraser") {
    const next = Math.min(1, Math.max(0, store.toolSettings.brush.hardness + delta * 0.1));
    params.setBrushSettings({ hardness: Math.round(next * 100) / 100 });
  }
}

// ── Handler map ──────────────────────────────────────────────────────────────

export const ACTION_HANDLERS: ActionHandlerMap = {
  // Edit
  "undo": (_e, p) => p.handleUndo(),
  "redo": (_e, p) => p.handleRedo(),
  "copy": (_e, p) => p.handleCopy(),
  "cut": (_e, p) => p.handleCut(),
  // Ctrl+V — Photoshop-style: paste into a NEW layer centered on the
  // cursor. Falls back to in-place paste only if the new-layer flow
  // isn't wired (older callers).
  "paste": (_e, p) => {
    if (p.handlePasteAsNewLayer) {
      void p.handlePasteAsNewLayer();
    } else {
      void p.handlePaste(false);
    }
  },
  // Ctrl+Shift+V — paste in place into the active layer (keeps the
  // masked-alpha-first internal-buffer behavior).
  "paste-masked": (_e, p) => { void p.handlePaste(true); },
  "free-transform": (_e, p) => {
    if (p.handleFreeTransform) {
      p.handleFreeTransform();
    } else {
      p.setActiveTool("transform");
    }
  },
  "repeat-transform": (_e, p) => p.handleRepeatLastTransform?.(),
  "repeat-transform-on-copy": (_e, p) => p.handleRepeatLastTransformOnCopy?.(),
  "clear-layer": (_e, p) => p.handleClearLayer(),
  "fill-background": (_e, p) => {
    const { backgroundColor } = useSketchStore.getState();
    p.handleFillLayerWithColor(backgroundColor);
  },
  "fill-foreground": (_e, p) => {
    const { foregroundColor } = useSketchStore.getState();
    p.handleFillLayerWithColor(foregroundColor);
  },
  "invert-colors": (_e, p) => p.handleInvertLayerColors(),
  "cancel-or-deselect": (_e, p) => {
    p.cancelActiveTool?.();
    useSketchStore.getState().setSelection(null);
  },

  // Nudge actions are handled specially in the hook (RAF loop with held-key tracking).
  // They are intentionally absent from this map.

  // Selection
  "select-all": (_e, _p) => useSketchStore.getState().selectAll(),
  "deselect": (_e, _p) => useSketchStore.getState().setSelection(null),
  "reselect": (_e, _p) => useSketchStore.getState().reselectLastSelection(),
  "invert-selection": (_e, _p) => useSketchStore.getState().invertSelection(),

  // Canvas
  "export-png": (_e, p) => p.handleExportPng(),
  "zoom-reset": (_e, p) => p.handleZoomReset(),
  "zoom-100": (_e, p) => p.setZoom(1),
  "zoom-in": (_e, p) => p.handleZoomIn(),
  "zoom-out": (_e, p) => p.handleZoomOut(),
  "toggle-panels": (_e, p) => p.togglePanelsHidden(),

  // Color
  "swap-colors": (_e, p) => p.swapColors(),
  "reset-colors": (_e, p) => p.resetColors(),

  // Layers
  "layer-via-copy": (_e, p) => p.handleLayerViaCopy?.(),
  "layer-via-cut": (_e, p) => p.handleLayerViaCut?.(),

  // Paint settings
  "tool-size-decrease": (_e, p) => adjustSize(p, -1),
  "tool-size-increase": (_e, p) => adjustSize(p, 1),
  "tool-hardness-decrease": (_e, p) => adjustHardness(p, -1),
  "tool-hardness-increase": (_e, p) => adjustHardness(p, 1),
  "tool-opacity-preset": (e, p) => {
    const digit = parseInt(e.key, 10);
    if (isNaN(digit)) return;
    const opacity = digit === 0 ? 1 : digit / 10;
    const tool = useSketchStore.getState().activeTool;
    if (tool === "brush") p.setBrushSettings({ opacity });
    else if (tool === "pencil") p.setPencilSettings({ opacity });
    else if (tool === "eraser") p.setEraserSettings({ opacity });
  },

  // Tool switches
  "tool-move": (_e, p) => p.setActiveTool("move"),
  "tool-brush": (_e, p) => p.setActiveTool("brush"),
  "tool-pencil": (_e, p) => p.setActiveTool("pencil"),
  "tool-eraser": (_e, p) => p.setActiveTool("eraser"),
  "tool-fill": (_e, p) => p.setActiveTool("fill"),
  "tool-eyedropper": (_e, p) => p.setActiveTool("eyedropper"),
  "tool-blur": (_e, p) => p.setActiveTool("blur"),
  "tool-clone-stamp": (_e, p) => p.setActiveTool("clone_stamp"),
  "tool-adjust": (_e, p) => p.setActiveTool("adjust"),
  "tool-select-magic-wand": (_e, p) => {
    p.setActiveTool("select");
    p.setSelectSettings({ mode: "magic_wand" });
  },
  "tool-select-rect": (_e, p) => {
    p.setActiveTool("select");
    p.setSelectSettings({ mode: "rectangle" });
  },
  "tool-crop": (_e, p) => p.setActiveTool("crop"),
  "tool-gradient": (_e, p) => p.setActiveTool("gradient"),
  "tool-transform": (_e, p) => p.setActiveTool("transform"),
  "tool-shape": (_e, p) => p.setActiveTool("shape"),
  "tool-shape-line": (_e, p) => {
    p.setActiveTool("shape");
    p.setShapeSettings({ shapeType: "line" });
  },
  "tool-shape-rect": (_e, p) => {
    p.setActiveTool("shape");
    p.setShapeSettings({ shapeType: "rectangle" });
  },
  "tool-shape-ellipse": (_e, p) => {
    p.setActiveTool("shape");
    p.setShapeSettings({ shapeType: "ellipse" });
  },
  "tool-shape-arrow": (_e, p) => {
    p.setActiveTool("shape");
    p.setShapeSettings({ shapeType: "arrow" });
  },

  // Mode: transform (fired by dispatcher when activeTool === "transform")
  "transform-undo": (_e, p) => p.handleTransformUndo?.(),
  "transform-redo": (_e, p) => p.handleTransformRedo?.(),
  // Stay on the Transform tool after commit/cancel so a follow-up gesture (or
  // another ENTER/ESC) is harmless. Affinity-style: tool only changes via the
  // toolbar or an explicit shortcut.
  "transform-commit": (_e, p) => {
    p.handleTransformCommit?.();
  },
  "transform-cancel": (_e, p) => {
    p.handleTransformCancel?.();
  },
  "transform-reset": (_e, p) => {
    p.handleTransformReset?.();
  },

  // Mode: crop
  "crop-commit": (_e, p) => p.handleCropCommit?.(),
  "crop-cancel": (_e, p) => p.cancelActiveTool?.(),

  // Panel:layers — dispatched by panel components; absent here intentionally.
};
