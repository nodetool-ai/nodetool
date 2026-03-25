/**
 * useCanvasActions
 *
 * Canvas-level handlers: crop, export, clear, fill, nudge, resize, zoom,
 * stroke start/end, and brightness/contrast/saturation adjustments.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { SketchCanvasRef } from "../SketchCanvas";
import {
  isTransformOnlyTool,
  layerAllowsTransformWhilePixelLocked,
  type LayerContentBounds,
  type Point,
  type PushHistoryOptions,
  type SketchDocument,
  type SketchTool
} from "../types";
import { useSketchStore } from "../state";
import { getLayerCompositeOffset } from "../painting";
import type { StrokeEndOptions } from "../tools/types";

export interface UseCanvasActionsParams {
  canvasRef: RefObject<SketchCanvasRef | null>;
  document: SketchDocument;
  activeTool: SketchTool;
  zoom: number;
  pushHistory: (
    label: string,
    layerCanvasSnapshots?: Record<string, HTMLCanvasElement | null>,
    options?: PushHistoryOptions
  ) => void;
  updateLayerData: (layerId: string, data: string | null) => void;
  offsetLayerTransform: (layerId: string, dx: number, dy: number) => void;
  commitLayerTransform: (layerId: string, transform: Point) => void;
  setLayerContentBounds: (
    layerId: string,
    contentBounds: LayerContentBounds
  ) => void;
  setDocument: (doc: SketchDocument) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: Point) => void;
  resizeCanvas: (width: number, height: number) => void;
  onExportImage?: (dataUrl: string) => void;
  onExportMask?: (dataUrl: string | null) => void;
}

export function useCanvasActions({
  canvasRef,
  document,
  activeTool,
  zoom,
  pushHistory,
  updateLayerData,
  offsetLayerTransform,
  commitLayerTransform,
  setLayerContentBounds,
  setDocument,
  setZoom,
  setPan,
  resizeCanvas,
  onExportImage,
  onExportMask
}: UseCanvasActionsParams) {
  interface PendingStrokeFinalize {
    hasSnapshot: boolean;
    data: string | null;
    committedBounds?: LayerContentBounds | null;
  }

  interface PendingExportSync {
    image: boolean;
    mask: boolean;
  }

  const pendingStrokeFinalizeRef = useRef<Map<string, PendingStrokeFinalize>>(new Map());
  const pendingExportSyncRef = useRef<PendingExportSync>({ image: false, mask: false });
  const layerThumbIdleFlushScheduledRef = useRef(false);

  const flushPendingStrokeFinalization = useCallback(() => {
    const pendingEntries = Array.from(pendingStrokeFinalizeRef.current.entries());
    pendingStrokeFinalizeRef.current.clear();

    if (pendingEntries.length === 0) {
      return;
    }

    const canvas = canvasRef.current;
    for (const [layerId, pending] of pendingEntries) {
      const nextData = pending.hasSnapshot
        ? pending.data
        : canvas?.getLayerData(layerId) ?? null;
      updateLayerData(layerId, nextData);
      if (pending.committedBounds) {
        setLayerContentBounds(layerId, pending.committedBounds);
      }
    }

  }, [canvasRef, updateLayerData, setLayerContentBounds]);

  /**
   * Encode pending layer pixels into document state for layer-panel thumbnails.
   * Runs on an idle callback so it does not compete with cursor / pointer-up work.
   * Stroke end only registers pending data; this is invoked when the pointer leaves
   * the canvas (see SketchCanvas). Modal close still uses flushPendingCanvasSync.
   */
  const flushLayerThumbnailsWhenIdle = useCallback(() => {
    if (layerThumbIdleFlushScheduledRef.current) {
      return;
    }
    layerThumbIdleFlushScheduledRef.current = true;
    const run = () => {
      layerThumbIdleFlushScheduledRef.current = false;
      flushPendingStrokeFinalization();
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => run(), { timeout: 1500 });
    } else {
      window.setTimeout(run, 0);
    }
  }, [flushPendingStrokeFinalization]);

  const flushPendingExportSync = useCallback(() => {
    const pending = pendingExportSyncRef.current;
    pendingExportSyncRef.current = { image: false, mask: false };

    if (!pending.image && !pending.mask) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    if (pending.image && onExportImage) {
      onExportImage(canvas.flattenToDataUrl());
    }
    if (pending.mask && onExportMask) {
      onExportMask(canvas.getMaskDataUrl());
    }
  }, [canvasRef, onExportImage, onExportMask]);

  const flushPendingCanvasSync = useCallback(() => {
    flushPendingStrokeFinalization();
    flushPendingExportSync();
  }, [flushPendingStrokeFinalization, flushPendingExportSync]);

  /** Immediate PNG/mask sync to parent (used after keyboard nudge session ends). */
  const syncSketchOutputsNow = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    if (onExportImage) {
      onExportImage(canvas.flattenToDataUrl());
    }
    if (onExportMask) {
      onExportMask(canvas.getMaskDataUrl());
    }
  }, [canvasRef, onExportImage, onExportMask]);

  const pushTransformHistory = useCallback(
    (label: string) => {
      pushHistory(label, undefined, { restoreMode: "structure-only" });
    },
    [pushHistory]
  );

  const commitPixelLayerChange = useCallback(
    (layerId: string, data: string | null, bounds?: LayerContentBounds) => {
      updateLayerData(layerId, data);
      if (bounds) {
        setLayerContentBounds(layerId, bounds);
      }
    },
    [updateLayerData, setLayerContentBounds]
  );

  const syncPixelLayerFromCanvas = useCallback(
    (layerId: string, bounds?: LayerContentBounds) => {
      const data = canvasRef.current?.getLayerData(layerId) ?? null;
      commitPixelLayerChange(layerId, data, bounds);
      return data;
    },
    [canvasRef, commitPixelLayerChange]
  );

  const handleCommitLayerTransform = useCallback(
    (layerId: string, transform: Point) => {
      commitLayerTransform(layerId, transform);
    },
    [commitLayerTransform]
  );

  // ─── Stroke handlers ───────────────────────────────────────────────
  const handleStrokeStart = useCallback(() => {
    const activeLayerId = document.activeLayerId;
    const isTransformOnlyGesture = isTransformOnlyTool(activeTool);
    const activeLayerSnapshot =
      !isTransformOnlyGesture && activeLayerId && canvasRef.current
        ? canvasRef.current.snapshotLayerCanvas(activeLayerId)
        : null;

    const actionLabel = isTransformOnlyGesture
      ? "move layer"
      : `${activeTool} stroke`;
    const layerSnapshots = activeLayerId
      ? { [activeLayerId]: activeLayerSnapshot }
      : undefined;

    // pushHistory updates Zustand (and can trigger React). Doing that in the same
    // turn as pointerdown competes with the first dab and compositing. The pixel
    // snapshot must stay synchronous for undo; defer only the history commit.
    window.requestAnimationFrame(() => {
      pushHistory(
        actionLabel,
        layerSnapshots,
        isTransformOnlyGesture ? { restoreMode: "structure-only" } : undefined
      );
    });
  }, [document.activeLayerId, canvasRef, pushHistory, activeTool]);

  const handleStrokeEnd = useCallback(
    (
      layerId: string,
      data: string | null,
      committedBounds?: LayerContentBounds,
      options?: StrokeEndOptions
    ) => {
      if (onExportImage) {
        pendingExportSyncRef.current.image = true;
      }
      if (onExportMask) {
        pendingExportSyncRef.current.mask = true;
      }

      if (data !== null) {
        // Caller already provided serialized data (rare fast-path).
        commitPixelLayerChange(layerId, data, committedBounds);
        pendingStrokeFinalizeRef.current.set(layerId, {
          hasSnapshot: true,
          data
        });
        return;
      }

      if (options?.syncDocumentFromCanvas === false) {
        return;
      }

      // Canvas already has the correct pixels. Defer encode + Zustand update until
      // the pointer leaves the canvas (flushLayerThumbnailsWhenIdle) or modal
      // close (flushPendingCanvasSync) so pointer-up stays smooth.
      pendingStrokeFinalizeRef.current.set(layerId, {
        hasSnapshot: false,
        data: null,
        committedBounds: committedBounds ?? null
      });
    },
    [onExportImage, onExportMask, commitPixelLayerChange]
  );

  const bakeLayerTransformIntoDocumentSpace = useCallback(
    (layerId: string) => {
      const layer = document.layers.find((entry) => entry.id === layerId);
      if (!layer || !canvasRef.current) {
        return;
      }

      const tx = layer.transform?.x ?? 0;
      const ty = layer.transform?.y ?? 0;
      if (tx === 0 && ty === 0) {
        return;
      }

      const data = canvasRef.current.reconcileLayerToDocumentSpace(layerId);
      commitLayerTransform(layerId, { x: 0, y: 0 });
      setLayerContentBounds(layerId, {
        x: 0,
        y: 0,
        width: document.canvas.width,
        height: document.canvas.height
      });
      updateLayerData(layerId, data);
    },
    [
      document.layers,
      document.canvas.width,
      document.canvas.height,
      canvasRef,
      commitLayerTransform,
      setLayerContentBounds,
      updateLayerData
    ]
  );

  // ─── Clear active layer (or selection area) ────────────────────────
  const handleClearLayer = useCallback(() => {
    const activeLayerId = document.activeLayerId;
    if (!activeLayerId || !canvasRef.current) {
      return;
    }
    const layer = document.layers.find((entry) => entry.id === activeLayerId);
    if (!layer) {
      return;
    }
    const sel = useSketchStore.getState().selection;
    if (sel && sel.width > 0 && sel.height > 0) {
      pushHistory("clear selection");
      const offset = getLayerCompositeOffset(layer, {
        width: Math.max(1, layer.contentBounds?.width ?? document.canvas.width),
        height: Math.max(1, layer.contentBounds?.height ?? document.canvas.height)
      });
      canvasRef.current.clearLayerRect(
        activeLayerId,
        sel.x - offset.x,
        sel.y - offset.y,
        sel.width,
        sel.height
      );
      syncPixelLayerFromCanvas(activeLayerId);
    } else {
      pushHistory("clear layer");
      canvasRef.current.clearLayer(activeLayerId);
      commitPixelLayerChange(activeLayerId, null);
    }
  }, [
    document.activeLayerId,
    document.layers,
    document.canvas.width,
    document.canvas.height,
    pushHistory,
    commitPixelLayerChange,
    syncPixelLayerFromCanvas,
    canvasRef
  ]);

  // ─── Fill layer with color (respects selection) ─────────────────
  const handleFillLayerWithColor = useCallback(
    (color: string) => {
      const activeLayerId = document.activeLayerId;
      const layer = document.layers.find((l) => l.id === activeLayerId);
      if (!activeLayerId || !canvasRef.current || !layer || layer.locked) {
        return;
      }
      const sel = useSketchStore.getState().selection;
      if (sel && sel.width > 0 && sel.height > 0) {
        pushHistory("fill selection");
        const offset = getLayerCompositeOffset(layer, {
          width: Math.max(1, layer.contentBounds?.width ?? document.canvas.width),
          height: Math.max(1, layer.contentBounds?.height ?? document.canvas.height)
        });
        canvasRef.current.fillLayerRect(
          activeLayerId,
          sel.x - offset.x,
          sel.y - offset.y,
          sel.width,
          sel.height,
          color
        );
      } else {
        pushHistory("fill layer");
        canvasRef.current.fillLayerWithColor(activeLayerId, color);
      }
      syncPixelLayerFromCanvas(activeLayerId);
    },
    [
      document.activeLayerId,
      document.layers,
      document.canvas.width,
      document.canvas.height,
      pushHistory,
      syncPixelLayerFromCanvas,
      canvasRef
    ]
  );

  // ─── Arrow key nudge for active layer ───────────────────────────
  const handleNudgeLayer = useCallback(
    (
      dx: number,
      dy: number,
      options?: { recordHistory?: boolean; syncOutputs?: boolean }
    ) => {
      const recordHistory = options?.recordHistory !== false;
      const syncOutputs = options?.syncOutputs !== false;
      const activeLayerId = document.activeLayerId;
      const layer = document.layers.find((l) => l.id === activeLayerId);
      const blockedByLock =
        layer?.locked && !layerAllowsTransformWhilePixelLocked(layer);
      if (!activeLayerId || !canvasRef.current || !layer || blockedByLock) {
        return;
      }
      if (recordHistory) {
        pushTransformHistory("nudge layer");
      }
      offsetLayerTransform(activeLayerId, dx, dy);
      if (!canvasRef.current) {
        return;
      }
      if (syncOutputs) {
        syncSketchOutputsNow();
      }
    },
    [
      document.activeLayerId,
      document.layers,
      pushTransformHistory,
      offsetLayerTransform,
      syncSketchOutputsNow,
      canvasRef
    ]
  );

  // ─── Export PNG download ───────────────────────────────────────────
  const handleExportPng = useCallback(() => {
    if (!canvasRef.current) {
      return;
    }
    const dataUrl = canvasRef.current.flattenToDataUrl();
    if (!dataUrl) {
      return;
    }
    const link = window.document.createElement("a");
    link.download = "image-editor-export.png";
    link.href = dataUrl;
    link.click();
  }, [canvasRef]);

  const handleTrimLayerToBounds = useCallback(() => {
    const activeLayerId = document.activeLayerId;
    const layer = document.layers.find((entry) => entry.id === activeLayerId);
    if (!activeLayerId || !canvasRef.current || !layer || layer.locked) {
      return;
    }

    pushHistory("trim layer");
    const trimmed = canvasRef.current.trimLayerToBounds(activeLayerId);
    if (!trimmed) {
      return;
    }

    commitPixelLayerChange(activeLayerId, trimmed.data, trimmed.bounds);

    syncSketchOutputsNow();
  }, [
    document.activeLayerId,
    document.layers,
    pushHistory,
    commitPixelLayerChange,
    syncSketchOutputsNow,
    canvasRef
  ]);

  // ─── Canvas resize ─────────────────────────────────────────────
  const handleCanvasResize = useCallback(
    (width: number, height: number) => {
      pushHistory("resize canvas");
      resizeCanvas(width, height);
    },
    [pushHistory, resizeCanvas]
  );

  // ─── Zoom handlers ─────────────────────────────────────────────────
  const handleZoomIn = useCallback(() => setZoom(zoom * 1.3), [zoom, setZoom]);
  const handleZoomOut = useCallback(() => setZoom(zoom / 1.3), [zoom, setZoom]);
  const handleZoomReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [setZoom, setPan]);

  // ─── Crop completion ───────────────────────────────────────────
  const handleCropComplete = useCallback(
    (x: number, y: number, width: number, height: number) => {
      if (!canvasRef.current) {
        return;
      }
      pushHistory("crop");
      for (const layer of document.layers) {
        // Crop is an explicit destructive bake flow: transforms must be reconciled
        // into document-space pixels before cropping the backing rasters.
        bakeLayerTransformIntoDocumentSpace(layer.id);
      }
      canvasRef.current.cropCanvas(x, y, width, height);
      const state = useSketchStore.getState();
      const nextDocument = {
        ...state.document,
        canvas: {
          ...state.document.canvas,
          width,
          height
        },
        layers: state.document.layers.map((layer) => ({
          ...layer,
          transform: { x: 0, y: 0 },
          contentBounds: {
            x: 0,
            y: 0,
            width,
            height
          }
        })),
        metadata: {
          ...state.document.metadata,
          updatedAt: new Date().toISOString()
        }
      };
      setDocument(nextDocument);
      for (const layer of nextDocument.layers) {
        const data = canvasRef.current.getLayerData(layer.id);
        updateLayerData(layer.id, data);
      }
    },
    [
      pushHistory,
      setDocument,
      updateLayerData,
      canvasRef,
      document.layers,
      bakeLayerTransformIntoDocumentSpace
    ]
  );

  // ─── Context menu ──────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((x: number, y: number) => {
    setContextMenu({ x, y });
  }, []);

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  // ─── Clipboard (cut / copy / paste) ─────────────────────────────
  const clipboardCanvasRef = useRef<HTMLCanvasElement | null>(null);

  /** Copy the selected region (or full layer) to the internal clipboard. */
  const handleCopy = useCallback(() => {
    if (!canvasRef.current) {
      return;
    }
    const layerId = document.activeLayerId;
    if (!layerId) {
      return;
    }
    const snapshot = canvasRef.current.snapshotLayerCanvas(layerId);
    if (!snapshot) {
      return;
    }

    const sel = useSketchStore.getState().selection;
    const tmp = window.document.createElement("canvas");

    if (sel && sel.width > 0 && sel.height > 0) {
      tmp.width = sel.width;
      tmp.height = sel.height;
      const ctx = tmp.getContext("2d");
      if (ctx) {
        ctx.drawImage(
          snapshot,
          sel.x,
          sel.y,
          sel.width,
          sel.height,
          0,
          0,
          sel.width,
          sel.height
        );
      }
    } else {
      tmp.width = snapshot.width;
      tmp.height = snapshot.height;
      const ctx = tmp.getContext("2d");
      if (ctx) {
        ctx.drawImage(snapshot, 0, 0);
      }
    }

    clipboardCanvasRef.current = tmp;

    // Also write to system clipboard for interop
    try {
      tmp.toBlob((blob) => {
        if (blob) {
          const item = new ClipboardItem({ "image/png": blob });
          navigator.clipboard.write([item]).catch(() => {
            // System clipboard write may fail (permissions); internal copy still works.
          });
        }
      }, "image/png");
    } catch {
      // toBlob / ClipboardItem may not be available in all environments
    }
  }, [canvasRef, document.activeLayerId]);

  /** Cut = copy + clear selection region. */
  const handleCut = useCallback(() => {
    handleCopy();
    handleClearLayer();
  }, [handleCopy, handleClearLayer]);

  /** Paste from internal clipboard or system clipboard. */
  const handlePaste = useCallback(async () => {
    if (!canvasRef.current) {
      return;
    }
    const layerId = document.activeLayerId;
    if (!layerId) {
      return;
    }

    let imageToPaste: HTMLCanvasElement | null = null;

    // Try system clipboard first (for images copied from outside apps)
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const bitmap = await createImageBitmap(blob);
          const tmp = window.document.createElement("canvas");
          tmp.width = bitmap.width;
          tmp.height = bitmap.height;
          const ctx = tmp.getContext("2d");
          if (ctx) {
            ctx.drawImage(bitmap, 0, 0);
          }
          bitmap.close();
          imageToPaste = tmp;
          break;
        }
      }
    } catch {
      // System clipboard read may fail; fall back to internal clipboard.
    }

    if (!imageToPaste) {
      imageToPaste = clipboardCanvasRef.current;
    }
    if (!imageToPaste) {
      return;
    }

    pushHistory("paste");

    const pasteSnapshot = canvasRef.current.snapshotLayerCanvas(layerId);
    if (!pasteSnapshot) {
      return;
    }
    const ctx = pasteSnapshot.getContext("2d");
    if (!ctx) {
      return;
    }

    const sel = useSketchStore.getState().selection;
    if (sel && sel.width > 0 && sel.height > 0) {
      // Paste into selection region
      ctx.drawImage(imageToPaste, 0, 0, imageToPaste.width, imageToPaste.height, sel.x, sel.y, sel.width, sel.height);
    } else {
      // Paste at origin
      ctx.drawImage(imageToPaste, 0, 0);
    }

    canvasRef.current.restoreLayerCanvas(layerId, pasteSnapshot);
    syncPixelLayerFromCanvas(layerId);
    canvasRef.current.redrawDisplay();
  }, [canvasRef, document.activeLayerId, pushHistory, syncPixelLayerFromCanvas]);

  // ─── Adjustment preview (auto-apply with snapshot) ──────────────
  const adjustmentBaseRef = useRef<HTMLCanvasElement | null>(null);
  const [adjBrightness, setAdjBrightness] = useState(0);
  const [adjContrast, setAdjContrast] = useState(0);
  const [adjSaturation, setAdjSaturation] = useState(0);
  const adjustDebounceRef = useRef<number | null>(null);

  const handleAdjustmentPreview = useCallback(
    (brightness: number, contrast: number, saturation: number) => {
      if (!canvasRef.current) {
        return;
      }
      const layerId = document.activeLayerId;
      if (!layerId) {
        return;
      }
      const allZero = brightness === 0 && contrast === 0 && saturation === 0;
      if (allZero) {
        // Restore original pixels when sliders return to zero (preview-only, no history)
        if (adjustmentBaseRef.current !== null) {
          canvasRef.current.restoreLayerCanvas(layerId, adjustmentBaseRef.current);
          syncPixelLayerFromCanvas(layerId);
        }
        return;
      }
      // Take a snapshot before the first non-zero preview of this session
      if (adjustmentBaseRef.current === null) {
        adjustmentBaseRef.current = canvasRef.current.snapshotLayerCanvas(layerId);
      }
      if (adjustmentBaseRef.current) {
        canvasRef.current.restoreLayerCanvas(layerId, adjustmentBaseRef.current);
      }
      canvasRef.current.applyAdjustments(brightness, contrast, saturation);
      syncPixelLayerFromCanvas(layerId);
    },
    [
      document.activeLayerId,
      syncPixelLayerFromCanvas,
      canvasRef
    ]
  );

  /** Commit the current adjustment preview — exactly one undo step. */
  const handleApplyAdjustments = useCallback(() => {
    if (adjustmentBaseRef.current !== null) {
      pushHistory("adjustments");
    }
    adjustmentBaseRef.current = null;
    setAdjBrightness(0);
    setAdjContrast(0);
    setAdjSaturation(0);
  }, [pushHistory]);

  /** Cancel adjustment preview — restore the original pixels, no undo step. */
  const handleCancelAdjustments = useCallback(() => {
    if (!canvasRef.current) {
      return;
    }
    const layerId = document.activeLayerId;
    if (!layerId) {
      return;
    }
    if (adjustmentBaseRef.current !== null) {
      canvasRef.current.restoreLayerCanvas(layerId, adjustmentBaseRef.current);
      syncPixelLayerFromCanvas(layerId);
      adjustmentBaseRef.current = null;
    }
    setAdjBrightness(0);
    setAdjContrast(0);
    setAdjSaturation(0);
  }, [document.activeLayerId, syncPixelLayerFromCanvas, canvasRef]);

  // Auto-apply adjustments with 100ms debounce
  useEffect(() => {
    if (adjustDebounceRef.current !== null) {
      clearTimeout(adjustDebounceRef.current);
    }
    adjustDebounceRef.current = window.setTimeout(() => {
      handleAdjustmentPreview(adjBrightness, adjContrast, adjSaturation);
      adjustDebounceRef.current = null;
    }, 100);
    return () => {
      if (adjustDebounceRef.current !== null) {
        clearTimeout(adjustDebounceRef.current);
      }
    };
  }, [adjBrightness, adjContrast, adjSaturation, handleAdjustmentPreview]);

  return {
    handleStrokeStart,
    handleStrokeEnd,
    flushPendingCanvasSync,
    syncSketchOutputsNow,
    flushLayerThumbnailsWhenIdle,
    handleClearLayer,
    handleFillLayerWithColor,
    handleCommitLayerTransform,
    handleNudgeLayer,
    handleTrimLayerToBounds,
    handleExportPng,
    handleCanvasResize,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleCropComplete,
    contextMenu,
    handleContextMenu,
    handleContextMenuClose,
    handleCopy,
    handleCut,
    handlePaste,
    adjBrightness,
    adjContrast,
    adjSaturation,
    setAdjBrightness,
    setAdjContrast,
    setAdjSaturation,
    handleApplyAdjustments,
    handleCancelAdjustments
  };
}
