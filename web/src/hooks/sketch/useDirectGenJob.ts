/**
 * useDirectGenJob — fires a `generate_media` RPC for a direct-gen layer.
 *
 * The binding (kind, prompt, model, source, current asset id, status) lives
 * in `useSketchSessionStore`, the same store that backs workflow-bound
 * layers. Status flips ("generating" → "generated" / "failed") are written
 * back via `patchBinding`. On success the layer's `imageReference` is
 * pointed at the new asset so the canvas displays it.
 *
 * `start` never rejects — callers run whole batches through it and depend on
 * one refusal not stopping the rest — so a failure is reported rather than
 * thrown: the reason lands in `directGenFailure(layerId)` beside the status,
 * classified and with the provider's own words kept (F7).
 */
import { useCallback } from "react";
import {
  globalWebSocketManager,
  type WebSocketMessage
} from "../../lib/websocket/GlobalWebSocketManager";
import {
  useSketchInstance,
  type SketchInstance
} from "../../stores/sketch/SketchInstance";
import { useAssetStore } from "../../stores/AssetStore";
import { getAssetUrl } from "../../utils/assetHelpers";
import {
  exportLayer,
  canvasToBlob
} from "../../components/sketch/serialization";
import { maskInpaintResult } from "../../lib/sketch/maskInpaintResult";
import { computeLayerDependencyHash } from "../../lib/sketch/dependencyHash";
import { redactSecretsInText } from "../../utils/bugReportBundle";
import type {
  LayerVersion,
  LayerWorkflowBinding
} from "@nodetool-ai/image-editor";

/**
 * What the take was made from. Two takes of the same binding hash the same, so
 * editing the prompt (or asking for a different seed) marks the layer stale
 * against its last generation — the same rule workflow-bound layers follow.
 */
const directGenDependencyHash = (binding: LayerWorkflowBinding): string =>
  computeLayerDependencyHash({
    workflowId: `direct:${binding.kind ?? "text-to-image"}`,
    workflowUpdatedAt: "",
    paramOverrides: {
      prompt: binding.prompt,
      provider: binding.provider,
      model: binding.model,
      width: binding.width,
      height: binding.height,
      seed: binding.seed
    },
    inputAssetHashes: []
  });

const directGenVersion = (
  binding: LayerWorkflowBinding,
  requestId: string,
  assetId: string
): LayerVersion => ({
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
  // Direct generation opens no job row; the RPC request id is the only
  // identifier the take ever had, and it is what a trace correlates on.
  jobId: requestId,
  assetId,
  workflowUpdatedAt: "",
  dependencyHash: directGenDependencyHash(binding),
  paramOverridesSnapshot: {
    prompt: binding.prompt ?? "",
    provider: binding.provider ?? "",
    model: binding.model ?? "",
    width: binding.width ?? null,
    height: binding.height ?? null,
    seed: binding.seed ?? null
  },
  status: "success"
});

function assetIdFromUri(uri: string | undefined | null): string | null {
  if (!uri || !uri.startsWith("asset://")) return null;
  const rest = uri.slice("asset://".length);
  const dot = rest.indexOf(".");
  return dot > 0 ? rest.slice(0, dot) : rest;
}

interface DirectGenRpcResponse extends WebSocketMessage {
  type: "rpc_response";
  request_id: string;
  command: string;
  result?: { asset_ids?: unknown };
  error?: { code?: string; message?: string };
}

interface UseDirectGenJobApi {
  start: (layerId: string) => Promise<void>;
  cancel: (layerId: string) => void;
}

/**
 * What went wrong, in the terms that decide what the creator does next. A
 * refused prompt, a missing key and a provider timeout all end as
 * `status: "failed"` on the binding, and each needs a different remedy — so
 * the difference is kept rather than flattened (F7).
 */
export type DirectGenFailureKind =
  | "no-model"
  | "no-prompt"
  | "no-source"
  | "auth"
  | "quota"
  | "refused"
  | "timeout"
  | "network"
  | "provider"
  | "unknown";

export interface DirectGenFailure {
  kind: DirectGenFailureKind;
  /** One line naming the remedy. Always set. */
  message: string;
  /** The provider's own words, redacted and capped. Empty when there were none. */
  detail: string;
}

/** A provider message is a sentence, not a stack trace. */
const MAX_FAILURE_DETAIL = 300;

/**
 * The reasons, keyed by layer. Module-level for the same reason `inFlight` is:
 * the writer is an RPC handler and the reader is whatever surface renders the
 * layer next, and they are never the same render. A reason lives as long as
 * the tab, which is as long as the failed take it explains.
 */
const failures = new Map<string, DirectGenFailure>();

/** Why this layer's last take failed, or null when it did not. */
export const directGenFailure = (layerId: string): DirectGenFailure | null =>
  failures.get(layerId) ?? null;

/** One line a surface can render: the remedy, then the provider's words. */
export const describeDirectGenFailure = (failure: DirectGenFailure): string =>
  failure.detail ? `${failure.message} (${failure.detail})` : failure.message;

/**
 * Read a provider's refusal. The code and the message are the provider's, so
 * the classification is a match on both — and the text is carried through
 * rather than replaced, because "content policy" and "rate limit" are not the
 * same problem to the person reading it.
 */
const classifyProviderError = (error: {
  code?: string;
  message?: string;
}): DirectGenFailure => {
  const raw = `${error.code ?? ""} ${error.message ?? ""}`.trim();
  const detail = redactSecretsInText(error.message ?? error.code ?? "").slice(
    0,
    MAX_FAILURE_DETAIL
  );
  const match = (pattern: RegExp): boolean => pattern.test(raw);
  if (match(/unauthor|invalid[_\s-]?api|api[_\s-]?key|401|403|forbidden/i)) {
    return {
      kind: "auth",
      message:
        "The provider rejected the request as unauthorized. Check its API key in Settings.",
      detail
    };
  }
  if (match(/quota|rate[_\s-]?limit|429|billing|insufficient|credit/i)) {
    return {
      kind: "quota",
      message:
        "The provider turned the request away for now. Wait a moment, or use another model.",
      detail
    };
  }
  if (match(/safety|content[_\s-]?polic|moderat|refus|blocked|nsfw/i)) {
    return {
      kind: "refused",
      message: "The provider refused this prompt. Reword it and try again.",
      detail
    };
  }
  if (match(/timeout|timed[_\s-]?out|deadline|504/i)) {
    return {
      kind: "timeout",
      message: "The provider took too long to answer. Try again.",
      detail
    };
  }
  if (match(/network|socket|econn|fetch failed|disconnect|offline/i)) {
    return {
      kind: "network",
      message: "The connection dropped before the image came back. Try again.",
      detail
    };
  }
  // Nothing above matched, so this is not a refusal: the provider accepted
  // the job and it broke on their side (a crashed worker, a failed render).
  return {
    kind: detail ? "provider" : "unknown",
    message: detail
      ? "The provider's job failed. Try again, or use another model."
      : "The provider's job failed and gave no reason.",
    detail
  };
};

/** The reason a caught exception gives, redacted and capped. */
const causeDetail = (cause: unknown): string =>
  cause instanceof Error
    ? redactSecretsInText(cause.message).slice(0, MAX_FAILURE_DETAIL)
    : "";

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

/**
 * Record why, then mark the layer failed. The reason is written first, so the
 * render triggered by the status flip already has it — a tile never shows
 * "failed" with nothing beside it.
 */
const failLayer = (
  session: SketchInstance["session"],
  layerId: string,
  failure: DirectGenFailure
): void => {
  failures.set(layerId, failure);
  session.getState().patchBinding(layerId, { status: "failed" });
};

export function useDirectGenJob(): UseDirectGenJobApi {
  // The editor this hook was mounted in. `getState()` on the shared hooks
  // follows the focused tab, so a take that settles after a tab switch would
  // be written into another document, or nowhere, and stay "generating".
  const { editor, session } = useSketchInstance();
  const start = useCallback(async (layerId: string) => {
    const bindings = session.getState();
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
      failLayer(session, layerId, {
        kind: "no-model",
        message:
          "No image model is set on this layer. Pick one, then try again.",
        detail: ""
      });
      return;
    }
    if (!binding.prompt || !binding.prompt.trim()) {
      failLayer(session, layerId, {
        kind: "no-prompt",
        message: "This layer has no prompt to render.",
        detail: ""
      });
      return;
    }

    const sketch = editor.getState();
    let sourceAssetId: string | undefined;
    let maskAssetId: string | undefined;

    if (binding.kind === "inpaint") {
      if (!binding.sourceAssetId || !binding.maskAssetId) {
        failLayer(session, layerId, {
          kind: "no-source",
          message:
            "The selection this was going to repaint is gone. Make a new one and try again.",
          detail: ""
        });
        return;
      }
      sourceAssetId = binding.sourceAssetId;
      maskAssetId = binding.maskAssetId;
    } else if (binding.kind === "image-to-image") {
      if (binding.sourceAssetId) {
        // Selection-overlay "edit" path: the source composite is already
        // uploaded as a throwaway asset on the binding.
        sourceAssetId = binding.sourceAssetId;
      } else if (!binding.sourceLayerId) {
        failLayer(session, layerId, {
          kind: "no-source",
          message: "This layer has no source image to work from.",
          detail: ""
        });
        return;
      } else {
        const sourceLayer = sketch.document.layers.find(
          (l) => l.id === binding.sourceLayerId
        );
        if (!sourceLayer) {
          failLayer(session, layerId, {
            kind: "no-source",
            message: "The source layer this was built from is gone.",
            detail: ""
          });
          return;
        }
        const fromUri = assetIdFromUri(sourceLayer.imageReference?.uri);
        if (fromUri) {
          sourceAssetId = fromUri;
        } else {
          try {
            const canvas = await exportLayer(sketch.document, sourceLayer.id);
            if (!canvas) {
              failLayer(session, layerId, {
                kind: "no-source",
                message: "The source layer is empty, so there is nothing to work from.",
                detail: ""
              });
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
          } catch (cause) {
            failLayer(session, layerId, {
              kind: "provider",
              message: "The source image could not be prepared.",
              detail: causeDetail(cause)
            });
            return;
          }
        }
      }
    }

    // Tear down any stale subscription left behind by a previous run on this
    // layer (e.g. cancelled but the RPC still in flight) so its handler can't
    // settle on top of this one.
    clearInFlight(layerId);

    const requestId = crypto.randomUUID();
    // A new take answers the last failure, whatever it said.
    failures.delete(layerId);
    bindings.patchBinding(layerId, { status: "generating" });

    let unsubscribe: (() => void) | undefined;
    const cleanup = () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = undefined;
      }
      inFlight.delete(layerId);
    };

    // The selection-overlay source/mask are throwaway uploads; once the backend
    // is done with them (or never received them) they should not linger in the
    // asset library. Best-effort — never block on cleanup. The inspector-driven
    // image-to-image path (which has a sourceLayerId) reuses real layer assets,
    // so only the overlay path's uploads (no sourceLayerId) are cleaned up here.
    const deleteTempUploads = () => {
      const ids: Array<string | null | undefined> = [];
      if (binding.kind === "inpaint") {
        ids.push(binding.sourceAssetId, binding.maskAssetId);
      } else if (
        binding.kind === "image-to-image" &&
        binding.sourceAssetId &&
        !binding.sourceLayerId
      ) {
        ids.push(binding.sourceAssetId);
      }
      for (const id of ids) {
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
      const store = session.getState();
      if (msg.error) {
        // rpc_response means the backend has finished reading the inputs.
        deleteTempUploads();
        failLayer(session, layerId, classifyProviderError(msg.error));
        return;
      }
      const assetIds = Array.isArray(msg.result?.asset_ids)
        ? (msg.result!.asset_ids as unknown[]).filter(
            (v): v is string => typeof v === "string"
          )
        : [];
      const first = assetIds[0];
      if (!first) {
        deleteTempUploads();
        failLayer(session, layerId, {
          kind: "provider",
          message: "The request finished without an image.",
          detail: ""
        });
        return;
      }

      let finalAssetId = first;
      try {
        // Providers return a full-frame image for inpainting. Clip it to the
        // selection mask so the new layer only overlays the inpainted region
        // and leaves the rest of the canvas to the layers below. This needs the
        // mask asset, so it must run before deleteTempUploads().
        if (binding.kind === "inpaint" && binding.maskAssetId) {
          try {
            const [generatedAsset, maskAsset] = await Promise.all([
              useAssetStore.getState().get(first),
              useAssetStore.getState().get(binding.maskAssetId)
            ]);
            const generatedUrl = getAssetUrl(generatedAsset);
            const maskUrl = getAssetUrl(maskAsset);
            if (generatedUrl && maskUrl) {
              const sketchState = editor.getState();
              const masked = await maskInpaintResult(
                generatedUrl,
                maskUrl,
                sketchState.document.canvas.width,
                sketchState.document.canvas.height
              );
              const maskedFile = new File([masked], "inpaint-result.png", {
                type: "image/png"
              });
              const uploaded = await useAssetStore
                .getState()
                .createAsset(
                  maskedFile,
                  undefined,
                  undefined,
                  undefined,
                  "file"
                );
              finalAssetId = uploaded.id;
              // The raw full-frame result is no longer referenced.
              void useAssetStore
                .getState()
                .delete(first)
                .catch(() => {});
            }
          } catch {
            // Fall back to the unmasked full-frame result.
          }
        }
        deleteTempUploads();

        const asset = await useAssetStore.getState().get(finalAssetId);
        const url = getAssetUrl(asset) ?? `asset://${finalAssetId}.png`;
        const sketchState = editor.getState();
        const currentLayer = sketchState.document.layers.find(
          (l) => l.id === layerId
        );
        const canvasW = sketchState.document.canvas.width;
        const canvasH = sketchState.document.canvas.height;
        // The result lands while the creator keeps working, so it touches
        // this layer only: undo history, selection and tool settings stay.
        sketchState.setLayerImageReference(layerId, {
          uri: url,
          naturalWidth: currentLayer?.contentBounds.width ?? canvasW,
          naturalHeight: currentLayer?.contentBounds.height ?? canvasH,
          objectFit: "contain"
        });
      } catch (cause) {
        failLayer(session, layerId, {
          kind: "provider",
          message: "The image came back but could not be placed on the canvas.",
          detail: causeDetail(cause)
        });
        return;
      }

      // A direct-gen take is a take: record it as a `layerVersion` so the
      // layer keeps its history the way a workflow-bound layer does. The image
      // flow depends on it — a picked variation and every hidden one carry
      // their record (PRD § 10.4, criterion 5) — and the version list in the
      // inspector reads the same rows. The record is written onto the binding
      // rather than through `sketch.versions.append`, because a direct-gen
      // binding is created client-side and the server has not seen it until
      // the next autosave.
      store.recordGeneratedVersion(layerId, {
        version: directGenVersion(binding, requestId, finalAssetId),
        dependencyHash: directGenDependencyHash(binding),
        assetId: finalAssetId
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
          aspect_ratio: binding.aspectRatio,
          resolution: binding.resolution,
          strength: binding.strength,
          num_inference_steps: binding.numInferenceSteps,
          seed: binding.seed,
          variations: 1
        }
      });
    } catch (cause) {
      cleanup();
      // Send never reached the backend, so the uploads are orphaned.
      deleteTempUploads();
      failLayer(session, layerId, {
        kind: "network",
        message:
          "The request never reached NodeTool. Check your connection and try again.",
        detail: causeDetail(cause)
      });
    }
  }, [editor, session]);

  const cancel = useCallback(
    (layerId: string) => {
      clearInFlight(layerId);
      session.getState().patchBinding(layerId, { status: "draft" });
    },
    [session]
  );

  return { start, cancel };
}
