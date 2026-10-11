/**
 * useSceneAiRender — turns a 3D editor viewport capture into a generated
 * image through the `generate_media` RPC in `image_edit` mode.
 *
 * The capture is uploaded as a throwaway asset, sent as the source image with
 * any style references after it, and deleted once the server has answered.
 * The rendered image stays in the asset library.
 */
import { useCallback, useEffect, useRef } from "react";
import {
  globalWebSocketManager,
  type WebSocketMessage
} from "../../lib/websocket/GlobalWebSocketManager";
import { useAssetStore } from "../../stores/AssetStore";
import { redactSecretsInText } from "../../utils/bugReportBundle";
import {
  buildAiRenderPrompt,
  dataUrlToFile,
  type CapturePass
} from "../../components/model_editor/aiRender";

export interface SceneAiRenderRequest {
  /** PNG `data:` URL of the viewport, from `captureModelOnly`. */
  capture: string;
  pass: CapturePass;
  prompt: string;
  provider: string;
  model: string;
  /** Style references, sent after the capture in this order. */
  referenceAssetIds: readonly string[];
  aspectRatio: string;
  resolution: string;
}

interface GenerateMediaResponse extends WebSocketMessage {
  type: "rpc_response";
  result?: { asset_ids?: unknown };
  error?: { code?: string; message?: string };
}

interface UseSceneAiRenderApi {
  /** Resolves with the rendered image's asset id. Rejects with a readable reason. */
  render: (request: SceneAiRenderRequest) => Promise<string>;
}

/** A provider's message is a sentence, not a stack trace. */
const MAX_ERROR_LENGTH = 300;

const readableError = (error: { code?: string; message?: string }): string =>
  redactSecretsInText(error.message || error.code || "The provider's job failed and gave no reason.").slice(
    0,
    MAX_ERROR_LENGTH
  );

const sendCancel = (requestIds: string[]): void => {
  if (requestIds.length === 0) {
    return;
  }
  globalWebSocketManager
    .send({
      command: "cancel_generation",
      request_id: crypto.randomUUID(),
      data: { request_ids: requestIds }
    })
    .catch(() => {
      // The editor is gone. A render the server keeps running still lands
      // in the asset library.
    });
};

export function useSceneAiRender(): UseSceneAiRenderApi {
  // Teardowns of the requests still waiting on a reply, by request id. An
  // editor closed mid-render cancels them, so the provider call stops instead
  // of billing, and drops their captures.
  const pending = useRef(new Map<string, () => void>());

  useEffect(() => {
    const inFlight = pending.current;
    return () => {
      for (const teardown of inFlight.values()) {
        teardown();
      }
      sendCancel([...inFlight.keys()]);
      inFlight.clear();
    };
  }, []);

  const render = useCallback(async (request: SceneAiRenderRequest): Promise<string> => {
    const assets = useAssetStore.getState();
    const source = await assets.createAsset(
      dataUrlToFile(request.capture, `viewport-${request.pass}.png`),
      undefined,
      undefined,
      undefined,
      "file"
    );
    const dropSource = () => {
      void useAssetStore
        .getState()
        .delete(source.id)
        .catch(() => {
          // Best-effort cleanup of the throwaway capture.
        });
    };

    const requestId = crypto.randomUUID();
    const reply = new Promise<GenerateMediaResponse>((resolve) => {
      const unsubscribe = globalWebSocketManager.subscribe(requestId, (msg) => {
        if (msg.type !== "rpc_response") {
          return;
        }
        unsubscribe();
        pending.current.delete(requestId);
        resolve(msg as GenerateMediaResponse);
      });
      pending.current.set(requestId, () => {
        unsubscribe();
        dropSource();
      });
    });

    try {
      await globalWebSocketManager.send({
        command: "generate_media",
        request_id: requestId,
        data: {
          mode: "image_edit",
          provider: request.provider,
          model: request.model,
          prompt: buildAiRenderPrompt(request.prompt, request.pass, request.referenceAssetIds.length),
          source_asset_id: source.id,
          reference_images: request.referenceAssetIds.map((asset_id) => ({
            type: "image",
            asset_id
          })),
          aspect_ratio: request.aspectRatio,
          resolution: request.resolution,
          variations: 1
        }
      });
    } catch (cause) {
      pending.current.get(requestId)?.();
      pending.current.delete(requestId);
      throw new Error(
        cause instanceof Error
          ? `The request never reached NodeTool: ${cause.message}`
          : "The request never reached NodeTool. Check your connection and try again."
      );
    }

    const msg = await reply;
    dropSource();
    if (msg.error) {
      throw new Error(readableError(msg.error));
    }
    const ids: unknown = msg.result?.asset_ids;
    const first = Array.isArray(ids)
      ? ids.find((id): id is string => typeof id === "string")
      : undefined;
    if (!first) {
      throw new Error("The request finished without an image.");
    }
    return first;
  }, []);

  return { render };
}
