/**
 * Bake a 3D clip through Blender from the browser (design §D6).
 *
 * A bake needs a Blender install, so it cannot run where the preview does. It
 * runs as an ordinary inline job instead — one hidden
 * `nodetool.blender.BakeTimelineClip` node on the job queue — which is what
 * gives it per-frame progress, cancellation and a place in the run queue
 * beside every other render. What the browser owns is the sample list: the
 * model time and camera of each output frame come from the same
 * `computeModel3DBakeSamples` the server-side op uses, so a bake started here
 * and one started by an agent render the same frames.
 *
 * On completion the video is stored as an asset and written onto the clip
 * with the hash it was rendered at, plus a clip version — the same shape the
 * op stores, so the scene model plays it and the validator judges it the same
 * way whichever surface started it.
 */

import { useCallback, useRef, useState } from "react";

import {
  computeModel3DBakeHash,
  makeClipVersion,
  model3dBakeCameraParams,
  TRANSPARENT_BAKE_REFUSAL,
  type Model3DBakeRenderSettings,
  type TimelineClip
} from "@nodetool-ai/timeline";
import { computeModel3DBakeSamples } from "@nodetool-ai/timeline/scene";
import { animationDurations, parseModel3D } from "@nodetool-ai/model3d";

import { globalWebSocketManager } from "../../lib/websocket/GlobalWebSocketManager";
import { runInlineGraphJob } from "../../lib/workflow/runInlineGraphJob";
import { useAssetStore } from "../../stores/AssetStore";
import { useTimelineStoreApi } from "../../stores/timeline/TimelineStore";
import { getAssetUrl } from "../../utils/assetHelpers";
import { isObjectLike, isString } from "../../utils/typePredicates";

/** The node id inside the one-node graph a bake runs as. */
const BAKE_NODE_ID = "bake";
const BAKE_NODE_TYPE = "nodetool.blender.BakeTimelineClip";

/**
 * What a bake renders at. Matches the server-side bake so the two surfaces
 * produce the same picture; EEVEE at 32 samples is a clip's worth of frames,
 * not one hero still.
 */
const BAKE_RENDER: Model3DBakeRenderSettings = {
  engine: "eevee",
  samples: 32,
  denoise: true,
  resolutionPercentage: 100
};

export interface Model3DBakeState {
  /** Clip currently baking, or null. */
  clipId: string | null;
  /** Frames rendered so far and in total, once the job reports any. */
  progress: { done: number; total: number } | null;
  error: string | null;
}

export interface Model3DBakeResult {
  assetId: string;
  dependencyHash: string;
}

const IDLE: Model3DBakeState = { clipId: null, progress: null, error: null };

/** Decode the node's inline video output into bytes. */
function videoBytesOf(output: unknown): Uint8Array | null {
  if (!isObjectLike(output)) return null;
  const video = (output as Record<string, unknown>)["video"];
  if (!isObjectLike(video)) return null;
  const data = (video as Record<string, unknown>)["data"];
  if (!isString(data) || data.length === 0) return null;
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface UseModel3DBakeResult {
  state: Model3DBakeState;
  /** Render the clip and write the bake onto it. Rejects with the reason. */
  bakeClip: (clipId: string) => Promise<Model3DBakeResult>;
  /** Abort an in-flight bake. */
  cancel: () => void;
}

export function useModel3DBake(): UseModel3DBakeResult {
  const timeline = useTimelineStoreApi();
  const getAsset = useAssetStore((s) => s.get);
  const createAsset = useAssetStore((s) => s.createAsset);
  const [state, setState] = useState<Model3DBakeState>(IDLE);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const bakeClip = useCallback(
    async (clipId: string): Promise<Model3DBakeResult> => {
      const store = timeline.getState();
      const clip = store.clips.find((c) => c.id === clipId);
      if (!clip) throw new Error(`No clip ${clipId} on this timeline.`);
      const style = clip.model3dStyle;
      if (clip.mediaType !== "model3d" || !style) {
        throw new Error(
          `Clip "${clip.name}" is not a 3D clip, so there is nothing to bake.`
        );
      }
      const assetId = clip.currentAssetId;
      if (!assetId) {
        throw new Error(`Clip "${clip.name}" has no glTF asset to bake.`);
      }
      // T13 lands the alpha encode; until then an opaque box over the footage
      // is the wrong answer, so the refusal names the reason.
      if (style.background.transparent) {
        throw new Error(
          `Clip "${clip.name}" has a transparent background. ${TRANSPARENT_BAKE_REFUSAL}`
        );
      }

      const sequence = {
        fps: store.fps,
        width: store.width,
        height: store.height
      };
      const dependencyHash = computeModel3DBakeHash(clip, sequence);

      const controller = new AbortController();
      abortRef.current = controller;
      setState({ clipId, progress: null, error: null });
      try {
        // The animation lengths decide where a looped clip wraps and a held
        // one clamps, and only the glTF knows them.
        const asset = await getAsset(assetId);
        const url = getAssetUrl(asset);
        if (!url) throw new Error(`The glTF asset ${assetId} has no URL.`);
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(
            `Could not read the glTF asset (${response.status}).`
          );
        }
        const glb = new Uint8Array(await response.arrayBuffer());
        const durations = animationDurations(parseModel3D(glb).json);
        const samples = computeModel3DBakeSamples(clip, sequence, durations);

        // The op reports a `Fra:` line per rendered still, which the runner
        // turns into `node_progress`. Nothing else on this ad-hoc workflow id
        // is talking, so the frame counter is read straight off that channel.
        const workflowId = `timeline-bake-${clipId}`;
        const unsubscribe = globalWebSocketManager.subscribe(
          workflowId,
          (message: Record<string, unknown>) => {
            if (message["type"] !== "node_progress") return;
            const done = Number(message["progress"]);
            const total = Number(message["total"]);
            if (!Number.isFinite(done) || !Number.isFinite(total)) return;
            setState((prev) =>
              prev.clipId === clipId ? { ...prev, progress: { done, total } } : prev
            );
          }
        );
        const run = await runInlineGraphJob({
          workflowId,
          jobName: `Bake ${clip.name}`,
          signal: controller.signal,
          graph: {
            nodes: [
              {
                id: BAKE_NODE_ID,
                type: BAKE_NODE_TYPE,
                data: {
                  model: {
                    type: "model_3d",
                    uri: `asset://${assetId}`,
                    asset_id: assetId
                  },
                  frame_times: samples.frameTimes,
                  cameras: samples.cameras.map((camera) =>
                    model3dBakeCameraParams(camera, style, BAKE_RENDER)
                  ),
                  animation_name: style.animation.clipName ?? "",
                  width: sequence.width,
                  height: sequence.height,
                  fps: sequence.fps
                }
              }
            ],
            edges: []
          }
        }).finally(unsubscribe);
        if (!run.success) {
          throw new Error(run.error ?? "The bake job failed.");
        }
        const bytes = videoBytesOf(run.outputs[BAKE_NODE_ID]);
        if (!bytes) {
          throw new Error("The bake job produced no video.");
        }
        const name = `${clip.name || "clip"}-bake.mp4`;
        const stored = await createAsset(
          new File([bytes as BlobPart], name, { type: "video/mp4" })
        );

        const current = timeline.getState().clips.find((c) => c.id === clipId);
        const liveStyle = current?.model3dStyle ?? style;
        const now = new Date().toISOString();
        timeline.getState().patchClip(clipId, {
          model3dStyle: {
            ...liveStyle,
            bake: { assetId: stored.id, dependencyHash }
          },
          versions: [
            ...(current?.versions ?? []),
            makeClipVersion({
              createdAt: now,
              workflowUpdatedAt: now,
              assetId: stored.id,
              dependencyHash
            })
          ]
        } satisfies Partial<TimelineClip>);
        setState(IDLE);
        return { assetId: stored.id, dependencyHash };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        setState({ clipId: null, progress: null, error: message });
        throw error instanceof Error ? error : new Error(message);
      } finally {
        abortRef.current = null;
      }
    },
    [timeline, getAsset, createAsset]
  );

  return { state, bakeClip, cancel };
}
