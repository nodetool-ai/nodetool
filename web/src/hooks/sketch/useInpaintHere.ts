/** Selection-driven Inpaint Here action — uses provider directly, no workflow. */

import { useCallback, useRef, useState } from "react";

import { useSketchStore } from "../../components/sketch/state/useSketchStore";
import { useSketchSessionStore } from "../../stores/sketch/SketchSessionStore";
import { useSketchCanvasRefStore } from "../../stores/sketch/SketchCanvasRefStore";
import { useAssetStore } from "../../stores/AssetStore";
import { selectionToMaskDataUrl } from "../../lib/sketch/selectionMaskImage";

export type InpaintHereResult =
  | { ok: true; layerId: string }
  | {
      ok: false;
      reason: "no-selection" | "no-document" | "no-canvas" | "error";
      message?: string;
    };

export interface UseInpaintHereResult {
  inpaintHere: (options: {
    prompt: string;
    provider: string;
    model: string;
  }) => Promise<InpaintHereResult>;
  isBusy: boolean;
}

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "image/png" });
}

export function useInpaintHere(): UseInpaintHereResult {
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false);

  const inpaintHere = useCallback(
    async (options: {
      prompt: string;
      provider: string;
      model: string;
    }): Promise<InpaintHereResult> => {
      if (busyRef.current) {
        return { ok: false, reason: "error", message: "Already running" };
      }
      const documentId = useSketchSessionStore.getState().documentId;
      if (!documentId) {
        return { ok: false, reason: "no-document" };
      }

      const sketchState = useSketchStore.getState();
      const selection = sketchState.selection;
      if (!selection || !sketchState.hasActiveSelection) {
        return { ok: false, reason: "no-selection" };
      }

      const flatten = useSketchCanvasRefStore.getState().flattenToDataUrl;
      if (!flatten) {
        return { ok: false, reason: "no-canvas" };
      }

      busyRef.current = true;
      setIsBusy(true);
      try {
        const compositeDataUrl = flatten();
        if (!compositeDataUrl) {
          return { ok: false, reason: "no-canvas" };
        }

        const { width, height } = sketchState.document.canvas;
        const maskDataUrl = selectionToMaskDataUrl(selection, width, height);
        if (!maskDataUrl) {
          return { ok: false, reason: "no-selection" };
        }

        // Upload both the composite image and the mask as assets so the
        // backend provider can fetch them by ID without hitting data-URL size
        // limits over the WebSocket.
        const [sourceFile, maskFile] = await Promise.all([
          dataUrlToFile(compositeDataUrl, "inpaint-source.png"),
          dataUrlToFile(maskDataUrl, "inpaint-mask.png")
        ]);
        const [sourceAsset, maskAsset] = await Promise.all([
          useAssetStore
            .getState()
            .createAsset(sourceFile, undefined, undefined, undefined, "file"),
          useAssetStore
            .getState()
            .createAsset(maskFile, undefined, undefined, undefined, "file")
        ]);

        const newLayerId = useSketchStore
          .getState()
          .addLayer("Inpaint Here", "raster");

        useSketchSessionStore.getState().upsertBinding({
          layerId: newLayerId,
          kind: "inpaint",
          prompt: options.prompt,
          provider: options.provider,
          model: options.model,
          sourceAssetId: sourceAsset.id,
          maskAssetId: maskAsset.id,
          status: "draft",
          versions: []
        });

        return { ok: true, layerId: newLayerId };
      } catch (err) {
        return {
          ok: false,
          reason: "error",
          message: err instanceof Error ? err.message : "Inpaint setup failed"
        };
      } finally {
        busyRef.current = false;
        setIsBusy(false);
      }
    },
    []
  );

  return { inpaintHere, isBusy };
}
