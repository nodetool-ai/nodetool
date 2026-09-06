/**
 * `bake_model3d_clip` on the server: the clip's samples, Blender, and the
 * video asset the clip then plays (design §D6).
 *
 * The op in `@nodetool-ai/timeline` decides *whether* a bake may run and what
 * hash it is stored under; this is the half that needs bytes and a renderer.
 * It reads the clip's glTF, asks the timeline for one model time and one
 * camera per output frame, hands both to Blender, and persists the muxed MP4
 * as a generation, so a bake shows up in the run's cost and asset trail
 * exactly like `render_model3d` does.
 */

import { randomUUID } from "node:crypto";

import {
  bakeModel3DClipToMp4,
  type BakeCameraParams,
  type Model3DBakeRequest
} from "@nodetool-ai/blender-nodes";
import { animationDurations, parseModel3D } from "@nodetool-ai/model3d";
import {
  model3dBakeCameraParams,
  type Model3DBakeRenderSettings
} from "@nodetool-ai/timeline";
import { computeModel3DBakeSamples } from "@nodetool-ai/timeline/scene";
import type {
  TimelineOpBakeModel3DRequest,
  TimelineOpBakeModel3DResult
} from "@nodetool-ai/timeline/ops";
import { HostBinaryMissingError, loadMediaRefBytes } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";

/**
 * What a bake renders at. EEVEE at 32 samples is the same trade the render
 * nodes default to — a bake is the intended look, not a final-frame Cycles
 * render, and a clip is hundreds of frames rather than one.
 */
const BAKE_RENDER: Model3DBakeRenderSettings = {
  engine: "eevee",
  samples: 32,
  denoise: true,
  resolutionPercentage: 100
};

/** Wall clock for one whole bake: the render loop plus the mux. */
const BAKE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Render one clip and store the result. Throws with the cause named — the op
 * surfaces it to the caller unchanged.
 */
export async function bakeModel3DClipOnServer(
  context: ProcessingContext,
  request: TimelineOpBakeModel3DRequest
): Promise<TimelineOpBakeModel3DResult> {
  const { clip, sequence } = request;
  const assetId = clip.currentAssetId;
  if (!assetId) {
    throw new Error(`Clip "${clip.name}" has no glTF asset to bake.`);
  }
  const bytes = await loadMediaRefBytes(
    { uri: `asset://${assetId}`, asset_id: assetId },
    context
  );
  if (!bytes || bytes.length === 0) {
    throw new Error(`3D model ${assetId} has no stored bytes to bake.`);
  }
  const style = clip.model3dStyle;
  if (!style) {
    throw new Error(`Clip "${clip.name}" has no model3dStyle to bake.`);
  }

  // The animation lengths are what decides where a looped clip wraps and a
  // held one clamps, and they come off the glTF's own sampler accessors.
  const durations = animationDurations(parseModel3D(bytes).json);
  const samples = computeModel3DBakeSamples(clip, sequence, durations);
  const cameras: BakeCameraParams[] = samples.cameras.map((camera) =>
    model3dBakeCameraParams(camera, style, BAKE_RENDER)
  );

  const generationId = randomUUID();
  const generation = await context.runGenerationWith(
    {
      id: generationId,
      provider: "blender",
      capability: "bake_model3d_clip",
      model: "render_animation",
      params: {
        model_id: assetId,
        clip_id: clip.id,
        frames: samples.frameTimes.length,
        fps: sequence.fps,
        width: sequence.width,
        height: sequence.height
      },
      origin: { surface: "capability", tool_call_id: null },
      persist: {
        name: `${clip.name || "clip"}-bake.mp4`,
        mime: "video/mp4"
      }
    },
    async (_provider, signal) => {
      const request: Model3DBakeRequest = {
        frameTimes: samples.frameTimes,
        cameras,
        width: sequence.width,
        height: sequence.height,
        fps: sequence.fps
      };
      // Absent leaves every animation playing, which is what a clip that
      // names none asks for.
      if (style.animation.clipName !== undefined) {
        request.animationName = style.animation.clipName;
      }
      try {
        const baked = await bakeModel3DClipToMp4(context, bytes, request, {
          timeoutMs: BAKE_TIMEOUT_MS,
          signal
        });
        return baked.video;
      } catch (error) {
        // A server with neither Blender nor ffmpeg still serves the op and
        // only fails here; naming the binary is the difference between a fix
        // and a shrug.
        if (error instanceof HostBinaryMissingError) {
          throw new Error(
            `Could not bake clip "${clip.name}": this server has no ` +
              `${error.binary} installed. A bake renders in Blender and muxes ` +
              `with ffmpeg, so it needs both on the machine.`
          );
        }
        throw error;
      }
    },
    { withoutProvider: true }
  );

  const videoAssetId = generation.assets[0]?.asset_id;
  if (!videoAssetId) {
    throw new Error(`The bake of clip "${clip.name}" could not be stored.`);
  }
  return { assetId: videoAssetId, jobId: generationId };
}
