/**
 * useCanvasGeometryActions
 *
 * Canvas resize, zoom, crop, clear, fill, clipboard, adjustments,
 * context menu, drop image, and trim operations.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Asset } from "../../../stores/ApiTypes";
import type { SketchCanvasRef } from "../SketchCanvas";
import {
  createDefaultLayer,
  IDENTITY_AFFINE,
  isAffineTransform,
  type LayerContentBounds,
  type LayerTransform,
  type Point,
  type PushHistoryOptions,
  type SketchDocument
} from "../types";
import { useSketchStore } from "../state";
import {
  getCanvasRasterBounds,
  getLayerGeometry
} from "../transform/geometry/layerGeometry";
import { getSelectionBounds, selectionHasAnyPixels } from "../selection";
import { computeFitZoom } from "../sketchCanvasPresentation.helpers";
import {
  buildSketchInternalClipboardCanvas,
  drawSketchPasteOnLayerContext,
  resolveSketchPasteImageCanvas,
  writeImageCanvasToSystemClipboardPng
} from "../sketchClipboard";
import { resolveAssetUri } from "../../node/output/hooks";

// ── Module-level helpers ────────────────────────────────────────────

function getNonTransparentCanvasBounds(
  canvas: HTMLCanvasElement
): LayerContentBounds | null {
  if (canvas.width === 0 || canvas.height === 0) {
    return null;
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return null;
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvas.height; y += 1) {
    const rowOffset = y * canvas.width * 4;
    for (let x = 0; x < canvas.width; x += 1) {
      if (imageData[rowOffset + x * 4 + 3] === 0) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  const rasterBounds = getCanvasRasterBounds(canvas) ?? {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height
  };

  return {
    x: rasterBounds.x + minX,
    y: rasterBounds.y + minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

function drawLayerSnapshotWithTransform(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  compositeOffset: Point,
  transform: LayerTransform
): void {
  const scaleX = isAffineTransform(transform) ? transform.scaleX : 1;
  const scaleY = isAffineTransform(transform) ? transform.scaleY : 1;
  const rotation = isAffineTransform(transform) ? transform.rotation : 0;

  if (scaleX !== 1 || scaleY !== 1 || rotation !== 0) {
    const centerX = compositeOffset.x + source.width / 2;
    const centerY = compositeOffset.y + source.height / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate(rotation);
    ctx.scale(scaleX, scaleY);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);
    return;
  }

  ctx.drawImage(source, compositeOffset.x, compositeOffset.y);
}

function getTransformedLayerExtents(
  source: HTMLCanvasElement,
  compositeOffset: Point,
  transform: LayerTransform
): LayerContentBounds {
  const scaleX = isAffineTransform(transform) ? transform.scaleX : 1;
  const scaleY = isAffineTransform(transform) ? transform.scaleY : 1;
  const rotation = isAffineTransform(transform) ? transform.rotation : 0;
  const centerX = compositeOffset.x + source.width / 2;
  const centerY = compositeOffset.y + source.height / 2;

  const corners = [
    { x: compositeOffset.x, y: compositeOffset.y },
    { x: compositeOffset.x + source.width, y: compositeOffset.y },
    {
      x: compositeOffset.x + source.width,
      y: compositeOffset.y + source.height
    },
    { x: compositeOffset.x, y: compositeOffset.y + source.height }
  ];

  const transformedCorners = corners.map((corner) => {
    const localX = (corner.x - centerX) * scaleX;
    const localY = (corner.y - centerY) * scaleY;
    const rotatedX = localX * Math.cos(rotation) - localY * Math.sin(rotation);
    const rotatedY = localX * Math.sin(rotation) + localY * Math.cos(rotation);
    return {
      x: centerX + rotatedX,
      y: centerY + rotatedY
    };
  });

  const minX = Math.min(...transformedCorners.map((corner) => corner.x));
  const minY = Math.min(...transformedCorners.map((corner) => corner.y));
  const maxX = Math.max(...transformedCorners.map((corner) => corner.x));
  const maxY = Math.max(...transformedCorners.map((corner) => corner.y));

  return {
    x: Math.floor(minX),
    y: Math.floor(minY),
    width: Math.max(1, Math.ceil(maxX) - Math.floor(minX)),
    height: Math.max(1, Math.ceil(maxY) - Math.floor(minY))
  };
}

// ── Hook ─────────────────────────────────────────────────────────────

export interface UseCanvasGeometryActionsParams {
  canvasRef: RefObject<SketchCanvasRef | null>;
  document: SketchDocument;
  pushHistory: (
    label: string,
    layerCanvasSnapshots?: Record<string, HTMLCanvasElement | null>,
    options?: PushHistoryOptions
  ) => void;
  updateLayerData: (layerId: string, data: string | null) => void;
  setDocument: (doc: SketchDocument) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: Point) => void;
  resizeCanvas: (width: number, height: number) => void;
  offsetAllPaintLayersTransform: (dx: number, dy: number) => void;
  commitPixelLayerChange: (
    layerId: string,
    data: string | null,
    bounds?: LayerContentBounds
  ) => void;
  syncPixelLayerFromCanvas: (
    layerId: string,
    bounds?: LayerContentBounds
  ) => string | null;
  reconcileAllLayerTransforms: () => void;
  syncSketchOutputsNow: () => void;
}

interface HandlePasteOptions {
  targetLayerId?: string;
  pasteAnchorDocument?: Point | null;
}

export function useCanvasGeometryActions({
  canvasRef,
  document,
  pushHistory,
  updateLayerData,
  setDocument,
  setZoom,
  setPan,
  resizeCanvas,
  offsetAllPaintLayersTransform,
  commitPixelLayerChange,
  syncPixelLayerFromCanvas,
  reconcileAllLayerTransforms,
  syncSketchOutputsNow
}: UseCanvasGeometryActionsParams) {
  // ─── Canvas crop finalization ──────────────────────────────────
  const finalizeCanvasCrop = useCallback(
    (x: number, y: number, width: number, height: number) => {
      if (!canvasRef.current) {
        return;
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
          transform: { ...IDENTITY_AFFINE },
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
      useSketchStore.setState((state) => ({
        ...state,
        document: nextDocument
      }));
      for (const layer of nextDocument.layers) {
        const data = canvasRef.current.getLayerData(layer.id);
        updateLayerData(layer.id, data);
      }
    },
    [updateLayerData, canvasRef]
  );

  // ─── Clear active layer (or selection area) ────────────────────
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
    if (sel && selectionHasAnyPixels(sel)) {
      pushHistory("clear selection");
      const layerCanvas = canvasRef.current.getLayerCanvas(activeLayerId);
      const offset = getLayerGeometry(layer, layerCanvas, {
        width: Math.max(
          1,
          layer.contentBounds?.width ?? document.canvas.width
        ),
        height: Math.max(
          1,
          layer.contentBounds?.height ?? document.canvas.height
        )
      }).compositeOffset;
      canvasRef.current.clearLayerBySelectionMask(
        activeLayerId,
        offset.x,
        offset.y,
        sel
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

  // ─── Fill layer with color (respects selection) ────────────────
  const handleFillLayerWithColor = useCallback(
    (color: string) => {
      const activeLayerId = document.activeLayerId;
      const layer = document.layers.find((l) => l.id === activeLayerId);
      if (!activeLayerId || !canvasRef.current || !layer || layer.locked) {
        return;
      }
      const sel = useSketchStore.getState().selection;
      if (sel && selectionHasAnyPixels(sel)) {
        pushHistory("fill selection");
        const layerCanvas = canvasRef.current.getLayerCanvas(activeLayerId);
        const offset = getLayerGeometry(layer, layerCanvas, {
          width: Math.max(
            1,
            layer.contentBounds?.width ?? document.canvas.width
          ),
          height: Math.max(
            1,
            layer.contentBounds?.height ?? document.canvas.height
          )
        }).compositeOffset;
        canvasRef.current.fillLayerBySelectionMask(
          activeLayerId,
          offset.x,
          offset.y,
          sel,
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

  // ─── Trim layer to bounds ──────────────────────────────────────
  const handleTrimLayerToBounds = useCallback(() => {
    const activeLayerId = document.activeLayerId;
    const layer = document.layers.find((entry) => entry.id === activeLayerId);
    if (
      !activeLayerId ||
      !canvasRef.current ||
      !layer ||
      layer.locked ||
      layer.type === "group" ||
      layer.type === "mask"
    ) {
      return;
    }

    pushHistory("trim layer");
    const trimmed = canvasRef.current.trimLayerToBounds(activeLayerId);
    if (!trimmed) {
      return;
    }

    commitPixelLayerChange(activeLayerId, trimmed.data, trimmed.bounds);
    canvasRef.current.setLayerData(
      activeLayerId,
      trimmed.data,
      trimmed.bounds
    );

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
  const nudgePanForCanvasPixelDelta = useCallback(
    (dW: number, dH: number) => {
      if (dW === 0 && dH === 0) {
        return;
      }
      const { pan: p, zoom } = useSketchStore.getState();
      setPan({
        x: p.x + (dW / 2) * zoom,
        y: p.y + (dH / 2) * zoom
      });
    },
    [setPan]
  );

  const handleCanvasResize = useCallback(
    (width: number, height: number) => {
      const { document: doc } = useSketchStore.getState();
      const dW = width - doc.canvas.width;
      const dH = height - doc.canvas.height;
      resizeCanvas(width, height);
      nudgePanForCanvasPixelDelta(dW, dH);
      pushHistory("resize canvas");
    },
    [pushHistory, resizeCanvas, nudgePanForCanvasPixelDelta]
  );

  /** Push a single history snapshot before a drag-resize begins. */
  const handleCanvasResizeStart = useCallback(() => {
    pushHistory("resize canvas");
  }, [pushHistory]);

  /** Apply new canvas dimensions during a drag-resize (no history push). */
  const handleCanvasResizeDrag = useCallback(
    (
      width: number,
      height: number,
      options?: { translateLayers?: Point; resizeFromCenter?: boolean }
    ) => {
      const { document: doc } = useSketchStore.getState();
      const dW = width - doc.canvas.width;
      const dH = height - doc.canvas.height;
      if (dW === 0 && dH === 0) {
        return;
      }
      resizeCanvas(width, height);
      const t = options?.translateLayers;
      if (t && (t.x !== 0 || t.y !== 0)) {
        offsetAllPaintLayersTransform(t.x, t.y);
      }
      const hasLayerTranslate = t != null && (t.x !== 0 || t.y !== 0);
      if (!options?.resizeFromCenter && !hasLayerTranslate) {
        nudgePanForCanvasPixelDelta(dW, dH);
      }
    },
    [resizeCanvas, offsetAllPaintLayersTransform, nudgePanForCanvasPixelDelta]
  );

  // ─── Zoom handlers ─────────────────────────────────────────────
  const handleZoomIn = useCallback(() => {
    const { zoom } = useSketchStore.getState();
    setZoom(zoom * 1.3);
  }, [setZoom]);
  const handleZoomOut = useCallback(
    () => {
      const { zoom } = useSketchStore.getState();
      setZoom(zoom / 1.3);
    },
    [setZoom]
  );
  /**
   * Fit the whole artboard into the viewport and re-center it. Falls back to
   * 100% when the viewport size is not yet known. `setZoom` clamps the result
   * to the sketch zoom range.
   */
  const handleZoomFit = useCallback(() => {
    const viewport = canvasRef.current?.getViewportSize() ?? null;
    const { document: doc } = useSketchStore.getState();
    const fit = viewport
      ? computeFitZoom(
          viewport.width,
          viewport.height,
          doc.canvas.width,
          doc.canvas.height
        )
      : 1;
    setZoom(fit);
    setPan({ x: 0, y: 0 });
  }, [canvasRef, setZoom, setPan]);

  // ─── Crop completion ───────────────────────────────────────────
  const handleCropComplete = useCallback(
    (x: number, y: number, width: number, height: number) => {
      if (!canvasRef.current) {
        return;
      }
      reconcileAllLayerTransforms();
      finalizeCanvasCrop(x, y, width, height);
      pushHistory("crop");
    },
    [pushHistory, canvasRef, reconcileAllLayerTransforms, finalizeCanvasCrop]
  );

  const handleCropCanvasToActiveLayerVisiblePixels = useCallback(() => {
    const activeLayerId = document.activeLayerId;
    const activeLayer = document.layers.find(
      (layer) => layer.id === activeLayerId
    );
    if (
      !activeLayerId ||
      !canvasRef.current ||
      !activeLayer ||
      activeLayer.type === "group" ||
      activeLayer.type === "mask"
    ) {
      return;
    }

    const source = canvasRef.current.snapshotLayerCanvas(activeLayerId);
    if (!source) {
      return;
    }

    const probe = window.document.createElement("canvas");
    probe.width = document.canvas.width;
    probe.height = document.canvas.height;
    const probeCtx = probe.getContext("2d");
    if (!probeCtx) {
      return;
    }

    const compositeOffset = getLayerGeometry(activeLayer, source, { width: source.width, height: source.height }).compositeOffset;
    drawLayerSnapshotWithTransform(
      probeCtx,
      source,
      compositeOffset,
      activeLayer.transform
    );

    const cropBounds = getNonTransparentCanvasBounds(probe);
    if (!cropBounds) {
      return;
    }

    reconcileAllLayerTransforms();
    finalizeCanvasCrop(
      cropBounds.x,
      cropBounds.y,
      cropBounds.width,
      cropBounds.height
    );
    pushHistory("crop to active layer visible pixels");
  }, [
    document.activeLayerId,
    document.layers,
    document.canvas.width,
    document.canvas.height,
    canvasRef,
    pushHistory,
    reconcileAllLayerTransforms,
    finalizeCanvasCrop
  ]);

  const handleCropCanvasToActiveLayerExtents = useCallback(() => {
    const activeLayerId = document.activeLayerId;
    const activeLayer = document.layers.find(
      (layer) => layer.id === activeLayerId
    );
    if (
      !activeLayerId ||
      !canvasRef.current ||
      !activeLayer ||
      activeLayer.type === "group" ||
      activeLayer.type === "mask"
    ) {
      return;
    }

    const source = canvasRef.current.snapshotLayerCanvas(activeLayerId);
    if (!source) {
      return;
    }

    const compositeOffset = getLayerGeometry(activeLayer, source, { width: source.width, height: source.height }).compositeOffset;
    const cropBounds = getTransformedLayerExtents(
      source,
      compositeOffset,
      activeLayer.transform
    );

    reconcileAllLayerTransforms();
    finalizeCanvasCrop(
      cropBounds.x,
      cropBounds.y,
      cropBounds.width,
      cropBounds.height
    );
    pushHistory("crop to active layer extents");
  }, [
    document.activeLayerId,
    document.layers,
    canvasRef,
    pushHistory,
    reconcileAllLayerTransforms,
    finalizeCanvasCrop
  ]);

  const handleCropCanvasToSelection = useCallback(() => {
    const store = useSketchStore.getState();
    const sel = store.selection;
    if (!sel) return;
    const bounds = getSelectionBounds(sel);
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

    // Clamp the selection bbox to the current canvas: a selection mask
    // can extend outside the document (e.g. after nudging the mask off
    // the canvas, or when the mask grid was bigger than the doc to
    // begin with). Cropping to the raw bbox then produces a canvas that
    // overshoots the visible area on one or more sides, leaving an
    // empty strip and making the crop look imprecise. Intersect with
    // [0, 0, docW, docH] before passing to finalizeCanvasCrop.
    const { width: docW, height: docH } = store.document.canvas;
    const minX = Math.max(0, bounds.x);
    const minY = Math.max(0, bounds.y);
    const maxX = Math.min(docW, bounds.x + bounds.width);
    const maxY = Math.min(docH, bounds.y + bounds.height);
    const cropW = maxX - minX;
    const cropH = maxY - minY;
    if (cropW <= 0 || cropH <= 0) {
      // Selection lies entirely outside the canvas — nothing meaningful
      // to crop to. Clear the selection but skip the crop so the user
      // doesn't end up with a zero-sized document.
      store.setSelection(null);
      return;
    }

    reconcileAllLayerTransforms();
    finalizeCanvasCrop(minX, minY, cropW, cropH);
    // Drop the selection: after the canvas is cropped to the bbox, the
    // selection's document-space origin no longer points anywhere
    // meaningful (it referred to the pre-crop document) and showing it
    // at the wrong place is more confusing than just clearing it.
    useSketchStore.getState().setSelection(null);
    pushHistory("crop to selection");
  }, [reconcileAllLayerTransforms, finalizeCanvasCrop, pushHistory]);

  // ─── Context menu ──────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const handleContextMenu = useCallback((x: number, y: number) => {
    setContextMenu({ x, y });
  }, []);

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  // ─── Transform context menu (right-click inside bounding box) ──
  const [transformContextMenu, setTransformContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const handleTransformContextMenu = useCallback((x: number, y: number) => {
    setTransformContextMenu({ x, y });
  }, []);

  const handleTransformContextMenuClose = useCallback(() => {
    setTransformContextMenu(null);
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
    const layer = document.layers.find((l) => l.id === layerId);
    if (!layer) {
      return;
    }
    const snapshot = canvasRef.current.snapshotLayerCanvas(layerId);
    if (!snapshot) {
      return;
    }

    const sel = useSketchStore.getState().selection;
    const tmp = buildSketchInternalClipboardCanvas({
      snapshot,
      layer,
      documentCanvasWidth: document.canvas.width,
      documentCanvasHeight: document.canvas.height,
      selection: sel
    });
    if (!tmp) {
      return;
    }

    clipboardCanvasRef.current = tmp;
    writeImageCanvasToSystemClipboardPng(tmp);
  }, [
    canvasRef,
    document.activeLayerId,
    document.layers,
    document.canvas.width,
    document.canvas.height
  ]);

  /** Cut = copy + clear selection region. */
  const handleCut = useCallback(() => {
    handleCopy();
    handleClearLayer();
  }, [handleCopy, handleClearLayer]);

  /**
   * Paste from the OS clipboard and/or the in-app pixel buffer.
   * @param preferInternalClipboardFirst — When true (Ctrl+Shift+V), use the in-app buffer first
   *   so masked in-sketch copies keep correct alpha; default Ctrl+V prefers other apps' clipboard.
   */
  const handlePaste = useCallback(
    async (
      preferInternalClipboardFirst = false,
      options?: HandlePasteOptions
    ) => {
      if (!canvasRef.current) {
        return;
      }
      // Read the live store rather than the closure document so that
      // callers like `handleLayerViaCopy` — which add a new layer and
      // immediately paste into it inside the same tick — can target the
      // freshly-added layer. The React closure still holds the
      // pre-add document and would otherwise miss the new layer.
      const liveDoc = useSketchStore.getState().document;
      const layerId = options?.targetLayerId ?? liveDoc.activeLayerId;
      if (!layerId) {
        return;
      }

      const imageToPaste = await resolveSketchPasteImageCanvas({
        internalBuffer: clipboardCanvasRef.current,
        preferInternalClipboardFirst
      });
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

      const layer = liveDoc.layers.find((l) => l.id === layerId);
      if (!layer) {
        return;
      }
      const offset = getLayerGeometry(
        layer,
        pasteSnapshot,
        {
          width: liveDoc.canvas.width,
          height: liveDoc.canvas.height
        }
      ).compositeOffset;

      const pasteDoc =
        options && "pasteAnchorDocument" in options
          ? options.pasteAnchorDocument ?? null
          : canvasRef.current.getPasteAnchorDocumentPoint();
      const sel = useSketchStore.getState().selection;
      const bounds = sel ? getSelectionBounds(sel) : null;

      drawSketchPasteOnLayerContext(ctx, imageToPaste, {
        offset,
        pasteAnchorDocument: pasteDoc,
        selectionBounds: bounds
      });

      canvasRef.current.restoreLayerCanvas(layerId, pasteSnapshot);
      syncPixelLayerFromCanvas(layerId);
      canvasRef.current.redrawDisplay();
    },
    [
      canvasRef,
      document.activeLayerId,
      document.canvas.height,
      document.canvas.width,
      document.layers,
      pushHistory,
      syncPixelLayerFromCanvas
    ]
  );

  /**
   * Photoshop-style paste: create a NEW layer containing the resolved
   * clipboard image, anchored so the image is centered on the last known
   * pointer position (falling back to the document center). Returns the
   * new layer id (or null when nothing was on the clipboard).
   *
   * Pasting into a fresh, doc-sized layer avoids two pitfalls of the
   * paste-into-active-layer flow: the image isn't clipped by the active
   * layer's content-bounds, and existing pixels can't be visually
   * "lost" by an unexpected composite. The active layer is left
   * untouched; the new layer becomes active.
   */
  const handlePasteAsNewLayer = useCallback(
    async (
      createLayer: () => string | null,
      options?: { preferInternalClipboardFirst?: boolean }
    ): Promise<string | null> => {
      if (!canvasRef.current) {
        return null;
      }
      const imageToPaste = await resolveSketchPasteImageCanvas({
        internalBuffer: clipboardCanvasRef.current,
        preferInternalClipboardFirst:
          options?.preferInternalClipboardFirst ?? false
      });
      if (!imageToPaste) {
        return null;
      }

      const newLayerId = createLayer();
      if (!newLayerId) {
        return null;
      }
      // Materialize a doc-sized canvas in the runtime so snapshot/restore
      // operate on a real buffer. Without this, `snapshotLayerCanvas`
      // returns null on the freshly-added layer (reconciliation hasn't
      // run yet) and the paste silently bails.
      canvasRef.current.setLayerData(newLayerId, null);

      pushHistory("paste");

      const snapshot = canvasRef.current.snapshotLayerCanvas(newLayerId);
      if (!snapshot) {
        return newLayerId;
      }
      const ctx = snapshot.getContext("2d");
      if (!ctx) {
        return newLayerId;
      }

      const liveDoc = useSketchStore.getState().document;
      const docWidth = liveDoc.canvas.width;
      const docHeight = liveDoc.canvas.height;
      const anchor =
        canvasRef.current.getPasteAnchorDocumentPoint() ?? {
          x: Math.round(docWidth / 2),
          y: Math.round(docHeight / 2)
        };
      const destX = Math.round(anchor.x - imageToPaste.width / 2);
      const destY = Math.round(anchor.y - imageToPaste.height / 2);
      ctx.drawImage(imageToPaste, destX, destY);

      canvasRef.current.restoreLayerCanvas(newLayerId, snapshot);
      syncPixelLayerFromCanvas(newLayerId);
      canvasRef.current.redrawDisplay();
      return newLayerId;
    },
    [canvasRef, pushHistory, syncPixelLayerFromCanvas]
  );

  /** Import a dropped or externally-provided image file into the active layer. */
  const handleDropImage = useCallback(
    async (file: File) => {
      if (!canvasRef.current) {
        return;
      }
      const layerId = document.activeLayerId;
      if (!layerId) {
        return;
      }
      if (!file.type.startsWith("image/")) {
        return;
      }

      const bitmap = await createImageBitmap(file);
      const tmp = window.document.createElement("canvas");
      tmp.width = bitmap.width;
      tmp.height = bitmap.height;
      const tmpCtx = tmp.getContext("2d");
      if (tmpCtx) {
        tmpCtx.drawImage(bitmap, 0, 0);
      }
      bitmap.close();

      pushHistory("drop image");

      const snapshot = canvasRef.current.snapshotLayerCanvas(layerId);
      if (!snapshot) {
        return;
      }
      const ctx = snapshot.getContext("2d");
      if (!ctx) {
        return;
      }

      ctx.drawImage(tmp, 0, 0);

      canvasRef.current.restoreLayerCanvas(layerId, snapshot);
      syncPixelLayerFromCanvas(layerId);
      canvasRef.current.redrawDisplay();
    },
    [canvasRef, document.activeLayerId, pushHistory, syncPixelLayerFromCanvas]
  );

  const handleDropAsset = useCallback(
    async (asset: Asset) => {
      try {
        const assetUri = `asset://${asset.id}`;
        const sourceUrl = resolveAssetUri(asset.get_url ?? assetUri);
        const response = await fetch(sourceUrl);
        if (!response.ok) {
          throw new Error(`Failed to load dropped asset ${asset.id}`);
        }
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        const nextLayer = createDefaultLayer(
          asset.name || `Imported ${document.layers.length + 1}`,
          "raster",
          bitmap.width,
          bitmap.height
        );
        bitmap.close();
        nextLayer.locked = true;
        nextLayer.exposedAsInput = false;
        nextLayer.exposedAsOutput = false;
        nextLayer.imageReference = {
          uri: assetUri,
          naturalWidth: nextLayer.contentBounds.width,
          naturalHeight: nextLayer.contentBounds.height,
          objectFit: "fill"
        };

        pushHistory("import asset");
        setDocument({
          ...document,
          layers: [...document.layers, nextLayer],
          activeLayerId: nextLayer.id,
          metadata: {
            ...document.metadata,
            updatedAt: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error("Failed to import dropped asset:", error);
      }
    },
    [document, pushHistory, setDocument]
  );

  // ─── Adjustment preview (auto-apply with snapshot) ─────────────
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
      const allZero =
        brightness === 0 && contrast === 0 && saturation === 0;
      if (allZero) {
        if (adjustmentBaseRef.current !== null) {
          canvasRef.current.restoreLayerCanvas(
            layerId,
            adjustmentBaseRef.current
          );
          syncPixelLayerFromCanvas(layerId);
        }
        return;
      }
      if (adjustmentBaseRef.current === null) {
        adjustmentBaseRef.current =
          canvasRef.current.snapshotLayerCanvas(layerId);
      }
      if (adjustmentBaseRef.current) {
        canvasRef.current.restoreLayerCanvas(
          layerId,
          adjustmentBaseRef.current
        );
      }
      canvasRef.current.applyAdjustments(brightness, contrast, saturation);
      syncPixelLayerFromCanvas(layerId);
    },
    [document.activeLayerId, syncPixelLayerFromCanvas, canvasRef]
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
      canvasRef.current.restoreLayerCanvas(
        layerId,
        adjustmentBaseRef.current
      );
      syncPixelLayerFromCanvas(layerId);
      adjustmentBaseRef.current = null;
    }
    setAdjBrightness(0);
    setAdjContrast(0);
    setAdjSaturation(0);
  }, [document.activeLayerId, syncPixelLayerFromCanvas, canvasRef]);

  /** Invert colors of the active layer (respects selection mask). */
  const handleInvertLayerColors = useCallback(() => {
    if (!canvasRef.current) {
      return;
    }
    const layerId = document.activeLayerId;
    if (!layerId) {
      return;
    }
    const sel = useSketchStore.getState().selection;
    const hasSelection = sel && selectionHasAnyPixels(sel);
    pushHistory("invert colors");
    canvasRef.current.invertLayerColors(hasSelection ? sel : null);
    syncPixelLayerFromCanvas(layerId);
    syncSketchOutputsNow();
  }, [document.activeLayerId, pushHistory, syncPixelLayerFromCanvas, syncSketchOutputsNow, canvasRef]);

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
    nudgePanForCanvasPixelDelta,
    handleCanvasResize,
    handleCanvasResizeStart,
    handleCanvasResizeDrag,
    handleZoomIn,
    handleZoomOut,
    handleZoomFit,
    handleCropComplete,
    handleCropCanvasToActiveLayerVisiblePixels,
    handleCropCanvasToActiveLayerExtents,
    handleCropCanvasToSelection,
    finalizeCanvasCrop,
    handleClearLayer,
    handleFillLayerWithColor,
    handleTrimLayerToBounds,
    contextMenu,
    handleContextMenu,
    handleContextMenuClose,
    transformContextMenu,
    handleTransformContextMenu,
    handleTransformContextMenuClose,
    handleCopy,
    handleCut,
    handlePaste,
    handlePasteAsNewLayer,
    handleDropImage,
    handleDropAsset,
    adjBrightness,
    adjContrast,
    adjSaturation,
    setAdjBrightness,
    setAdjContrast,
    setAdjSaturation,
    handleApplyAdjustments,
    handleCancelAdjustments,
    handleInvertLayerColors
  };
}
