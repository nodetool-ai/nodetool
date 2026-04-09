/**
 * useTransformPreviewComposite
 *
 * Builds the `compositeToDisplay` callback that applies transform previews
 * and composites all visible layers onto the display canvas.
 *
 * Preview transforms are applied via the shared `applyTransformPreviews`
 * contract from `painting/transformPreview`. This ensures that preview
 * rendering uses the same full-transform merge rules as commit paths —
 * a layer with existing scale/rotation is never downgraded to
 * translation-only during preview compositing.
 */

import { useCallback } from "react";
import type { SketchDocument, LayerTransform } from "../types";
import type { SketchRuntime, DirtyRect, ActiveStrokeInfo } from "../rendering";
import { applyTransformPreviews } from "../painting/transformPreview";

export interface UseTransformPreviewCompositeParams {
  doc: SketchDocument;
  transformPreviewByLayerIdRef?: React.MutableRefObject<Record<string, LayerTransform>>;
  runtimeRef: React.MutableRefObject<SketchRuntime | null>;
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  bootstrapDisplayRef: React.RefObject<HTMLCanvasElement | null>;
  bootstrapPhaseActive: boolean;
  isolatedLayerId?: string | null;
  activeStrokeRef: React.MutableRefObject<ActiveStrokeInfo | null>;
  backend: "webgpu" | "canvas2d";
}

export interface UseTransformPreviewCompositeResult {
  compositeToDisplay: (dirtyRect?: DirtyRect | null) => void;
}

export function useTransformPreviewComposite({
  doc,
  transformPreviewByLayerIdRef,
  runtimeRef,
  displayCanvasRef,
  bootstrapDisplayRef,
  bootstrapPhaseActive,
  isolatedLayerId,
  activeStrokeRef,
  backend
}: UseTransformPreviewCompositeParams): UseTransformPreviewCompositeResult {
  /** Composite layers into display canvas, optionally clipped to a dirty rect. */
  const compositeToDisplay = useCallback(
    (dirtyRect?: DirtyRect | null) => {
      const displayCanvas = displayCanvasRef.current;
      const bootstrapCanvas = bootstrapDisplayRef.current;
      let targetCanvas: HTMLCanvasElement | null;
      if (bootstrapPhaseActive) {
        // Never acquire "2d" on the real display canvas during bootstrap — that
        // would prevent WebGPU from using it later.
        if (!bootstrapCanvas) {
          return;
        }
        targetCanvas = bootstrapCanvas;
      } else {
        targetCanvas = displayCanvas;
      }
      if (!targetCanvas) {
        return;
      }
      // Always read the runtime from the ref so that stale closures still end
      // up calling the current runtime instead of the old Canvas2DRuntime.
      const rt = runtimeRef.current;
      if (!rt) {
        return;
      }
      const previewByLayerId = transformPreviewByLayerIdRef?.current ?? {};
      const compositeDoc = applyTransformPreviews(doc, previewByLayerId) ?? doc;
      const activeStroke = activeStrokeRef.current;
      rt.compositeToDisplay(
        targetCanvas,
        compositeDoc,
        isolatedLayerId ?? null,
        activeStroke,
        dirtyRect
      );
    },
    // Include `backend` so that this callback is recreated when the backend
    // switches to WebGPU, which causes trigger effects to fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      doc,
      isolatedLayerId,
      activeStrokeRef,
      backend,
      bootstrapPhaseActive,
      transformPreviewByLayerIdRef
    ]
  );

  return { compositeToDisplay };
}
