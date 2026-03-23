/**
 * useEditorKeyboardShortcuts
 *
 * Custom hook that manages all keyboard shortcuts for the SketchEditor.
 * Extracted from SketchEditor.tsx to reduce component size.
 */

import { useEffect } from "react";
import { useSketchStore } from "./state";
import type {
  SketchTool,
  BrushSettings,
  PencilSettings,
  EraserSettings,
  BlurSettings,
  CloneStampSettings
} from "./types";

export interface UseEditorKeyboardShortcutsParams {
  handleUndo: () => void;
  handleRedo: () => void;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleZoomReset: () => void;
  handleExportPng: () => void;
  handleClearLayer: () => void;
  handleFillLayerWithColor: (color: string) => void;
  handleNudgeLayer: (dx: number, dy: number) => void;
  setActiveTool: (tool: SketchTool) => void;
  setZoom: (zoom: number) => void;
  setMirrorX: React.Dispatch<React.SetStateAction<boolean>>;
  setMirrorY: React.Dispatch<React.SetStateAction<boolean>>;
  setBrushSettings: (settings: Partial<BrushSettings>) => void;
  setPencilSettings: (settings: Partial<PencilSettings>) => void;
  setEraserSettings: (settings: Partial<EraserSettings>) => void;
  setBlurSettings: (settings: Partial<BlurSettings>) => void;
  setCloneStampSettings: (settings: Partial<CloneStampSettings>) => void;
  swapColors: () => void;
  resetColors: () => void;
  togglePanelsHidden: () => void;
}

export function useEditorKeyboardShortcuts(
  params: UseEditorKeyboardShortcutsParams
): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Prevent sketch shortcuts from bleeding to node editor
      e.stopPropagation();

      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z") {
          e.preventDefault();
          if (e.shiftKey) {
            params.handleRedo();
          } else {
            params.handleUndo();
          }
        }
        if (e.key === "y") {
          e.preventDefault();
          params.handleRedo();
        }
        if (e.key === "0") {
          e.preventDefault();
          params.handleZoomReset();
        }
        if (e.key === "1") {
          e.preventDefault();
          params.setZoom(1);
        }
        if (e.key === "s") {
          e.preventDefault();
          params.handleExportPng();
        }
        if (e.key === "a") {
          e.preventDefault();
          useSketchStore.getState().selectAll();
        }
        // Ctrl+Shift+D → reselect last selection
        if (e.key === "D" && e.shiftKey) {
          e.preventDefault();
          useSketchStore.getState().reselectLastSelection();
        }
        // Ctrl+D → deselect (only when Shift is NOT held)
        else if (e.key === "d" && !e.shiftKey) {
          e.preventDefault();
          useSketchStore.getState().setSelection(null);
        }
        // Ctrl+Shift+I → invert selection
        if (e.key === "I" && e.shiftKey) {
          e.preventDefault();
          useSketchStore.getState().invertSelection();
        }
        // Ctrl+Backspace → fill with background color (Photoshop convention)
        if (e.key === "Backspace") {
          e.preventDefault();
          params.handleFillLayerWithColor(
            useSketchStore.getState().backgroundColor
          );
        }
      } else if (e.altKey) {
        // Alt+Backspace → fill with foreground color (Photoshop convention)
        if (e.key === "Backspace") {
          e.preventDefault();
          params.handleFillLayerWithColor(
            useSketchStore.getState().foregroundColor
          );
        }
      } else if (e.shiftKey) {
        // Shift+M → toggle vertical mirror
        if (e.key === "M") {
          params.setMirrorY((prev) => !prev);
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
            params.setBrushSettings({
              hardness: Math.round(newHardness * 100) / 100
            });
          } else if (tool === "eraser") {
            const newHardness = Math.max(
              0,
              store.document.toolSettings.eraser.hardness - 0.1
            );
            params.setEraserSettings({
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
            params.setBrushSettings({
              hardness: Math.round(newHardness * 100) / 100
            });
          } else if (tool === "eraser") {
            const newHardness = Math.min(
              1,
              store.document.toolSettings.eraser.hardness + 0.1
            );
            params.setEraserSettings({
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
            params.setBrushSettings({ opacity });
          } else if (tool === "pencil") {
            params.setPencilSettings({ opacity });
          } else if (tool === "eraser") {
            params.setEraserSettings({ opacity });
          }
        } else {
          switch (e.key) {
            case "Escape":
              useSketchStore.getState().setSelection(null);
              break;
            case "b":
              params.setActiveTool("brush");
              break;
            case "p":
              params.setActiveTool("pencil");
              break;
            case "e":
              params.setActiveTool("eraser");
              break;
            case "i":
              params.setActiveTool("eyedropper");
              break;
            case "g":
              params.setActiveTool("fill");
              break;
            case "l":
              params.setActiveTool("line");
              break;
            case "r":
              params.setActiveTool("rectangle");
              break;
            case "o":
              params.setActiveTool("ellipse");
              break;
            case "a":
              params.setActiveTool("arrow");
              break;
            case "q":
              params.setActiveTool("blur");
              break;
            case "t":
              params.setActiveTool("gradient");
              break;
            case "c":
              params.setActiveTool("crop");
              break;
            case "j":
              params.setActiveTool("adjust");
              break;
            case "s":
              params.setActiveTool("clone_stamp");
              break;
            case "m":
              params.setMirrorX((prev) => !prev);
              break;
            case "v":
              params.setActiveTool("move");
              break;
            case "x":
              params.swapColors();
              break;
            case "d":
              params.resetColors();
              break;
            case "Tab":
              e.preventDefault();
              params.togglePanelsHidden();
              break;
            case "[": {
              const store = useSketchStore.getState();
              const tool = store.activeTool;
              if (tool === "brush") {
                const newSize = Math.max(
                  1,
                  store.document.toolSettings.brush.size - 5
                );
                params.setBrushSettings({ size: newSize });
              } else if (tool === "pencil") {
                const newSize = Math.max(
                  1,
                  store.document.toolSettings.pencil.size - 1
                );
                params.setPencilSettings({ size: newSize });
              } else if (tool === "eraser") {
                const newSize = Math.max(
                  1,
                  store.document.toolSettings.eraser.size - 5
                );
                params.setEraserSettings({ size: newSize });
              } else if (tool === "blur") {
                const newSize = Math.max(
                  1,
                  store.document.toolSettings.blur.size - 5
                );
                params.setBlurSettings({ size: newSize });
              } else if (tool === "clone_stamp") {
                const newSize = Math.max(
                  1,
                  store.document.toolSettings.cloneStamp.size - 5
                );
                params.setCloneStampSettings({ size: newSize });
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
                params.setBrushSettings({ size: newSize });
              } else if (tool === "pencil") {
                const newSize = Math.min(
                  10,
                  store.document.toolSettings.pencil.size + 1
                );
                params.setPencilSettings({ size: newSize });
              } else if (tool === "eraser") {
                const newSize = Math.min(
                  200,
                  store.document.toolSettings.eraser.size + 5
                );
                params.setEraserSettings({ size: newSize });
              } else if (tool === "blur") {
                const newSize = Math.min(
                  200,
                  store.document.toolSettings.blur.size + 5
                );
                params.setBlurSettings({ size: newSize });
              } else if (tool === "clone_stamp") {
                const newSize = Math.min(
                  200,
                  store.document.toolSettings.cloneStamp.size + 5
                );
                params.setCloneStampSettings({ size: newSize });
              }
              break;
            }
            case "=":
            case "+":
              params.handleZoomIn();
              break;
            case "-":
              params.handleZoomOut();
              break;
            case "Delete":
            case "Backspace":
              params.handleClearLayer();
              break;
            case "ArrowUp": {
              e.preventDefault();
              const amount = e.shiftKey ? 10 : 1;
              params.handleNudgeLayer(0, -amount);
              break;
            }
            case "ArrowDown": {
              e.preventDefault();
              const amount = e.shiftKey ? 10 : 1;
              params.handleNudgeLayer(0, amount);
              break;
            }
            case "ArrowLeft": {
              e.preventDefault();
              const amount = e.shiftKey ? 10 : 1;
              params.handleNudgeLayer(-amount, 0);
              break;
            }
            case "ArrowRight": {
              e.preventDefault();
              const amount = e.shiftKey ? 10 : 1;
              params.handleNudgeLayer(amount, 0);
              break;
            }
          }
        }
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
