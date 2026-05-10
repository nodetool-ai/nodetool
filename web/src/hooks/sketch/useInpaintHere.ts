/** Selection-driven Inpaint Here action — see PR description. */

import { useCallback, useRef, useState } from "react";

import { LAYER_TEMPLATE_SEED_IDS } from "@nodetool-ai/image-editor";
import { trpcClient } from "../../trpc/client";
import { useSketchStore } from "../../components/sketch/state/useSketchStore";
import { useSketchDocumentStore } from "../../stores/sketch/SketchDocumentStore";
import { useSketchLayerBindingsStore } from "../../stores/sketch/SketchLayerBindingsStore";
import { useSketchCanvasRefStore } from "../../stores/sketch/SketchCanvasRefStore";
import { selectionToMaskDataUrl } from "../../lib/sketch/selectionMaskImage";

export type InpaintHereResult =
  | { ok: true; layerId: string }
  | {
      ok: false;
      reason: "no-selection" | "no-document" | "no-canvas" | "error";
      message?: string;
    };

export interface UseInpaintHereResult {
  inpaintHere: () => Promise<InpaintHereResult>;
  isBusy: boolean;
}

export const FOCUS_PROMPT_INPUT_EVENT = "sketch:focus-prompt-input";

export function useInpaintHere(): UseInpaintHereResult {
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false);

  const inpaintHere = useCallback(async (): Promise<InpaintHereResult> => {
    if (busyRef.current) {
      return { ok: false, reason: "error", message: "Already running" };
    }
    const documentId = useSketchDocumentStore.getState().documentId;
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

      const newLayerId = useSketchStore
        .getState()
        .addLayer("Inpaint Here", "raster");

      let binding;
      try {
        binding = await trpcClient.sketch.layers.create.mutate({
          id: documentId,
          layerId: newLayerId,
          sourceWorkflowId: LAYER_TEMPLATE_SEED_IDS.inpaint
        });
      } catch (err) {
        useSketchStore.getState().removeLayer(newLayerId);
        return {
          ok: false,
          reason: "error",
          message: err instanceof Error ? err.message : "Failed to bind layer"
        };
      }

      const seededOverrides = {
        ...(binding.paramOverrides ?? {}),
        image: { type: "image", uri: compositeDataUrl },
        mask: { type: "image", uri: maskDataUrl }
      };

      // upsertBinding recomputes the dependency hash from the seeded
      // overrides, so a second setParamOverrides call would be pure churn.
      useSketchLayerBindingsStore
        .getState()
        .upsertBinding({ ...binding, paramOverrides: seededOverrides });

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(FOCUS_PROMPT_INPUT_EVENT, {
            detail: { layerId: newLayerId }
          })
        );
      }

      return { ok: true, layerId: newLayerId };
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }, []);

  return { inpaintHere, isBusy };
}
