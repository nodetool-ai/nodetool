/**
 * useInpaintHere
 *
 * Action hook for the "Generate via Inpaint Here" flow.
 *
 * Steps performed by `inpaintHere()`:
 *   1. Reads the current selection from the sketch store. If the selection
 *      is empty, returns early with `{ ok: false, reason: "no-selection" }`.
 *   2. Flattens the canvas (visible layers) into a PNG data URL — the
 *      "rasterized context image" the inpaint workflow uses.
 *   3. Rasterizes the selection grid into a canvas-sized PNG mask data URL.
 *   4. Inserts a new raster layer above the active layer in the sketch
 *      store, named "Inpaint Here".
 *   5. Calls `trpc.sketch.layers.create` with the seeded Inpaint template
 *      workflow id, then upserts the returned binding.
 *   6. Seeds the binding's `paramOverrides` with `image` and `mask`
 *      data URLs and recomputes the dependency hash.
 *   7. Dispatches a `sketch:focus-prompt-input` DOM event so the inspector
 *      can focus the prompt field on the new layer.
 *
 * The hook does not start generation — the user clicks Generate after
 * tweaking the prompt.
 */

import { useCallback, useState } from "react";

import { LAYER_TEMPLATE_SEED_IDS } from "@nodetool-ai/image-editor";
import { trpcClient } from "../../trpc/client";
import { useSketchStore } from "../../components/sketch/state/useSketchStore";
import { useSketchDocumentStore } from "../../stores/sketch/SketchDocumentStore";
import { useSketchLayerBindingsStore } from "../../stores/sketch/SketchLayerBindingsStore";
import { useSketchCanvasRefStore } from "../../stores/sketch/SketchCanvasRefStore";
import { selectionToMaskDataUrl } from "../../lib/sketch/selectionMaskImage";

export type InpaintHereResult =
  | { ok: true; layerId: string }
  | { ok: false; reason: "no-selection" | "no-document" | "no-canvas" | "error"; message?: string };

export interface UseInpaintHereResult {
  inpaintHere: () => Promise<InpaintHereResult>;
  isBusy: boolean;
}

export const FOCUS_PROMPT_INPUT_EVENT = "sketch:focus-prompt-input";

export function useInpaintHere(): UseInpaintHereResult {
  const [isBusy, setIsBusy] = useState(false);

  const inpaintHere = useCallback(async (): Promise<InpaintHereResult> => {
    if (isBusy) {
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

      // Insert the new raster layer above the active layer; the sketch
      // store's `addLayer` already returns the new id and activates it.
      const newLayerId = useSketchStore.getState().addLayer("Inpaint Here", "raster");

      let binding;
      try {
        binding = await trpcClient.sketch.layers.create.mutate({
          id: documentId,
          layerId: newLayerId,
          sourceWorkflowId: LAYER_TEMPLATE_SEED_IDS.inpaint
        });
      } catch (err) {
        // Roll back the local layer if the server-side bind failed.
        useSketchStore.getState().removeLayer(newLayerId);
        return {
          ok: false,
          reason: "error",
          message: err instanceof Error ? err.message : "Failed to bind layer"
        };
      }

      // Persist the seeded image/mask overrides.
      const seededOverrides = {
        ...(binding.paramOverrides ?? {}),
        image: { type: "image", uri: compositeDataUrl },
        mask: { type: "image", uri: maskDataUrl }
      };

      const bindingsStore = useSketchLayerBindingsStore.getState();
      bindingsStore.upsertBinding({ ...binding, paramOverrides: seededOverrides });
      bindingsStore.setParamOverrides(newLayerId, seededOverrides);

      // Notify any prompt-input field on the inspector that it should focus.
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(FOCUS_PROMPT_INPUT_EVENT, {
            detail: { layerId: newLayerId }
          })
        );
      }

      return { ok: true, layerId: newLayerId };
    } finally {
      setIsBusy(false);
    }
  }, [isBusy]);

  return { inpaintHere, isBusy };
}
