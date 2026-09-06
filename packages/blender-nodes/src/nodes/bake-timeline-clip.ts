/**
 * `nodetool.blender.BakeTimelineClip` — the timeline's 3D bake as a job.
 *
 * Hidden from the palette: nobody adds this by hand. It exists so the browser
 * can run a bake the way it runs any other render — one inline graph on the
 * job queue, with per-frame progress and cancellation — while the server-side
 * `bake_model3d_clip` op calls {@link bakeModel3DClipToVideo} directly. Both
 * reach the same producer, so a bake started from the inspector and one
 * started by an agent are the same pixels.
 *
 * The sample list is computed by `@nodetool-ai/timeline`
 * (`computeModel3DBakeSamples`) and passed in whole: the node evaluates no
 * clip of its own, because the clip lives in a document this node never sees.
 */

import { prop } from "@nodetool-ai/node-sdk";
import { BaseNode } from "@nodetool-ai/node-sdk";
import { bytesToBase64 } from "@nodetool-ai/nodes-utils";
import { loadMediaRefBytes } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import { bakeModel3DClipToVideo, type Model3DBakeRequest } from "../bake.js";
import { DEFAULT_MODEL_3D } from "./defaults.js";
import type { ModelBytesRefLike } from "@nodetool-ai/nodes-utils";
import type { BakeCameraParams } from "../job.js";
import { runBlenderNodeStep } from "./blender-error.js";
import { blenderProgressHandler } from "./progress.js";

const NODE_NAME = "nodetool.blender.BakeTimelineClip";

type BakeTimelineClipOutputs = {
  video: { type: string; uri: string; asset_id: null; data: string };
};

function timeoutMessage(timeoutMs: number): string {
  return (
    `${NODE_NAME}: the bake timed out after ${timeoutMs}ms. ` +
    `Lower the samples, use EEVEE, shorten the clip, or raise the timeout.`
  );
}

export class BakeTimelineClipNode extends BaseNode {
  static readonly nodeType = NODE_NAME;
  static readonly title = "Bake 3D Timeline Clip";
  static readonly description =
    "Render one timeline 3D clip to video with Blender, one still per output frame at the clip's own model time and camera.\n    3d, timeline, bake, blender, render, video";
  static readonly hidden = true;
  static readonly metadataOutputTypes = {
    video: "video"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["model"];

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The glTF the clip draws (GLB or glTF with embedded buffers)"
  })
  declare model: ModelBytesRefLike;

  @prop({
    type: "list",
    default: [],
    title: "Frame Times",
    description:
      "Model time in seconds for each output frame, already resolved for the clip's in point, speed, time remap and animation speed"
  })
  declare frame_times: unknown;

  @prop({
    type: "list",
    default: [],
    title: "Cameras",
    description:
      "The camera of each output frame, in the render_animation camera vocabulary; one entry per frame time"
  })
  declare cameras: unknown;

  @prop({
    type: "str",
    default: "",
    title: "Animation Name",
    description:
      "glTF animation to play; empty leaves every animation playing, which is what a 3D clip does by default"
  })
  declare animation_name: string;

  @prop({ type: "int", default: 1920, title: "Width", description: "Output video width in pixels", min: 16, max: 4096 })
  declare width: number;

  @prop({ type: "int", default: 1080, title: "Height", description: "Output video height in pixels", min: 16, max: 4096 })
  declare height: number;

  @prop({ type: "int", default: 30, title: "FPS", description: "Sequence frames per second; the bake plays at this rate", min: 1, max: 120 })
  declare fps: number;

  @prop({ type: "int", default: 1800, title: "Timeout", description: "Maximum bake time in seconds", min: 1, max: 7200 })
  declare timeout: number;

  async process(context?: ProcessingContext): Promise<BakeTimelineClipOutputs> {
    if (!context) {
      throw new Error(
        `${NODE_NAME}: a bake needs a processing context with a workspace.`
      );
    }
    // `asset://` is how the browser names the clip's glTF, which the media-ref
    // reader dereferences and `resolveModelBytes` does not.
    // SAFETY: `model` is declared as a model3d prop, so the graph only ever
    // binds a media ref or nothing; the reader reads these three fields and
    // treats every one of them as optional, and an empty object yields no
    // bytes, which the next check refuses by name.
    const bytes = await loadMediaRefBytes(
      (this.model ?? {}) as {
        data?: Uint8Array | string;
        uri?: string;
        asset_id?: string | null;
      },
      context
    );
    if (!bytes || bytes.length === 0) {
      throw new Error(
        `${NODE_NAME}: model input is empty — connect the clip's glTF (GLB)`
      );
    }
    // SAFETY: guarded by the `Array.isArray` above, and every element goes
    // through `Number()` before the finite check below, so an element of any
    // type is either a number or refused.
    const frameTimes = Array.isArray(this.frame_times)
      ? (this.frame_times as unknown[]).map((value) => Number(value))
      : [];
    if (frameTimes.length === 0 || frameTimes.some((t) => !Number.isFinite(t))) {
      throw new Error(
        `${NODE_NAME}: frame_times must be a non-empty list of finite seconds.`
      );
    }
    // SAFETY: guarded by the `Array.isArray` above. The entries are the
    // camera DTOs `computeModel3DBakeSamples` built, and the op validates
    // their count against `frame_times` and reads each field with a default,
    // so a malformed entry is refused there rather than here.
    const cameras = Array.isArray(this.cameras)
      ? (this.cameras as BakeCameraParams[])
      : [];

    const timeoutMs = Math.max(1, Number(this.timeout ?? 1800)) * 1000;
    const request: Model3DBakeRequest = {
      frameTimes,
      cameras,
      width: Math.max(1, Math.round(Number(this.width ?? 1920))),
      height: Math.max(1, Math.round(Number(this.height ?? 1080))),
      fps: Math.max(1, Math.round(Number(this.fps ?? 30)))
    };
    // An empty prop is "no selection", which leaves every animation playing.
    const animationName = String(this.animation_name ?? "").trim();
    if (animationName) request.animationName = animationName;
    return runBlenderNodeStep(
      {
        nodeName: NODE_NAME,
        timeoutMessage: timeoutMessage(timeoutMs),
        signal: context.signal
      },
      async () => {
        const baked = await bakeModel3DClipToVideo(context, bytes, request, {
          timeoutMs,
          signal: context.signal,
          onProgress: blenderProgressHandler(context, this.__node_id)
        });
        return {
          video: {
            type: "video",
            uri: "",
            asset_id: null,
            data: bytesToBase64(baked.video)
          }
        };
      }
    );
  }
}

export const BLENDER_BAKE_NODES = [BakeTimelineClipNode] as const;
