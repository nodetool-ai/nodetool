/**
 * `nodetool.blender.RenderImage` — glTF scene + camera → image via Blender.
 *
 * Stage 1b: the `render_image` op over `LocalBlenderRunner` (D8). Takes a
 * `Model3DRef`, builds the versioned `BlenderJob`, and returns an inline
 * image ref like `RenderToImage`, so downstream save nodes decide
 * persistence. Camera props reuse the `RenderToImage` vocabulary; the
 * background defaults to studio gray rather than white because a white
 * model on a white background renders invisible under a standard view
 * transform.
 *
 * Every failure rethrows with the node name prefixed. An abort through
 * `context.signal` passes through unwrapped so the node rejects with the
 * abort reason and no partial output.
 */

import { prop } from "@nodetool-ai/node-sdk";
import { bytesToBase64, resolveModelBytes } from "@nodetool-ai/nodes-utils";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import type { BlenderEngine, CameraMode, LightingPreset } from "../job.js";
import { BlenderJobError } from "../runner.js";
import { runBlenderJob } from "../run-job.js";
import { rethrowBlenderError } from "./blender-error.js";
import { blenderProgressHandler } from "./progress.js";
import { BlenderRenderBase } from "./render-base.js";

const NODE_NAME = "nodetool.blender.RenderImage";

/** Output handle RenderImageNode.process() emits. */
type RenderImageNodeOutputs = {
  image: { type: string; uri: string; asset_id: null; data: string };
};

/** Blender ran past its wall clock: point at the two knobs that fix it. */
function timeoutMessage(timeoutMs: number): string {
  return (
    `${NODE_NAME}: Blender render timed out after ${timeoutMs}ms. ` +
    `Lower the samples, use EEVEE, or raise the timeout.`
  );
}

export class RenderImageNode extends BlenderRenderBase {
  static readonly nodeType = "nodetool.blender.RenderImage";
  static readonly title = "Render 3D With Blender";
  static readonly description =
    "Render a 3D model (GLB/glTF) to an image with Blender (EEVEE or Cycles) — higher quality than the preview renderer, with scene cameras and lights honored.\n    3d, render, image, camera, light, blender, eevee, cycles, snapshot, thumbnail\n\n    Use cases:\n    - Turn generated 3D models into high-quality images\n    - Render a scene with its authored cameras and lights\n    - Feed rendered views into image models (img2img, upscaling)";
  static readonly metadataOutputTypes = {
    image: "image"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["model"];

  @prop({ type: "int", default: 600, title: "Timeout", description: "Maximum render time in seconds", min: 1, max: 3600 })
  declare timeout: any;

  async process(context?: ProcessingContext): Promise<RenderImageNodeOutputs> {
    const bytes = await resolveModelBytes(
      (this.model ?? {}) as { data?: Uint8Array | string; uri?: string },
      context
    );
    if (bytes.length === 0) {
      throw new Error(
        `${NODE_NAME}: model input is empty — connect a 3D model (GLB)`
      );
    }

    const timeoutMs = Math.max(1, Number(this.timeout ?? 600)) * 1000;
    try {
      const result = await runBlenderJob(
        context,
        bytes,
        {
          op: "render_image",
          params: {
            camera_mode: String(this.camera_mode ?? "auto") as CameraMode,
            azimuth: Number(this.azimuth ?? 45),
            elevation: Number(this.elevation ?? 25),
            fov: Number(this.fov ?? 35),
            zoom: Number(this.zoom ?? 1),
            lighting: String(this.lighting ?? "studio") as LightingPreset,
            light_intensity: Number(this.light_intensity ?? 1),
            background_color: String(this.background_color ?? "#808080"),
            transparent: this.transparent === true,
            engine: String(this.engine ?? "eevee") as BlenderEngine,
            samples: Math.max(1, Math.round(Number(this.samples ?? 16))),
            denoise: this.denoise !== false,
            resolution_percentage: Math.max(
              1,
              Math.round(Number(this.resolution_percentage ?? 100))
            ),
            width: Math.max(1, Math.round(Number(this.width ?? 1024))),
            height: Math.max(1, Math.round(Number(this.height ?? 1024)))
          }
        },
        { image: "render.png" },
        {
          timeoutMs,
          signal: context?.signal,
          onProgress: blenderProgressHandler(context, this.__node_id)
        }
      );
      const png = result.outputs["image"];
      if (!png || png.length === 0) {
        throw new BlenderJobError(
          "missing_output",
          "Blender produced no image bytes."
        );
      }
      return {
        image: {
          type: "image",
          uri: "",
          asset_id: null,
          data: bytesToBase64(png)
        }
      };
    } catch (err) {
      rethrowBlenderError(
        err,
        NODE_NAME,
        timeoutMessage(timeoutMs),
        context?.signal
      );
    }
  }
}

export const BLENDER_RENDER_NODES = [RenderImageNode] as const;
