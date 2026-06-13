/**
 * useDirectGenJob — fires a `generate_media` RPC for a direct-gen layer.
 *
 * The binding (kind, prompt, model, source, current asset id, status) lives
 * in `useSketchSessionStore`, the same store that backs workflow-bound
 * layers. Status flips ("generating" → "generated" / "failed") are written
 * back via `patchBinding`. On success the layer's `imageReference` is
 * pointed at the new asset so the canvas displays it.
 */
import { useCallback } from "react";
import {
  globalWebSocketManager,
  type WebSocketMessage
} from "../../lib/websocket/GlobalWebSocketManager";
import { useSketchSessionStore } from "../../stores/sketch/SketchSessionStore";
import { useSketchStore } from "../../components/sketch/state/useSketchStore";
import { useAssetStore } from "../../stores/AssetStore";
import { getAssetUrl } from "../../utils/assetHelpers";
import {
  exportLayer,
  canvasToBlob
} from "../../components/sketch/serialization";

function assetIdFromUri(uri: string | undefined | null): string | null {
  if (!uri || !uri.startsWith("asset://")) return null;
  const rest = uri.slice("asset://".length);
  const dot = rest.indexOf(".");
  return dot > 0 ? rest.slice(0, dot) : rest;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

interface DirectGenRpcResponse extends WebSocketMessage {
  type: "rpc_response";
  request_id: string;
  command: string;
  result?: { asset_ids?: unknown };
  error?: { code?: string; message?: string };
}

export interface UseDirectGenJobApi {
  start: (layerId: string) => Promise<void>;
  cancel: (layerId: string) => void;
}

// Module-level so cancel() can tear down an in-flight subscription started by
// start() in a different render. Without this the RPC handler keeps running
// after cancel and overwrites the user-set "draft" status with "generated".
const inFlight = new Map<string, () => void>();

const clearInFlight = (layerId: string): void => {
  const teardown = inFlight.get(layerId);
  if (teardown) {
    teardown();
    inFlight.delete(layerId);
  }
};

export function useDirectGenJob(): UseDirectGenJobApi {
  const start = useCallback(async (layerId: string) => {
    const bindings = useSketchSessionStore.getState();
    const binding = bindings.bindings[layerId];
    if (!binding) return;
    if (binding.status === "queued" || binding.status === "generating") {
      return;
    }
    if (
      binding.kind !== "text-to-image" &&
      binding.kind !== "image-to-image" &&
      binding.kind !== "inpaint"
    ) {
      return;
    }
    if (!binding.provider || !binding.model) {
      bindings.patchBinding(layerId, { status: "failed" });
      return;
    }
    if (!binding.prompt || !binding.prompt.trim()) {
      bindings.patchBinding(layerId, { status: "failed" });
      return;
    }

    const sketch = useSketchStore.getState();
    let sourceAssetId: string | undefined;
    let maskAssetId: string | undefined;

    if (binding.kind === "inpaint") {
      if (!binding.sourceAssetId || !binding.maskAssetId) {
        bindings.patchBinding(layerId, { status: "failed" });
        return;
      }
      sourceAssetId = binding.sourceAssetId;
      maskAssetId = binding.maskAssetId;
    } else if (binding.kind === "image-to-image") {
      if (!binding.sourceLayerId) {
        bindings.patchBinding(layerId, { status: "failed" });
        return;
      }
      const sourceLayer = sketch.document.layers.find(
        (l) => l.id === binding.sourceLayerId
      );
      if (!sourceLayer) {
        bindings.patchBinding(layerId, { status: "failed" });
        return;
      }
      const fromUri = assetIdFromUri(sourceLayer.imageReference?.uri);
      if (fromUri) {
        sourceAssetId = fromUri;
      } else {
        try {
          const canvas = await exportLayer(sketch.document, sourceLayer.id);
          if (!canvas) {
            bindings.patchBinding(layerId, { status: "failed" });
            return;
          }
          const blob = await canvasToBlob(canvas);
          const file = new File(
            [blob],
            `${sourceLayer.name || "source"}.png`,
            { type: "image/png" }
          );
          const uploaded = await useAssetStore
            .getState()
            .createAsset(file, undefined, undefined, undefined, "file");
          sourceAssetId = uploaded.id;
        } catch {
          bindings.patchBinding(layerId, { status: "failed" });
          return;
        }
      }
    }

    // Tear down any stale subscription left behind by a previous run on this
    // layer (e.g. cancelled but the RPC still in flight) so its handler can't
    // settle on top of this one.
    clearInFlight(layerId);

    const requestId = randomId();
    bindings.patchBinding(layerId, { status: "generating" });

    let unsubscribe: (() => void) | undefined;
    const cleanup = () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = undefined;
      }
      inFlight.delete(layerId);
    };

    // The inpaint source/mask are throwaway uploads; once the backend is done
    // with them (or never received them) they should not linger in the asset
    // library. Best-effort — never block on cleanup.
    const deleteInpaintTempAssets = () => {
      if (binding.kind !== "inpaint") return;
      for (const id of [binding.sourceAssetId, binding.maskAssetId]) {
        if (id) {
          void useAssetStore
            .getState()
            .delete(id)
            .catch(() => {});
        }
      }
    };

    const settle = async (msg: DirectGenRpcResponse) => {
      cleanup();
      // rpc_response means the backend has finished reading the inputs.
      deleteInpaintTempAssets();
      const store = useSketchSessionStore.getState();
      if (msg.error) {
        store.patchBinding(layerId, { status: "failed" });
        return;
      }
      const assetIds = Array.isArray(msg.result?.asset_ids)
        ? (msg.result!.asset_ids as unknown[]).filter(
            (v): v is string => typeof v === "string"
          )
        : [];
      const first = assetIds[0];
      if (!first) {
        store.patchBinding(layerId, { status: "failed" });
        return;
      }

      try {
        const asset = await useAssetStore.getState().get(first);
        const url = getAssetUrl(asset) ?? `asset://${first}.png`;
        const sketchState = useSketchStore.getState();
        const currentLayer = sketchState.document.layers.find(
          (l) => l.id === layerId
        );
        const canvasW = sketchState.document.canvas.width;
        const canvasH = sketchState.document.canvas.height;
        sketchState.setDocument({
          ...sketchState.document,
          layers: sketchState.document.layers.map((l) =>
            l.id === layerId
              ? {
                  ...l,
                  imageReference: {
                    uri: url,
                    naturalWidth: currentLayer?.contentBounds.width ?? canvasW,
                    naturalHeight:
                      currentLayer?.contentBounds.height ?? canvasH,
                    objectFit: "contain"
                  }
                }
              : l
          )
        });
      } catch {
        store.patchBinding(layerId, { status: "failed" });
        return;
      }

      store.patchBinding(layerId, {
        status: "generated",
        currentAssetId: first
      });
    };

    unsubscribe = globalWebSocketManager.subscribe(requestId, (msg) => {
      if (msg.type !== "rpc_response") return;
      void settle(msg as DirectGenRpcResponse);
    });
    inFlight.set(layerId, cleanup);

    try {
      const mode =
        binding.kind === "text-to-image"
          ? "image"
          : binding.kind === "inpaint"
            ? "inpaint"
            : "image_edit";
      await globalWebSocketManager.send({
        command: "generate_media",
        request_id: requestId,
        data: {
          mode,
          provider: binding.provider,
          model: binding.model,
          prompt: binding.prompt,
          source_asset_id: sourceAssetId,
          mask_asset_id: maskAssetId,
          width: binding.width,
          height: binding.height,
          strength: binding.strength,
          num_inference_steps: binding.numInferenceSteps,
          variations: 1
        }
      });
    } catch {
      cleanup();
      // Send never reached the backend, so the uploads are orphaned.
      deleteInpaintTempAssets();
      useSketchSessionStore
        .getState()
        .patchBinding(layerId, { status: "failed" });
    }
  }, []);

  const cancel = useCallback((layerId: string) => {
    clearInFlight(layerId);
    useSketchSessionStore
      .getState()
      .patchBinding(layerId, { status: "draft" });
  }, []);

  return { start, cancel };
}
