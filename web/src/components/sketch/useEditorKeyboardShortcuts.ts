import { useEffect, useRef } from "react";
import { useSketchStore } from "./state";
import type {
  SketchTool,
  BrushSettings,
  PencilSettings,
  EraserSettings,
  BlurSettings,
  CloneStampSettings,
  ShapeSettings,
  SelectSettings
} from "./types";
import { resolveAction, isInteractiveTarget, ACTION_HANDLERS, useSpringLoadedModifiers } from "./shortcuts";

type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

function isArrowKey(key: string): key is ArrowKey {
  return key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight";
}

export interface UseEditorKeyboardShortcutsParams {
  handleUndo: () => void;
  handleRedo: () => void;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleZoomReset: () => void;
  handleExportPng: () => void;
  handleClearLayer: () => void;
  handleFillLayerWithColor: (color: string) => void;
  handleCopy: () => void;
  handleCut: () => void;
  handlePaste: (preferInternalClipboardFirst?: boolean) => Promise<void>;
  handleNudgeLayer: (
    dx: number,
    dy: number,
    options?: { recordHistory?: boolean; syncOutputs?: boolean }
  ) => void;
  syncSketchOutputsNow: () => void;
  setActiveTool: (tool: SketchTool) => void;
  setZoom: (zoom: number) => void;
  setBrushSettings: (settings: Partial<BrushSettings>) => void;
  setPencilSettings: (settings: Partial<PencilSettings>) => void;
  setEraserSettings: (settings: Partial<EraserSettings>) => void;
  setShapeSettings: (settings: Partial<ShapeSettings>) => void;
  setBlurSettings: (settings: Partial<BlurSettings>) => void;
  setCloneStampSettings: (settings: Partial<CloneStampSettings>) => void;
  setSelectSettings: (settings: Partial<SelectSettings>) => void;
  swapColors: () => void;
  resetColors: () => void;
  togglePanelsHidden: () => void;
  cancelActiveTool?: () => void;
  handleInvertLayerColors: () => void;
  handleTransformCommit?: () => void;
  handleCropCommit?: () => void;
  handleTransformCancel?: () => void;
  handleTransformUndo?: () => void;
  handleTransformRedo?: () => void;
  handleLayerViaCopy?: () => void;
  handleLayerViaCut?: () => void;
  handleFreeTransform?: () => void;
  handleRepeatLastTransform?: () => void;
  handleRepeatLastTransformOnCopy?: () => void;
  /**
   * When true (e.g. keyboard shortcuts overlay open), editor shortcuts are ignored
   * so keys can reach the overlay / on-screen keyboard demo.
   */
  suspendKeyboardShortcuts?: boolean;
}

export function useEditorKeyboardShortcuts(
  params: UseEditorKeyboardShortcutsParams
): void {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useSpringLoadedModifiers({
    isSuspended: () => Boolean(paramsRef.current.suspendKeyboardShortcuts)
  });

  const heldArrowsRef = useRef<Record<ArrowKey, boolean>>({
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
  });
  const shiftHeldRef = useRef(false);
  const nudgeRafRef = useRef<number | null>(null);
  const nudgeHistoryPendingRef = useRef(false);

  useEffect(() => {
    const anyArrowHeld = (): boolean => {
      const h = heldArrowsRef.current;
      return h.ArrowUp || h.ArrowDown || h.ArrowLeft || h.ArrowRight;
    };

    const stopNudgeLoop = (): void => {
      if (nudgeRafRef.current !== null) {
        cancelAnimationFrame(nudgeRafRef.current);
        nudgeRafRef.current = null;
      }
      nudgeHistoryPendingRef.current = false;
      paramsRef.current.syncSketchOutputsNow();
    };

    const runNudgeFrame = (): void => {
      nudgeRafRef.current = null;
      if (!anyArrowHeld()) return;

      const step = shiftHeldRef.current ? 10 : 1;
      let dx = 0;
      let dy = 0;
      const held = heldArrowsRef.current;
      if (held.ArrowLeft) dx -= step;
      if (held.ArrowRight) dx += step;
      if (held.ArrowUp) dy -= step;
      if (held.ArrowDown) dy += step;

      if (dx !== 0 || dy !== 0) {
        const recordHistory = nudgeHistoryPendingRef.current;
        nudgeHistoryPendingRef.current = false;
        paramsRef.current.handleNudgeLayer(dx, dy, { recordHistory, syncOutputs: false });
      }

      if (anyArrowHeld()) {
        nudgeRafRef.current = requestAnimationFrame(runNudgeFrame);
      } else {
        stopNudgeLoop();
      }
    };

    const keydownHandler = (e: KeyboardEvent): void => {
      // Let interactive controls (inputs, comboboxes, etc.) handle their own events.
      if (isInteractiveTarget(document.activeElement)) return;

      if (paramsRef.current.suspendKeyboardShortcuts) {
        return;
      }

      // Prevent all sketch key events from bleeding into the node editor.
      e.stopPropagation();

      // Track Shift for the nudge step multiplier.
      if (e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight") {
        shiftHeldRef.current = true;
        return;
      }

      // Arrow keys drive the held-nudge RAF loop — handled here, not via the catalog.
      if (isArrowKey(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) shiftHeldRef.current = true;
        heldArrowsRef.current[e.key] = true;
        if (nudgeRafRef.current === null) {
          nudgeHistoryPendingRef.current = true;
          runNudgeFrame();
        }
        return;
      }

      const actionId = resolveAction(e, { activeTool: useSketchStore.getState().activeTool });
      if (!actionId) return;

      e.preventDefault();
      ACTION_HANDLERS[actionId]?.(e, paramsRef.current);
    };

    const keyupHandler = (e: KeyboardEvent): void => {
      if (isInteractiveTarget(document.activeElement)) return;

      if (paramsRef.current.suspendKeyboardShortcuts) {
        return;
      }

      e.stopPropagation();

      if (e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight") {
        shiftHeldRef.current = false;
      }

      if (isArrowKey(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        heldArrowsRef.current[e.key] = false;
        if (!anyArrowHeld()) stopNudgeLoop();
      }
    };

    window.addEventListener("keydown", keydownHandler, true);
    window.addEventListener("keyup", keyupHandler, true);

    return () => {
      window.removeEventListener("keydown", keydownHandler, true);
      window.removeEventListener("keyup", keyupHandler, true);
      if (nudgeRafRef.current !== null) {
        cancelAnimationFrame(nudgeRafRef.current);
        nudgeRafRef.current = null;
      }
      const hadArrowHeld = anyArrowHeld();
      heldArrowsRef.current = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
      if (hadArrowHeld) paramsRef.current.syncSketchOutputsNow();
    };
  }, []);

  useEffect(() => {
    if (!params.suspendKeyboardShortcuts) {
      return;
    }
    if (nudgeRafRef.current !== null) {
      cancelAnimationFrame(nudgeRafRef.current);
      nudgeRafRef.current = null;
    }
    nudgeHistoryPendingRef.current = false;
    heldArrowsRef.current = {
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false
    };
    shiftHeldRef.current = false;
    paramsRef.current.syncSketchOutputsNow();
    useSketchStore.getState().setTransientMoveModifierHeld(false);
  }, [params.suspendKeyboardShortcuts]);
}
