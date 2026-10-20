/**
 * useSceneBlenderRender — renders the 3D editor's scene with headless
 * Blender through a one-node `nodetool.blender.RenderImage` job.
 *
 * The exported scene is uploaded as a throwaway asset, rendered on the job
 * queue (so the render shows in the run queue and can be cancelled), and
 * deleted once the job has settled. The rendered PNG is stored as an image
 * asset.
 */
import { useCallback, useEffect, useRef } from "react";

import { runInlineGraphJob } from "../../lib/workflow/runInlineGraphJob";
import { useAssetStore } from "../../stores/AssetStore";
import { redactSecretsInText } from "../../utils/bugReportBundle";
import {
  BLENDER_RENDER_NODE_TYPE,
  blenderRenderNodeData,
  renderedImageOf,
  type BlenderRenderSettings
} from "../../components/model_editor/blenderRender";

export interface SceneBlenderRenderRequest {
  /** The scene as a binary glTF, with the view camera first when `camera` is `view`. */
  scene: Blob;
  settings: BlenderRenderSettings;
  /** Base name of the rendered image, without extension. */
  name: string;
}

interface UseSceneBlenderRenderApi {
  /** Resolves with the rendered image's asset id. Rejects with a readable reason. */
  render: (id: string, request: SceneBlenderRenderRequest) => Promise<string>;
  /** Stop the render started under `id`. It then rejects with "Cancelled". */
  cancel: (id: string) => void;
}

/** The node id inside the one-node graph a render runs as. */
const RENDER_NODE_ID = "render";

/** A Blender failure is a sentence, not a log. */
const MAX_ERROR_LENGTH = 500;

const readableError = (message: string): string =>
  redactSecretsInText(message).slice(0, MAX_ERROR_LENGTH);

export function useSceneBlenderRender(): UseSceneBlenderRenderApi {
  // Renders still running, by the caller's id. Closing the editor cancels
  // them, so Blender stops instead of rendering a picture nobody collects.
  const running = useRef(new Map<string, AbortController>());

  useEffect(() => {
    const inFlight = running.current;
    return () => {
      for (const controller of inFlight.values()) {
        controller.abort();
      }
      inFlight.clear();
    };
  }, []);

  const cancel = useCallback((id: string) => {
    running.current.get(id)?.abort();
  }, []);

  const render = useCallback(async (id: string, request: SceneBlenderRenderRequest): Promise<string> => {
    const controller = new AbortController();
    running.current.set(id, controller);
    const assets = useAssetStore.getState();
    try {
      const source = await assets.createAsset(
        new File([request.scene], `${request.name}-blender-scene.glb`, { type: "model/gltf-binary" }),
        undefined,
        undefined,
        undefined,
        "file"
      );
      let run: Awaited<ReturnType<typeof runInlineGraphJob>>;
      try {
        run = await runInlineGraphJob({
          workflowId: `model3d-blender-${id}`,
          jobName: `Blender render of ${request.name}`,
          signal: controller.signal,
          graph: {
            nodes: [
              {
                id: RENDER_NODE_ID,
                type: BLENDER_RENDER_NODE_TYPE,
                data: blenderRenderNodeData(request.settings, source.id)
              }
            ],
            edges: []
          }
        });
      } finally {
        void useAssetStore
          .getState()
          .delete(source.id)
          .catch(() => {
            // Best-effort cleanup of the throwaway scene.
          });
      }
      if (controller.signal.aborted) {
        throw new Error("Cancelled");
      }
      if (!run.success) {
        throw new Error(readableError(run.error ?? "The Blender render failed and gave no reason."));
      }
      const image = renderedImageOf(run.outputs[RENDER_NODE_ID]);
      if (!image) {
        throw new Error("The Blender render finished without an image.");
      }
      if (image.kind === "asset") {
        return image.assetId;
      }
      let bytes: Uint8Array;
      if (image.kind === "bytes") {
        bytes = image.bytes;
      } else {
        const response = await fetch(image.url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Could not read the rendered image (${response.status}).`);
        }
        bytes = new Uint8Array(await response.arrayBuffer());
      }
      const stored = await useAssetStore
        .getState()
        .createAsset(
          new File([bytes as BlobPart], `${request.name}-blender.png`, { type: "image/png" }),
          undefined,
          undefined,
          undefined,
          "file"
        );
      return stored.id;
    } finally {
      running.current.delete(id);
    }
  }, []);

  return { render, cancel };
}
