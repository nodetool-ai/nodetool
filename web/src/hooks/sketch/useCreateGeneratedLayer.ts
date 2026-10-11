/** Create a generated sketch layer bound to an arbitrary workflow. */

import { useCallback, useRef, useState } from "react";

import { trpcClient } from "../../trpc/client";
import { useSketchInstance } from "../../stores/sketch/SketchInstance";

interface CreateGeneratedLayerOptions {
  workflowId: string;
  /** Display name for the new layer. Defaults to "Generated Layer". */
  layerName?: string;
  /** Required when the source workflow has multiple image-output nodes. */
  selectedOutputNodeId?: string;
}

export type CreateGeneratedLayerResult =
  | { ok: true; layerId: string }
  | { ok: false; reason: "no-document" | "busy" | "error"; message?: string };

interface UseCreateGeneratedLayerResult {
  createGeneratedLayer: (
    options: CreateGeneratedLayerOptions
  ) => Promise<CreateGeneratedLayerResult>;
  isBusy: boolean;
}

export function useCreateGeneratedLayer(): UseCreateGeneratedLayerResult {
  // The layer is created on the server after a round trip, so the answer
  // lands in this editor even if another tab is focused by then.
  const { editor, session } = useSketchInstance();
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false);

  const createGeneratedLayer = useCallback(
    async (
      options: CreateGeneratedLayerOptions
    ): Promise<CreateGeneratedLayerResult> => {
      if (busyRef.current) {
        return { ok: false, reason: "busy" };
      }
      const documentId = session.getState().documentId;
      if (!documentId) {
        return { ok: false, reason: "no-document" };
      }

      busyRef.current = true;
      setIsBusy(true);
      const layerName = options.layerName ?? "Generated Layer";
      const newLayerId = editor.getState().addLayer(layerName, "raster");

      try {
        const binding = await trpcClient.sketch.layers.create.mutate({
          id: documentId,
          layerId: newLayerId,
          sourceWorkflowId: options.workflowId,
          selectedOutputNodeId: options.selectedOutputNodeId
        });
        session.getState().upsertBinding(binding);
        editor.getState().setActiveLayer(newLayerId);
        return { ok: true, layerId: newLayerId };
      } catch (err) {
        editor.getState().removeLayer(newLayerId);
        return {
          ok: false,
          reason: "error",
          message:
            err instanceof Error ? err.message : "Failed to create layer"
        };
      } finally {
        busyRef.current = false;
        setIsBusy(false);
      }
    },
    [editor, session]
  );

  return { createGeneratedLayer, isBusy };
}
