/**
 * useEditorKeyboardShortcuts
 *
 * Custom hook that manages all keyboard shortcuts for the SketchEditor.
 * Extracted from SketchEditor.tsx to reduce component size.
 */

import { useEffect, useRef } from "react";
import { useSketchStore } from "./state";
import type {
  SketchTool,
  ShapeToolType,
  BrushSettings,
  PencilSettings,
  EraserSettings,
  BlurSettings,
  CloneStampSettings,
  ShapeSettings
} from "./types";

type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

function isArrowKey(key: string): key is ArrowKey {
  return (
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "ArrowLeft" ||
    key === "ArrowRight"
  );
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
  handlePaste: () => Promise<void>;
  handleNudgeLayer: (
    dx: number,
    dy: number,
    options?: { recordHistory?: boolean; syncOutputs?: boolean }
  ) => void;
  /** Run once after a held-arrow nudge ends so parent node gets a final PNG/mask. */
  syncSketchOutputsNow: () => void;
  setActiveTool: (tool: SketchTool) => void;
  setZoom: (zoom: number) => void;
  setMirrorX: (v: boolean) => void;
  setMirrorY: (v: boolean) => void;
  setBrushSettings: (settings: Partial<BrushSettings>) => void;
  setPencilSettings: (settings: Partial<PencilSettings>) => void;
  setEraserSettings: (settings: Partial<EraserSettings>) => void;
  setShapeSettings: (settings: Partial<ShapeSettings>) => void;
  setBlurSettings: (settings: Partial<BlurSettings>) => void;
  setCloneStampSettings: (settings: Partial<CloneStampSettings>) => void;
  swapColors: () => void;
  resetColors: () => void;
  togglePanelsHidden: () => void;
}

export function useEditorKeyboardShortcuts(
  params: UseEditorKeyboardShortcutsParams
): void {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const heldArrowsRef = useRef<Record<ArrowKey, boolean>>({
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
  });
  const shiftHeldRef = useRef(false);
  const nudgeRafRef = useRef<number | null>(null);
  /** True until the first applied nudge of the current hold session (for one undo step). */
  const nudgeHistoryPendingRef = useRef(false);

  useEffect(() => {
    const stopLayerNudgeLoop = () => {
      if (nudgeRafRef.current !== null) {
        cancelAnimationFrame(nudgeRafRef.current);
        nudgeRafRef.current = null;
      }
      nudgeHistoryPendingRef.current = false;
      paramsRef.current.syncSketchOutputsNow();
    };

    const anyArrowHeld = (): boolean => {
      const h = heldArrowsRef.current;
      return h.ArrowUp || h.ArrowDown || h.ArrowLeft || h.ArrowRight;
    };

    const runNudgeFrame = () => {
      nudgeRafRef.current = null;
      if (!anyArrowHeld()) {
        return;
      }

      const step = shiftHeldRef.current ? 10 : 1;
      let dx = 0;
      let dy = 0;
      const held = heldArrowsRef.current;
      if (held.ArrowLeft) {
        dx -= step;
      }
      if (held.ArrowRight) {
        dx += step;
      }
      if (held.ArrowUp) {
        dy -= step;
      }
      if (held.ArrowDown) {
        dy += step;
      }

      if (dx !== 0 || dy !== 0) {
        const recordHistory = nudgeHistoryPendingRef.current;
        nudgeHistoryPendingRef.current = false;
        paramsRef.current.handleNudgeLayer(dx, dy, {
          recordHistory,
          syncOutputs: false
        });
      }

      if (anyArrowHeld()) {
        nudgeRafRef.current = requestAnimationFrame(runNudgeFrame);
      } else {
        stopLayerNudgeLoop();
      }
    };

    const keydownHandler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Prevent sketch shortcuts from bleeding to node editor
      e.stopPropagation();

      if (e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight") {
        shiftHeldRef.current = true;
      }

      if (
        isArrowKey(e.key) &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        if (e.shiftKey) {
          shiftHeldRef.current = true;
        }
        heldArrowsRef.current[e.key] = true;
        if (nudgeRafRef.current === null) {
          nudgeHistoryPendingRef.current = true;
          // Run immediately so a quick tap still moves one step before keyup cancels rAF.
          runNudgeFrame();
        }
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z") {
          e.preventDefault();
          if (e.shiftKey) {
            paramsRef.current.handleRedo();
          } else {
            paramsRef.current.handleUndo();
          }
        }
        if (e.key === "y") {
          e.preventDefault();
          paramsRef.current.handleRedo();
        }
        if (e.key === "0") {
          e.preventDefault();
          paramsRef.current.handleZoomReset();
        }
        if (e.key === "1") {
          e.preventDefault();
          paramsRef.current.setZoom(1);
        }
        if (e.key === "s") {
          e.preventDefault();
          paramsRef.current.handleExportPng();
        }
        if (e.key === "a") {
          e.preventDefault();
          useSketchStore.getState().selectAll();
        }
        // Ctrl+Shift+D → reselect last selection
        if (e.key.toLowerCase() === "d" && e.shiftKey) {
          e.preventDefault();
          useSketchStore.getState().reselectLastSelection();
        }
        // Ctrl+D → deselect (only when Shift is NOT held)
        else if (e.key.toLowerCase() === "d" && !e.shiftKey) {
          e.preventDefault();
          useSketchStore.getState().setSelection(null);
        }
        // Ctrl+Shift+I → invert selection
        if (e.key.toLowerCase() === "i" && e.shiftKey) {
          e.preventDefault();
          useSketchStore.getState().invertSelection();
        }
        // Ctrl+Backspace → fill with background color (Photoshop convention)
        if (e.key === "Backspace") {
          e.preventDefault();
          paramsRef.current.handleFillLayerWithColor(
            useSketchStore.getState().backgroundColor
          );
        }
        // Ctrl+C → copy
        if (e.key === "c" && !e.shiftKey) {
          e.preventDefault();
          paramsRef.current.handleCopy();
        }
        // Ctrl+X → cut
        if (e.key === "x" && !e.shiftKey) {
          e.preventDefault();
          paramsRef.current.handleCut();
        }
        // Ctrl+V → paste
        if (e.key === "v" && !e.shiftKey) {
          e.preventDefault();
          paramsRef.current.handlePaste();
        }
      } else if (e.altKey) {
        // Alt+Backspace → fill with foreground color (Photoshop convention)
        if (e.key === "Backspace") {
          e.preventDefault();
          paramsRef.current.handleFillLayerWithColor(
            useSketchStore.getState().foregroundColor
          );
        }
      } else if (e.shiftKey) {
        // Shift+M → toggle vertical mirror
        if (e.key === "M") {
          paramsRef.current.setMirrorY(!useSketchStore.getState().mirrorY);
        }
        // Shift+[ / Shift+] → decrease / increase hardness (Photoshop convention)
        if (e.key === "{") {
          const store = useSketchStore.getState();
          const tool = store.activeTool;
          if (tool === "brush") {
            const newHardness = Math.max(
              0,
              store.document.toolSettings.brush.hardness - 0.1
            );
            paramsRef.current.setBrushSettings({
              hardness: Math.round(newHardness * 100) / 100
            });
          } else if (tool === "eraser") {
            const newHardness = Math.max(
              0,
              store.document.toolSettings.brush.hardness - 0.1
            );
            paramsRef.current.setBrushSettings({
              hardness: Math.round(newHardness * 100) / 100
            });
          }
        } else if (e.key === "}") {
          const store = useSketchStore.getState();
          const tool = store.activeTool;
          if (tool === "brush") {
            const newHardness = Math.min(
              1,
              store.document.toolSettings.brush.hardness + 0.1
            );
            paramsRef.current.setBrushSettings({
              hardness: Math.round(newHardness * 100) / 100
            });
          } else if (tool === "eraser") {
            const newHardness = Math.min(
              1,
              store.document.toolSettings.brush.hardness + 0.1
            );
            paramsRef.current.setBrushSettings({
              hardness: Math.round(newHardness * 100) / 100
            });
          }
        }
      } else {
        // Number keys 0-9 → set brush opacity (Photoshop convention)
        // 1=10%, 2=20%, ..., 9=90%, 0=100%
        if (/^[0-9]$/.test(e.key)) {
          const store = useSketchStore.getState();
          const tool = store.activeTool;
          const digit = parseInt(e.key, 10);
          const opacity = digit === 0 ? 1 : digit / 10;
          if (tool === "brush") {
            paramsRef.current.setBrushSettings({ opacity });
          } else if (tool === "pencil") {
            paramsRef.current.setPencilSettings({ opacity });
          } else if (tool === "eraser") {
            paramsRef.current.setEraserSettings({ opacity });
          }
        } else {
          switch (e.key) {
            case "Escape":
              useSketchStore.getState().setSelection(null);
              break;
            case "b":
              paramsRef.current.setActiveTool("brush");
              break;
            case "p":
              paramsRef.current.setActiveTool("pencil");
              break;
            case "e":
              paramsRef.current.setActiveTool("eraser");
              break;
            case "i":
              paramsRef.current.setActiveTool("eyedropper");
              break;
            case "g":
              paramsRef.current.setActiveTool("fill");
              break;
            case "u":
              paramsRef.current.setActiveTool("shape");
              break;
            case "l":
            case "r":
            case "o":
            case "a": {
              const shapeTypeMap: Record<string, ShapeToolType> = {
                l: "line", r: "rectangle", o: "ellipse", a: "arrow"
              };
              paramsRef.current.setActiveTool("shape");
              paramsRef.current.setShapeSettings({
                shapeType: shapeTypeMap[e.key]
              });
              break;
            }
            case "q":
              paramsRef.current.setActiveTool("blur");
              break;
            case "t":
              paramsRef.current.setActiveTool("gradient");
              break;
            case "c":
              paramsRef.current.setActiveTool("crop");
              break;
            case "j":
              paramsRef.current.setActiveTool("adjust");
              break;
            case "s":
              paramsRef.current.setActiveTool("clone_stamp");
              break;
            case "m":
              paramsRef.current.setMirrorX(!useSketchStore.getState().mirrorX);
              break;
            case "v":
              paramsRef.current.setActiveTool("move");
              break;
            case "x":
              paramsRef.current.swapColors();
              break;
            case "d":
              paramsRef.current.resetColors();
              break;
            case "Tab":
              e.preventDefault();
              paramsRef.current.togglePanelsHidden();
              break;
            case "[": {
              const store = useSketchStore.getState();
              const tool = store.activeTool;
              if (tool === "brush") {
                const newSize = Math.max(
                  1,
                  store.document.toolSettings.brush.size - 5
                );
                paramsRef.current.setBrushSettings({ size: newSize });
              } else if (tool === "pencil") {
                const newSize = Math.max(
                  1,
                  store.document.toolSettings.pencil.size - 1
                );
                paramsRef.current.setPencilSettings({ size: newSize });
              } else if (tool === "eraser") {
                const newSize = Math.max(
                  1,
                  store.document.toolSettings.eraser.size - 5
                );
                paramsRef.current.setEraserSettings({ size: newSize });
              } else if (tool === "blur") {
                const newSize = Math.max(
                  1,
                  store.document.toolSettings.blur.size - 5
                );
                paramsRef.current.setBlurSettings({ size: newSize });
              } else if (tool === "clone_stamp") {
                const newSize = Math.max(
                  1,
                  store.document.toolSettings.cloneStamp.size - 5
                );
                paramsRef.current.setCloneStampSettings({ size: newSize });
              }
              break;
            }
            case "]": {
              const store = useSketchStore.getState();
              const tool = store.activeTool;
              if (tool === "brush") {
                const newSize = Math.min(
                  200,
                  store.document.toolSettings.brush.size + 5
                );
                paramsRef.current.setBrushSettings({ size: newSize });
              } else if (tool === "pencil") {
                const newSize = Math.min(
                  10,
                  store.document.toolSettings.pencil.size + 1
                );
                paramsRef.current.setPencilSettings({ size: newSize });
              } else if (tool === "eraser") {
                const newSize = Math.min(
                  200,
                  store.document.toolSettings.eraser.size + 5
                );
                paramsRef.current.setEraserSettings({ size: newSize });
              } else if (tool === "blur") {
                const newSize = Math.min(
                  200,
                  store.document.toolSettings.blur.size + 5
                );
                paramsRef.current.setBlurSettings({ size: newSize });
              } else if (tool === "clone_stamp") {
                const newSize = Math.min(
                  200,
                  store.document.toolSettings.cloneStamp.size + 5
                );
                paramsRef.current.setCloneStampSettings({ size: newSize });
              }
              break;
            }
            case "=":
            case "+":
              paramsRef.current.handleZoomIn();
              break;
            case "-":
              paramsRef.current.handleZoomOut();
              break;
            case "Delete":
            case "Backspace":
              paramsRef.current.handleClearLayer();
              break;
          }
        }
      }
    };

    const keyupHandler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      e.stopPropagation();

      if (e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight") {
        shiftHeldRef.current = false;
      }

      if (isArrowKey(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        heldArrowsRef.current[e.key] = false;
        if (!anyArrowHeld()) {
          if (nudgeRafRef.current !== null) {
            cancelAnimationFrame(nudgeRafRef.current);
            nudgeRafRef.current = null;
          }
          nudgeHistoryPendingRef.current = false;
          paramsRef.current.syncSketchOutputsNow();
        }
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
      const hadArrowHeld =
        heldArrowsRef.current.ArrowUp ||
        heldArrowsRef.current.ArrowDown ||
        heldArrowsRef.current.ArrowLeft ||
        heldArrowsRef.current.ArrowRight;
      heldArrowsRef.current = {
        ArrowUp: false,
        ArrowDown: false,
        ArrowLeft: false,
        ArrowRight: false
      };
      if (hadArrowHeld) {
        paramsRef.current.syncSketchOutputsNow();
      }
    };
  }, []);
}
